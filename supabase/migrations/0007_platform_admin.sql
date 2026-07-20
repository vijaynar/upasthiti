-- Abhyas V2 — Platform Administration (Doc 04 §3/§9, Doc 07 §15/§16/§17).
--
-- Scope decisions (2026-07-20, see IMPLEMENTATION_STATUS.md Phase 5):
--   * has_platform_perm() is the platform-scope equivalent of migration
--     0006's has_perm() — checks platform_role_assignments -> role_permissions
--     instead of memberships -> membership_roles -> role_permissions, and is
--     NOT parameterized by current_org() (platform actions aren't org-scoped;
--     SessionContext.orgId is null for a platform-console session, Doc 05 §6).
--     No seed data changes needed here — migration 0006 already seeded the
--     full platform-role permission catalogue (super_admin/verification_ops/
--     support/platform_finance/marketplace_partner) as forward-compatible
--     reference data; this migration is the first thing that actually reads it.
--   * New tables (Doc 07 §15/§16 core columns only): feature_flags,
--     org_feature_flags, announcements, plans, subscriptions, audit_log.
--     Doc 07 §21.5's console-wireframe extras (dlt_templates, dsr_requests,
--     plans.limits/version, feature_flags.rollout) depend on modules that
--     don't exist yet (messaging vendor, DPDP tooling) — deliberately not
--     built here, same "schema follows the module that needs it" precedent
--     as org_domains (migration 0004) and coach_assignments.batch_id FK
--     (migration 0006). Add them when Messaging/Notifications (Phase 10) or
--     a dedicated compliance pass needs them.
--   * organizations.status gets a 5th value, 'rejected' (migration 0004's
--     check constraint only had pending/active/suspended/archived) — Doc 07's
--     literal enum doesn't include a terminal "verification declined" state,
--     but the wireframe's verification queue (4a) explicitly has an
--     Invited/In-verification/Active/**Rejected** pipeline stage and Doc 04
--     US-1 AC5 needs somewhere for a declined org to land that isn't
--     'archived' (which implies it was active first) or a bare 'pending'
--     (which would silently re-enter the queue). Interpretive call, flagged
--     per this project's convention for filling matrix/schema gaps the docs
--     don't spell out (see migration 0006's header comment for precedent).
--   * audit_log has NO insert grant for `authenticated` — every write goes
--     through write_audit_log(), a SECURITY DEFINER function, so app code
--     can never forge an audit row's actor_user_id (always current_user_id())
--     or skip logging by construction. This migration only wires the new
--     Phase 5 write paths (org verify/suspend, platform role grant/revoke,
--     support-grant request/revoke, feature-flag/announcement writes) into
--     it; retrofitting Phase 2-4's role-grant/invitation-accept call sites
--     with audit_log calls is a known gap, not blocking (Doc 07 §16 says
--     every privileged action logs, so this is real debt — just not Phase 5
--     scope, which is the console that reads/writes the NEW platform tables).
--   * support_grant_active() (defined in migration 0006, unused until now)
--     is wired into organizations/memberships SELECT as an additive
--     permissive policy (Postgres OR's multiple permissive policies for the
--     same command together, so this doesn't touch the existing
--     organizations_select_member/memberships_select_self/_staff policies).
--     Scoped to just these two tables — enough for the wireframe's "org 360
--     view" (org identity + roster count) under a support grant; People's
--     real roster/enrollment tables (Phase 6) will need their own
--     support_grant_active() policies when they're created, not retrofitted
--     here. Doc 04 §9.3's "writes restricted to a support-safe subset (no
--     money movement, no role grants)" has no write surface to restrict yet
--     either — Phase 5 only wires the READ path a grant unlocks; support
--     staff get no INSERT/UPDATE policies on org tables via this migration.
--   * support_access_grants has no INSERT/UPDATE RLS policy for
--     `authenticated` (migration 0006 note: "the request/approve workflow is
--     Platform Admin tooling, service-role"). The schema itself has no
--     separate "pending approval" shape (no status/approver_id column) — a
--     row's existence IS the grant, so "request" and "grant" collapse into
--     one action, gated app-side by has_platform_perm('platform.support.request_access')
--     (packages/modules/platform-admin/src/service.ts's requestSupportAccess),
--     not a two-step human-approval flow. Revoke sets revoked_at, same
--     service-role path.

-- ── organizations.status: add 'rejected' ─────────────────────────

alter table organizations drop constraint organizations_status_check;
alter table organizations add constraint organizations_status_check
  check (status in ('pending','active','suspended','archived','rejected'));

-- ── has_platform_perm() (Doc 07 §17-style helper, platform scope) ──

create or replace function has_platform_perm(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from platform_role_assignments pra
    join role_permissions rp on rp.role_id = pra.role_id
    where pra.user_id = current_user_id()
      and rp.permission_key = perm
  )
$$;

-- ── Tables (Doc 07 §15/§16) ───────────────────────────────────────

create table feature_flags (
  key text primary key,
  default_on boolean not null default false,
  description text
);

create table org_feature_flags (
  organization_id uuid not null references organizations(id) on delete cascade,
  flag_key text not null references feature_flags(key),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, flag_key)
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  audience text not null default 'all' check (audience in ('all','org_admins','platform_staff')),
  title text not null,
  body text not null,
  published_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  strategy text not null check (strategy in ('flat_tier','per_active_student','per_staff_seat')),
  pricing jsonb not null default '{}',
  status text not null default 'active' check (status in ('active','deprecated')),
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status text not null check (status in ('trial','active','past_due','suspended','cancelled')),
  trial_ends_at timestamptz,
  current_period_start date,
  current_period_end date,
  negotiated_overrides jsonb,
  created_at timestamptz not null default now()
);

-- Append-only (Doc 07 §16). No `id` PK alone — (id, occurred_at) matches the
-- doc's literal shape, partition-ready by occurred_at (Doc 15 §6) even
-- though no partitioning is set up yet in v1 (single table is fine at
-- current scale; revisit per Doc 15 §15 when it matters).
create table audit_log (
  id uuid not null default gen_random_uuid(),
  organization_id uuid references organizations(id),
  actor_user_id uuid references users(id),
  actor_session_id uuid,
  support_grant_id uuid references support_access_grants(id),
  action text not null,
  target_type text,
  target_id uuid,
  detail jsonb,
  occurred_at timestamptz not null default now(),
  primary key (id, occurred_at)
);

-- ── write_audit_log() — the only insert path (Doc 07 §16) ────────
-- SECURITY DEFINER so actor_user_id is always current_user_id() (never a
-- caller-supplied value) and `authenticated` never needs a direct INSERT
-- grant on audit_log itself. p_org null = platform-scope action.
create or replace function write_audit_log(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_org uuid default null,
  p_detail jsonb default null,
  p_support_grant_id uuid default null
) returns uuid
language sql security definer set search_path = public as $$
  insert into audit_log (organization_id, actor_user_id, support_grant_id, action, target_type, target_id, detail)
  values (p_org, current_user_id(), p_support_grant_id, p_action, p_target_type, p_target_id, p_detail)
  returning id
$$;

-- ── RLS ────────────────────────────────────────────────────────

alter table feature_flags enable row level security;
-- Flags aren't secret (client needs to resolve them); write is platform-managed.
create policy feature_flags_select_all on feature_flags for select using (true);
create policy feature_flags_insert_permitted on feature_flags for insert
  with check (has_platform_perm('platform.flag.manage'));
create policy feature_flags_update_permitted on feature_flags for update
  using (has_platform_perm('platform.flag.manage'));
create policy feature_flags_delete_permitted on feature_flags for delete
  using (has_platform_perm('platform.flag.manage'));

alter table org_feature_flags enable row level security;
create policy org_feature_flags_select_visible on org_feature_flags for select
  using (organization_id = current_org() or has_platform_perm('platform.flag.manage'));
create policy org_feature_flags_insert_permitted on org_feature_flags for insert
  with check (has_platform_perm('platform.flag.manage'));
create policy org_feature_flags_update_permitted on org_feature_flags for update
  using (has_platform_perm('platform.flag.manage'));
create policy org_feature_flags_delete_permitted on org_feature_flags for delete
  using (has_platform_perm('platform.flag.manage'));

alter table announcements enable row level security;
-- No per-org targeting in v1 (audience is a coarse enum, not organization_id)
-- — visible to any authenticated user; org_admins/platform_staff audience
-- values are a UI filter hint, not an RLS boundary, until real targeting
-- is needed.
create policy announcements_select_all on announcements for select using (true);
create policy announcements_insert_permitted on announcements for insert
  with check (has_platform_perm('platform.announce'));
create policy announcements_update_permitted on announcements for update
  using (has_platform_perm('platform.announce'));
create policy announcements_delete_permitted on announcements for delete
  using (has_platform_perm('platform.announce'));

alter table plans enable row level security;
create policy plans_select_all on plans for select using (true);
create policy plans_insert_permitted on plans for insert
  with check (has_platform_perm('platform.subscription.manage'));
create policy plans_update_permitted on plans for update
  using (has_platform_perm('platform.subscription.manage'));

alter table subscriptions enable row level security;
create policy subscriptions_select_visible on subscriptions for select
  using (
    (organization_id = current_org() and has_perm('org.billing.read'))
    or has_platform_perm('platform.subscription.manage')
  );
create policy subscriptions_insert_permitted on subscriptions for insert
  with check (has_platform_perm('platform.subscription.manage'));
create policy subscriptions_update_permitted on subscriptions for update
  using (has_platform_perm('platform.subscription.manage'));

alter table audit_log enable row level security;
-- No INSERT/UPDATE/DELETE policy for `authenticated` at all — write_audit_log()
-- is SECURITY DEFINER and bypasses RLS for its own insert (Doc 07 §16 "No
-- UPDATE/DELETE grants for any role").
create policy audit_log_select_visible on audit_log for select
  using (
    (organization_id = current_org() and has_perm('audit.log.read'))
    or has_platform_perm('platform.audit.read')
  );

-- ── support_access_grants: platform-visible list for the console ──
-- migration 0006 already has support_access_grants_select_related
-- (grantee + org owner). Add the platform-staff view (Doc 04 §9 "grantee
-- user_id ... target org" needs to be listable by whoever can grant it).
create policy support_access_grants_select_platform on support_access_grants for select
  using (has_platform_perm('platform.support.request_access'));

-- ── support_grant_active() wired into org-data reads (Doc 04 §9.3) ──
-- Additive permissive policies — OR with the existing member-only SELECT
-- policies on these two tables, don't replace them.
create policy organizations_select_support_grant on organizations for select
  using (support_grant_active(id));
create policy memberships_select_support_grant on memberships for select
  using (support_grant_active(organization_id));

-- ── Grants ────────────────────────────────────────────────────

grant select, insert, update, delete on feature_flags to authenticated;
grant select, insert, update, delete on org_feature_flags to authenticated;
grant select, insert, update, delete on announcements to authenticated;
grant select, insert, update on plans to authenticated;
grant select, insert, update on subscriptions to authenticated;
grant select on audit_log to authenticated;
grant execute on function write_audit_log(text, text, uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function has_platform_perm(text) to authenticated;

-- ── Indexes ───────────────────────────────────────────────────

create index org_feature_flags_organization_id_idx on org_feature_flags (organization_id);
create index announcements_published_at_idx on announcements (published_at desc);
create index subscriptions_organization_id_idx on subscriptions (organization_id);
create index audit_log_organization_id_occurred_at_idx on audit_log (organization_id, occurred_at desc);
create index audit_log_actor_user_id_idx on audit_log (actor_user_id);
create index audit_log_action_idx on audit_log (action);
