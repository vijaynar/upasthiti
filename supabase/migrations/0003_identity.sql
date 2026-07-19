-- Abhyas V2 — Identity core (Doc 07 §3, Doc 05).
--
-- Scope decisions (2026-07-19, see IMPLEMENTATION_STATUS.md):
--   * Phone OTP is deferred — no `otp_challenges` table yet (would be dead
--     schema). `auth_methods.provider` keeps 'phone'/'email_password' in
--     the CHECK constraint so adding them later is a data change, not a
--     migration; only 'google' and 'email_otp' (magic link) are actually
--     implemented in v1.
--   * `consents.organization_id` has no FK yet — `organizations` doesn't
--     exist until Phase 3. Added via ALTER TABLE once it does.

create table users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  dob date,                          -- drives minor logic (Doc 05 §9)
  locale text not null default 'en', -- en|hi|te in v1
  timezone text not null default 'Asia/Kolkata',
  avatar_path text,                  -- org-independent; storage: user/{id}/...
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table auth_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  provider text not null check (provider in
    ('phone','google','email_otp','email_password')), -- phone/email_password: schema-only, not built (see above)
  provider_uid text not null,        -- Supabase auth.users.id / E.164 phone / email
  guardian_enabled_by uuid references users(id), -- set for minor logins (Doc 05 §9) — unused until phone OTP lands
  verified_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_uid)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  active_org_id uuid,                -- workspace (Doc 05 §7); null = unselected/platform
  refresh_hash text not null,        -- rotated; reuse detection via family
  family_id uuid not null,
  device_label text,
  platform text check (platform in ('web','ios','android')),
  ip_created inet,
  last_seen_at timestamptz,
  mfa_verified_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table guardianships (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null references users(id),
  ward_user_id uuid not null references users(id),
  relationship text not null check (relationship in ('father','mother','guardian')),
  consent_authority boolean not null default true,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  unique (guardian_user_id, ward_user_id),
  check (guardian_user_id <> ward_user_id)
);

create table consents (              -- biometric, minor-login, media, medical...
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null references users(id),
  organization_id uuid,              -- null = platform-level consent; FK added in Phase 3
  kind text not null check (kind in
    ('biometric_face','minor_login','media_publish','medical_access','marketing')),
  granted_by uuid not null references users(id),  -- self or guardian
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  evidence jsonb                     -- policy version, IP, method
);

-- ── Triggers ──────────────────────────────────────────────────

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

-- >=1 verified auth method per user (Doc 07 §3), deferred to end of
-- transaction so resolve-or-create can insert user + first verified
-- method together.
create or replace function assert_user_has_verified_method() returns trigger
language plpgsql as $$
declare
  v_user_id uuid := coalesce(new.user_id, old.user_id);
begin
  if not exists (
    select 1 from auth_methods
    where user_id = v_user_id and verified_at is not null
  ) then
    raise exception 'User % must have at least one verified auth method', v_user_id;
  end if;
  return null;
end;
$$;

create constraint trigger auth_methods_verified_method_required
  after insert or update or delete on auth_methods
  deferrable initially deferred
  for each row execute function assert_user_has_verified_method();

-- ── RLS helper functions (Doc 07 §17) ────────────────────────
-- Extended with current_org()/has_perm()/etc. as their dependent tables
-- land in later phases. Reads session context set by
-- packages/platform/src/db's withRequestContext (set_config, Doc 05 §6).

create or replace function current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ── RLS policies ──────────────────────────────────────────────
-- Identity tables use self-policies only in v1 (Doc 07 §17) — no
-- org-staff read paths yet (those arrive with memberships in Phase 3).

alter table users enable row level security;
create policy users_select_self on users for select
  using (id = current_user_id());
create policy users_update_self on users for update
  using (id = current_user_id());
-- No insert/delete policy for the authenticated role: user rows are
-- created by resolve-or-create (service-role, Doc 13 §2.3 manifest) before
-- a session — and by design never deleted (Doc 07 §1: soft delete via
-- deleted_at, and even that is a service-role-only workflow).

alter table auth_methods enable row level security;
create policy auth_methods_self on auth_methods for all
  using (user_id = current_user_id())
  with check (user_id = current_user_id());

alter table sessions enable row level security;
create policy sessions_select_self on sessions for select
  using (user_id = current_user_id());
create policy sessions_update_self on sessions for update
  using (user_id = current_user_id());
-- No insert policy: sessions are issued by the auth adapter (service-role)
-- during login/refresh, never directly by the authenticated client.

alter table guardianships enable row level security;
create policy guardianships_select_related on guardianships for select
  using (guardian_user_id = current_user_id() or ward_user_id = current_user_id());
-- Insert/update reserved to service-role until the `people` module
-- (Phase 6) adds a proper guardian-adds-child flow.

alter table consents enable row level security;
create policy consents_select_related on consents for select
  using (subject_user_id = current_user_id() or granted_by = current_user_id());
create policy consents_insert_self_granted on consents for insert
  with check (granted_by = current_user_id());
create policy consents_update_self_granted on consents for update
  using (granted_by = current_user_id());

-- ── Grants ────────────────────────────────────────────────────
-- Postgres checks table-level grants BEFORE RLS row-filtering — a policy
-- without a matching grant is a silent no-op (denied for the wrong
-- reason), so these travel together. `anon` gets nothing on identity
-- tables; no INSERT grant on `users`/`sessions` for `authenticated` since
-- those rows are only ever created by the service-role auth adapter
-- (resolve-or-create, login) per the policy comments above.
grant select, update on users to authenticated;
grant select, insert, update, delete on auth_methods to authenticated;
grant select, update on sessions to authenticated;
grant select on guardianships to authenticated;
grant select, insert, update on consents to authenticated;
