-- Abhyas V2 — Multi-tenancy & organization core (Doc 02, Doc 07 §4, §17).
--
-- Scope decisions (2026-07-19, see IMPLEMENTATION_STATUS.md):
--   * RBAC (roles/permissions/membership_roles) lands in Phase 4 — has_perm()
--     doesn't exist yet, so policies here use a coarser interim gate:
--     `branch_id is null` on a caller's own membership ("org-wide member")
--     stands in for "admin-ish" until real permission checks replace it
--     (Doc 02 §4 confirms org-wide membership is the Owner/org-Admin shape).
--   * `organizations.created_by` is NOT in Doc 07's literal schema — added
--     here because org bootstrap (creator becomes the first member) needs
--     something to key the one-time self-insert membership policy off of,
--     and `membership_roles`/Owner role don't exist until Phase 4.
--   * Provisioning runs as the creating user under withRequestContext (real
--     session, real RLS), not the service-role client — the insert policies
--     below are ordered to make that work: org insert (self-check via
--     created_by) → org-wide active membership insert (self-check via
--     org.created_by) → Main branch insert (now unlocked by
--     is_org_wide_member()). One DB transaction (withRequestContext already
--     wraps BEGIN/COMMIT), atomic without needing RLS-bypass. Trial
--     subscription / ledger accounts (Doc 02 §9) don't exist until the
--     Finance phase, so are not created here.
--   * org_domains is schema-only in v1 (Doc 02 §10 Tier 2) — no write
--     endpoints, but still needs RLS + a policy to pass the coverage gate.

create table organizations (
  id uuid primary key default gen_random_uuid(),
  org_type text not null check (org_type in ('independent_coach','academy','school',
    'music','dance','yoga','tuition','corporate','other')),
  name text not null,
  slug text not null unique,         -- marketplace/URL identity
  status text not null default 'pending' check (status in
    ('pending','active','suspended','archived')),  -- verification gate (Doc 02 §9)
  verified_at timestamptz, verified_by uuid references users(id),
  default_currency char(3) not null default 'INR',
  country_code char(2) not null default 'IN',
  timezone text not null default 'Asia/Kolkata',
  settings jsonb not null default '{}',  -- guardian_visibility, alert_floor, ui_language…
  created_by uuid references users(id),  -- bootstrap only, see note above
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null default 'Main',
  status text not null default 'active' check (status in ('active','archived')),
  geo jsonb,                         -- address, lat/lng, geofence radius (QR check-in)
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),   -- NULL = org-wide (Doc 02 §4)
  status text not null default 'invited' check (status in
    ('invited','active','suspended','left')),
  invited_by uuid references users(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  phone text, email text,            -- at least one; matched to auth_methods on accept
  role_keys text[] not null,         -- roles to grant on acceptance (Doc 04 §8) — not applied until Phase 4
  token_hash text not null unique,
  invited_by uuid not null references users(id),
  expires_at timestamptz not null, accepted_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  requester_user_id uuid not null references users(id),
  subject_user_id uuid not null references users(id), -- self, or ward (parent requesting for child)
  requested_role text not null default 'student' check (requested_role in
    ('student','coach','assistant_coach')),           -- staff requests need staff approvers (Doc 04 §8)
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  decided_by uuid references users(id), decided_at timestamptz, decision_note text,
  created_at timestamptz not null default now()
);

create table org_branding (
  organization_id uuid primary key references organizations(id),
  logo_path text, colors jsonb, display_name text, updated_at timestamptz
);

create table org_domains (  -- V2 build, v1 schema (Doc 02 §10 Tier 2)
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  hostname text not null unique, verified_at timestamptz, created_at timestamptz not null default now()
);

-- ── consents FK (deferred from migration 0003) ─────────────────
alter table consents
  add constraint consents_organization_id_fkey foreign key (organization_id) references organizations(id);

-- ── Triggers ──────────────────────────────────────────────────

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

-- ── RLS helper functions (Doc 07 §17) ────────────────────────
-- has_perm()/has_perm_branch() need the roles/permissions catalogue and
-- land in Phase 4; the functions below are the subset that only depend on
-- tables that exist as of this migration.

create or replace function current_org() returns uuid
language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;

-- NULL = org-wide scope for the caller's own membership in `org`; also
-- NULL (indistinguishable) if the caller has no active membership there —
-- callers that need to tell those apart should check membership existence
-- separately (e.g. is_org_wide_member()).
create or replace function my_branch_scope(org uuid) returns uuid
language sql stable as $$
  select branch_id from memberships
  where organization_id = org and user_id = current_user_id() and status = 'active'
  limit 1
$$;

-- Interim "admin-ish" gate (see file header) — true if the caller holds an
-- org-wide (branch_id is null), active membership in `org`. Only ever
-- evaluates the caller's own row, so it's safe under memberships' self-only
-- SELECT policy (no recursion / no need for org-staff visibility yet).
create or replace function is_org_wide_member(org uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from memberships
    where organization_id = org and user_id = current_user_id()
      and branch_id is null and status = 'active'
  )
$$;

-- ── RLS policies ──────────────────────────────────────────────

alter table organizations enable row level security;
-- Any authenticated user may create an org (tenancy-rbac's createOrganization
-- then self-inserts the org-wide membership + Main branch in the same
-- transaction, see file header) — Doc 02 §9 "signup never auto-assigns a
-- role or org" still holds since no role is granted here, just membership.
create policy organizations_insert_any on organizations for insert
  with check (created_by = current_user_id());
-- `created_by = current_user_id()` (not just membership) matters: Postgres
-- requires INSERT ... RETURNING to also pass the table's SELECT policy, and
-- at the moment organizations is inserted no membership row exists yet
-- (that's the very next statement in the bootstrap transaction) — without
-- this clause `returning id` on the creating insert would itself fail RLS.
create policy organizations_select_member on organizations for select
  using (
    created_by = current_user_id()
    or exists (select 1 from memberships where organization_id = organizations.id and user_id = current_user_id())
  );
-- No WITH CHECK restricting `status`/`verified_*`/`created_by` here — those
-- are locked out at the GRANT level instead (see below), since RLS's
-- WITH CHECK only sees the NEW row and can't cheaply assert "unchanged from
-- OLD" for a handful of columns among many. Self-service org-wide members
-- must never be able to flip their own org from 'pending' to 'active'
-- (platform verification gate, Doc 02 §9).
create policy organizations_update_org_wide_member on organizations for update
  using (is_org_wide_member(id));

alter table branches enable row level security;
create policy branches_select_member on branches for select
  using (
    exists (select 1 from memberships where organization_id = branches.organization_id and user_id = current_user_id())
  );
create policy branches_insert_org_wide_member on branches for insert
  with check (is_org_wide_member(organization_id));
create policy branches_update_org_wide_member on branches for update
  using (is_org_wide_member(organization_id));

alter table memberships enable row level security;
-- Self-only in v1 (see file header comment on the Phase 3 scope note) — org
-- staff member-list views are deferred (People/RBAC phases). This is
-- sufficient for the workspace switcher and for is_org_wide_member() checks,
-- which only ever look at the caller's own row.
create policy memberships_select_self on memberships for select
  using (user_id = current_user_id());
-- One-time bootstrap self-insert: only into an org the caller just created,
-- only as the org-wide member (see created_by note above). Invitation
-- acceptance and join-request approval both create OTHER users' membership
-- rows and go through the service-role client instead (cross-actor writes,
-- Doc 13 §2.3).
create policy memberships_insert_self_as_creator on memberships for insert
  with check (
    user_id = current_user_id()
    and branch_id is null
    and status = 'active'
    and exists (select 1 from organizations o where o.id = organization_id and o.created_by = current_user_id())
  );
-- Self-service is narrowed to "leave the org" only — WITH CHECK constrains
-- the resulting row, but can't stop a single UPDATE from also touching
-- other columns, so the real lock is the column-level GRANT below (only
-- `status` is grantable to `authenticated`, so `branch_id`/`organization_id`
-- writes fail at the grammar level before RLS even runs).
create policy memberships_leave_self on memberships for update
  using (user_id = current_user_id())
  with check (user_id = current_user_id() and status = 'left');

alter table invitations enable row level security;
create policy invitations_select_org_wide_member on invitations for select
  using (is_org_wide_member(organization_id));
create policy invitations_insert_org_wide_member on invitations for insert
  with check (is_org_wide_member(organization_id) and invited_by = current_user_id());
-- Revoke-only: WITH CHECK forces revoked_at to be set, and the GRANT below
-- restricts the column set to just `revoked_at` so an org-wide member can't
-- also rewrite an existing invitation's email/phone/role_keys in the same
-- statement.
create policy invitations_revoke_org_wide_member on invitations for update
  using (is_org_wide_member(organization_id))
  with check (is_org_wide_member(organization_id) and revoked_at is not null);
-- No select-by-invitee policy: an unauthenticated/not-yet-member invitee
-- resolves their invitation by token via a service-role lookup in
-- tenancy-rbac's acceptInvitation, not a client-side RLS-gated select.

alter table join_requests enable row level security;
create policy join_requests_select_related on join_requests for select
  using (requester_user_id = current_user_id() or is_org_wide_member(organization_id));
-- subject_user_id = requester_user_id (self only) in v1: without this, a
-- requester could name an arbitrary other user as subject_user_id, and an
-- org admin approving the request (decideJoinRequest grants membership to
-- subject_user_id) would hand that victim an org membership they never
-- consented to. Guardian-requests-for-a-ward (Doc 02 §9 "I'm a
-- parent/student") needs is_my_ward()-backed RLS, which doesn't exist until
-- guardianship-aware policies land (People module, Phase 6) — deferred.
create policy join_requests_insert_self on join_requests for insert
  with check (requester_user_id = current_user_id() and subject_user_id = current_user_id());
-- Two UPDATE policies, deliberately narrow: multiple permissive policies for
-- the same command OR-combine both USING *and* WITH CHECK in Postgres, so
-- each one's WITH CHECK must independently restrict what it allows — an
-- unrestricted WITH CHECK on either policy would let the other actor ride
-- along on it (e.g. a requester setting status='approved' themselves).
create policy join_requests_decide_org_wide_member on join_requests for update
  using (is_org_wide_member(organization_id) and status = 'pending')
  with check (is_org_wide_member(organization_id) and status in ('approved', 'rejected') and decided_by = current_user_id());
create policy join_requests_withdraw_self on join_requests for update
  using (requester_user_id = current_user_id() and status = 'pending')
  with check (requester_user_id = current_user_id() and status = 'withdrawn');

alter table org_branding enable row level security;
create policy org_branding_select_member on org_branding for select
  using (
    exists (select 1 from memberships where organization_id = org_branding.organization_id and user_id = current_user_id())
  );
create policy org_branding_upsert_org_wide_member on org_branding for insert
  with check (is_org_wide_member(organization_id));
create policy org_branding_update_org_wide_member on org_branding for update
  using (is_org_wide_member(organization_id));

alter table org_domains enable row level security;
-- Read-only from the client in v1 (schema-only feature, see file header);
-- writes are service-role/platform-admin tooling once V2's white-label
-- rollout builds them (Doc 02 §10 Tier 2).
create policy org_domains_select_member on org_domains for select
  using (
    exists (select 1 from memberships where organization_id = org_domains.organization_id and user_id = current_user_id())
  );

-- ── Grants ────────────────────────────────────────────────────
-- Postgres checks table-level grants before RLS (see migration 0003's
-- note) — grants and policies travel together. Column-level grants are used
-- wherever the WITH CHECK above can't itself lock down every sensitive
-- column: broad statement-level grants would let an update pass RLS's
-- WITH CHECK and silently smuggle changes through columns the policy never
-- considered (e.g. an org-wide member flipping their own org's `status` via
-- the same UPDATE that changes `name`).
grant select, insert on organizations to authenticated;
grant update (name, slug, default_currency, country_code, timezone, settings) on organizations to authenticated;
grant select, insert on branches to authenticated;
grant update (name, status, geo) on branches to authenticated;
grant select, insert on memberships to authenticated;
grant update (status) on memberships to authenticated;  -- self-leave only, see policy comment above
grant select, insert on invitations to authenticated;
grant update (revoked_at) on invitations to authenticated;  -- revoke-only, see policy comment above
grant select, insert on join_requests to authenticated;
grant update (status, decided_by, decided_at, decision_note) on join_requests to authenticated;
grant select, insert on org_branding to authenticated;
grant update (logo_path, colors, display_name, updated_at) on org_branding to authenticated;
grant select on org_domains to authenticated;

-- ── Indexes (Doc 07 §18 — composite indexes lead with organization_id) ──
create index branches_organization_id_idx on branches (organization_id);
create index memberships_user_id_idx on memberships (user_id);
create index memberships_organization_id_idx on memberships (organization_id, status);
create index invitations_organization_id_idx on invitations (organization_id, revoked_at, accepted_at);
create index organizations_created_by_idx on organizations (created_by) where created_by is not null;
create index join_requests_organization_id_idx on join_requests (organization_id, status);
create index join_requests_requester_idx on join_requests (requester_user_id);
create index org_domains_organization_id_idx on org_domains (organization_id);
