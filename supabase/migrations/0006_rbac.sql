-- Abhyas V2 — RBAC & Schema Completion (Doc 04 §12, Doc 07 §5, §17).
--
-- Scope decisions (2026-07-20, see IMPLEMENTATION_STATUS.md):
--   * Real has_perm()/has_perm_branch() land here and DROP+replace every
--     is_org_wide_member() gated policy added as an interim stand-in in
--     migration 0004 (Phase 3) — see the "Replace migration 0004's interim
--     policies" section below. This can't be an in-place edit of 0004
--     itself even though 0004 is uncommitted (Doc 02 §11 big-bang rebuild,
--     no compatibility shims would normally argue for editing history
--     directly): membership_roles/role_permissions have FKs into
--     organizations/memberships (0004's tables), so RBAC schema must be
--     created AFTER tenancy schema — has_perm() can't be defined inside
--     0004 without forward-referencing tables that don't exist yet.
--   * coach_assignments.batch_id has no FK yet — `batches` doesn't exist
--     until Scheduling (Phase 7); the FK is added there. Built with the
--     Doc 04 §21.1 addendum's final shape (`role`, `days`) directly, not
--     the superseded `kind` column, since this is the first migration to
--     create the table.
--   * is_my_ward() / the P4 guardian RLS shape is NOT built here — it needs
--     `enrollments` (People module, Phase 6) to know whether a ward is
--     actually enrolled in the target org. `guardianships` already exists
--     (Phase 2) but stays unread by RLS until then.
--   * Platform-scope permission checks (an equivalent of has_perm() for
--     `platform_role_assignments`) are not built here either — no
--     platform-scoped table exists yet for one to gate (Platform Admin,
--     Phase 5). platform_role_assignments/roles/permissions/role_permissions
--     ARE seeded now (Doc 04 §5's platform-role matrix, same seed step as
--     the org matrix) as forward-compatible reference data.
--   * The permission catalogue + system roles + role_permissions are
--     platform reference data, versioned by migration (Doc 04 §4) — NOT
--     supabase/seed.sql, which is local-fixture-only and never applied to
--     hosted projects (Doc 17 §4).
--   * Translating the Doc 04 §5 access-matrix's ✅/🔷/👁 markers into exact
--     permission-key bundles per role required interpretive judgment calls
--     in a handful of places the matrix doesn't spell out permission-key
--     granularity for (e.g. "check-in only" for Front Desk, "own listing"
--     for Coach, HR "🔷 branch 👁" has no read-only HR permission key to
--     grant). Two permission keys were added beyond the Doc 04 §4 catalogue
--     table because the matrix explicitly needs a narrower key than what's
--     listed: `people.join_request.read` (Front Desk "🔷 join intake" needs
--     visibility without approval authority) and `finance.proof.submit`
--     (Front Desk/Accountant/branch staff "proof intake" needs a lesser
--     action than `finance.proof.approve`). Re-derive from this migration's
--     role_permissions INSERT if the matrix is revised, not from memory.

-- ── Tables (Doc 04 §12, Doc 07 §5) ──────────────────────────────

create table roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id), -- NULL = system role (always NULL in v1 — Doc 04 §11 custom roles deferred)
  key text not null,
  scope text not null check (scope in ('platform','org')),
  unique nulls not distinct (organization_id, key)
);

create table permissions (
  key text primary key
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key),
  primary key (role_id, permission_key)
);

create table membership_roles (
  membership_id uuid not null references memberships(id) on delete cascade,
  role_id uuid not null references roles(id),
  granted_by uuid references users(id),
  granted_at timestamptz not null default now(),
  primary key (membership_id, role_id)
);

create table platform_role_assignments (
  user_id uuid not null references users(id),
  role_id uuid not null references roles(id),
  granted_by uuid references users(id),
  granted_at timestamptz not null default now(),
  seed boolean not null default false, -- Doc 07 §5 — undeletable seed super admin
  primary key (user_id, role_id)
);

create table coach_assignments (
  membership_id uuid not null references memberships(id) on delete cascade,
  batch_id uuid not null, -- FK to batches(id) added when Scheduling (Phase 7) creates that table
  role text not null default 'primary' check (role in ('primary','assistant')),
  days smallint[], -- ISO dow 1-7; NULL = all scheduled days (Doc 07 §21.1) — UX scoping only, not an RLS boundary
  primary key (membership_id, batch_id)
);

create table support_access_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  grantee_user_id uuid not null references users(id),
  reason text not null,
  granted_by uuid not null references users(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── RLS helper functions (Doc 07 §17) ────────────────────────────
-- current_user_id()/current_org()/my_branch_scope()/is_org_wide_member()
-- already exist (migrations 0003/0004). is_org_wide_member() is dropped
-- below once migration 0004's policies stop using it. my_branch_scope() is
-- upgraded to SECURITY DEFINER here (unused by any policy as of 0004, so
-- harmless then, but it queries `memberships` — the same landmine
-- has_perm()/has_perm_branch() below hit — so any future P1 policy that
-- calls it needs this in place already, not discovered again the hard way).
create or replace function my_branch_scope(org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from memberships
  where organization_id = org and user_id = current_user_id() and status = 'active'
  limit 1
$$;

-- membership -> membership_role -> role_permissions in current_org(). No
-- org/branch parameter (matches Doc 07 §17's literal signature) — callers
-- combine this with an explicit `organization_id = current_org()` check on
-- the row being accessed (P1 pattern).
--
-- SECURITY DEFINER (Doc 07 §17's literal spec) is not optional here: this
-- function is called FROM RLS policies on memberships/membership_roles
-- itself (e.g. memberships_select_staff below). Without SECURITY DEFINER
-- the internal query below would run as the calling role, re-triggering
-- that same policy, which calls has_perm() again — infinite recursion
-- ("stack depth limit exceeded"), verified empirically while smoke-testing
-- this migration. SECURITY DEFINER makes the internal query run as the
-- function's owner (the migration role, which bypasses RLS), while the
-- actual filtering still comes from current_user_id()/current_org()
-- (session GUCs, unrelated to which role executes the query) — so this
-- doesn't widen what the caller can learn, only what the function's own
-- lookups are allowed to read.
create or replace function has_perm(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from memberships m
    join membership_roles mr on mr.membership_id = m.id
    join role_permissions rp on rp.role_id = mr.role_id
    where m.user_id = current_user_id()
      and m.organization_id = current_org()
      and m.status = 'active'
      and rp.permission_key = perm
  )
$$;

-- Branch-refined has_perm(): true if the caller's active membership in
-- current_org() grants perm AND is org-wide (branch_id is null) or matches
-- branch `b`. A NULL `b` (org-wide target) only matches an org-wide
-- membership, never a branch-scoped one — a Branch Admin cannot act on an
-- org-wide row through this function.
create or replace function has_perm_branch(perm text, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from memberships m
    join membership_roles mr on mr.membership_id = m.id
    join role_permissions rp on rp.role_id = mr.role_id
    where m.user_id = current_user_id()
      and m.organization_id = current_org()
      and m.status = 'active'
      and (m.branch_id is null or m.branch_id = b)
      and rp.permission_key = perm
  )
$$;

-- "Own batches" (Doc 04 §6) — batches assigned to any of the caller's
-- active memberships in current_org(). Unused until Scheduling (Phase 7)
-- populates coach_assignments, but the function is needed now so P2
-- policies in later phases can reference it without another migration.
create or replace function my_batch_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select ca.batch_id
  from coach_assignments ca
  join memberships m on m.id = ca.membership_id
  where m.user_id = current_user_id()
    and m.organization_id = current_org()
    and m.status = 'active'
$$;

-- P5 support-access path (Doc 04 §9, Doc 07 §17) — true if the caller holds
-- an active, unexpired, unrevoked support_access_grants row for `org`.
-- Whether the caller actually holds a platform Support/Super Admin role is
-- enforced at grant-creation time (Platform Admin, Phase 5) — no writer
-- exists yet in this phase, so nothing can create a grant that would make
-- this return true prematurely.
create or replace function support_grant_active(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from support_access_grants
    where organization_id = org
      and grantee_user_id = current_user_id()
      and revoked_at is null
      and expires_at > now()
  )
$$;

-- ── Last-Owner protection (Doc 04 §8.3, Doc 07 §5) ───────────────
-- Two triggers, not one shared function per the doc's pseudocode sketch —
-- BEFORE DELETE on membership_roles and BEFORE UPDATE of memberships.status
-- have different OLD/NEW shapes and are clearer kept separate.

create or replace function assert_owner_remains_on_role_delete() returns trigger
language plpgsql as $$
declare
  v_owner_role_id uuid;
  v_org uuid;
  v_remaining int;
begin
  select id into v_owner_role_id from roles where key = 'owner' and organization_id is null;
  if old.role_id is distinct from v_owner_role_id then
    return old;
  end if;
  select organization_id into v_org from memberships where id = old.membership_id;
  select count(*) into v_remaining
  from membership_roles mr
  join memberships m on m.id = mr.membership_id
  where mr.role_id = v_owner_role_id
    and m.organization_id = v_org
    and m.status = 'active'
    and mr.membership_id <> old.membership_id;
  if v_remaining = 0 then
    raise exception 'Cannot remove the last Owner of organization %', v_org;
  end if;
  return old;
end;
$$;

create trigger membership_roles_protect_last_owner
  before delete on membership_roles
  for each row execute function assert_owner_remains_on_role_delete();

create or replace function assert_owner_remains_on_membership_suspend() returns trigger
language plpgsql as $$
declare
  v_owner_role_id uuid;
  v_remaining int;
begin
  if new.status = old.status or old.status <> 'active' then
    return new;
  end if;
  select id into v_owner_role_id from roles where key = 'owner' and organization_id is null;
  if not exists (select 1 from membership_roles where membership_id = old.id and role_id = v_owner_role_id) then
    return new;
  end if;
  select count(*) into v_remaining
  from membership_roles mr
  join memberships m on m.id = mr.membership_id
  where mr.role_id = v_owner_role_id
    and m.organization_id = old.organization_id
    and m.status = 'active'
    and m.id <> old.id;
  if v_remaining = 0 then
    raise exception 'Cannot deactivate the last Owner of organization %', old.organization_id;
  end if;
  return new;
end;
$$;

create trigger memberships_protect_last_owner
  before update of status on memberships
  for each row execute function assert_owner_remains_on_membership_suspend();

-- ── Seed-super-admin protection (Doc 02 §9, Doc 07 §5) ───────────

create or replace function protect_seed_platform_role() returns trigger
language plpgsql as $$
begin
  if old.seed then
    raise exception 'Cannot remove the seed platform role assignment (user %, role %)', old.user_id, old.role_id;
  end if;
  return old;
end;
$$;

create trigger platform_role_assignments_protect_seed
  before delete on platform_role_assignments
  for each row execute function protect_seed_platform_role();

create or replace function protect_seed_super_admin_user() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and exists (
    select 1 from platform_role_assignments where user_id = old.id and seed = true
  ) then
    raise exception 'Cannot delete the seed super admin user %', old.id;
  end if;
  return new;
end;
$$;

create trigger users_protect_seed_super_admin
  before update of deleted_at on users
  for each row execute function protect_seed_super_admin_user();

-- ── RLS policies ──────────────────────────────────────────────

alter table roles enable row level security;
-- System roles (organization_id is null) are visible to every authenticated
-- user (role names/keys aren't sensitive); org-scoped custom roles (Doc 04
-- §11, unused in v1) are visible only to that org's members. No write grant
-- for `authenticated` — the catalogue is migration-managed reference data.
create policy roles_select_system_or_own_org on roles for select
  using (organization_id is null or organization_id = current_org());

alter table permissions enable row level security;
create policy permissions_select_all on permissions for select using (true);

alter table role_permissions enable row level security;
create policy role_permissions_select_visible on role_permissions for select
  using (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and (r.organization_id is null or r.organization_id = current_org())
    )
  );

alter table membership_roles enable row level security;
-- Visible to the member themselves, or org staff with people.member.read
-- (branch-refined) — same visibility rule as the members list.
create policy membership_roles_select_visible on membership_roles for select
  using (
    exists (
      select 1 from memberships m
      where m.id = membership_roles.membership_id
        and (
          m.user_id = current_user_id()
          or (m.organization_id = current_org() and has_perm_branch('people.member.read', m.branch_id))
        )
    )
  );
-- Bootstrap: the org's creator may grant themselves Owner (and, for
-- independent_coach orgs, Coach) on their own membership — the only way to
-- get a first role into a brand-new org, since granting via people.role.grant
-- itself requires a role that doesn't exist yet on this membership (Doc 02
-- §9 chicken-and-egg, same shape as migration 0004's org/branch/membership
-- self-insert chain). `organizations.created_by` is the same trust anchor
-- already used there and is immutable after insert (no UPDATE grant on that
-- column), so this door only ever opens for the actual founder.
create policy membership_roles_insert_bootstrap_owner on membership_roles for insert
  with check (
    granted_by = current_user_id()
    and role_id in (select id from roles where key in ('owner','coach') and organization_id is null)
    and exists (
      select 1 from memberships m
      join organizations o on o.id = m.organization_id
      where m.id = membership_roles.membership_id
        and m.user_id = current_user_id()
        and o.created_by = current_user_id()
    )
  );
-- Ordinary grant path: staff with people.role.grant (branch-refined) may
-- grant a role to a membership in their scope. Doc 04 §8's finer
-- grant-authority table (who may grant which specific role) is enforced in
-- tenancy-rbac's grantRole() as an app-layer check on top of this — RLS
-- alone can only see "does this permission bit exist", not "is target role
-- X within granter's authority".
create policy membership_roles_insert_granter on membership_roles for insert
  with check (
    granted_by = current_user_id()
    and exists (
      select 1 from memberships m
      where m.id = membership_roles.membership_id
        and m.organization_id = current_org()
        and has_perm_branch('people.role.grant', m.branch_id)
    )
  );
create policy membership_roles_delete_granter on membership_roles for delete
  using (
    exists (
      select 1 from memberships m
      where m.id = membership_roles.membership_id
        and m.organization_id = current_org()
        and has_perm_branch('people.role.revoke', m.branch_id)
    )
  );

alter table platform_role_assignments enable row level security;
-- Self-view only in v1 — no platform console to grant/list org-wide yet
-- (Platform Admin, Phase 5). No write grant for `authenticated`.
create policy platform_role_assignments_select_self on platform_role_assignments for select
  using (user_id = current_user_id());

alter table coach_assignments enable row level security;
-- Schema-only in v1 (same pattern as org_domains, migration 0004): read
-- visibility now, no write grant for `authenticated` until Scheduling
-- (Phase 7) builds the real assignment flow against a real `batches` table.
create policy coach_assignments_select_visible on coach_assignments for select
  using (
    exists (
      select 1 from memberships m
      where m.id = coach_assignments.membership_id
        and (
          m.user_id = current_user_id()
          or (m.organization_id = current_org() and has_perm_branch('people.member.read', m.branch_id))
        )
    )
  );

alter table support_access_grants enable row level security;
-- Grantee sees their own grants; an org's Owner/Admin (org.settings.read)
-- sees grants issued against their org (Doc 04 §9.2 "org Owner notified and
-- can see active + historical grants"). No write grant for `authenticated`
-- — the request/approve workflow is Platform Admin tooling (Phase 5,
-- service-role), not a direct client insert.
create policy support_access_grants_select_related on support_access_grants for select
  using (
    grantee_user_id = current_user_id()
    or (organization_id = current_org() and has_perm('org.settings.read'))
  );

-- ── Extend migration 0004's tables (Doc 04 §5 "Members & roles" row) ──
-- Org staff with people.member.read/suspend get broader visibility/action
-- than the self-only policies migration 0004 shipped with (that migration's
-- own comment deferred this to "People/RBAC phases" — it lands here, not
-- People, because it's gated by the has_perm_branch() this migration adds).

create policy memberships_select_staff on memberships for select
  using (organization_id = current_org() and has_perm_branch('people.member.read', branch_id));
create policy memberships_update_staff on memberships for update
  using (organization_id = current_org() and has_perm_branch('people.member.suspend', branch_id))
  with check (
    organization_id = current_org()
    and has_perm_branch('people.member.suspend', branch_id)
    and status in ('active','suspended')
  );

-- ── Replace migration 0004's interim is_org_wide_member() policies ──
-- has_perm()/has_perm_branch() didn't exist when migration 0004 ran (this
-- migration's own tables have FKs into 0004's, so RBAC schema necessarily
-- lands after tenancy schema) — every policy 0004 built on
-- is_org_wide_member() is dropped and replaced here with the real
-- permission-gated version. See this migration's header comment and 0004's
-- header comment for why this isn't a single in-place edit. Every
-- has_perm()/has_perm_branch() call below is paired with an explicit
-- `organization_id = current_org()` (or, for `organizations` itself,
-- `id = current_org()`) check on the row being accessed (Doc 07 §17 P1
-- pattern) — has_perm() only asks "does current_org()'s membership grant
-- perm", not "does this row belong to current_org()".

drop policy organizations_update_org_wide_member on organizations;
create policy organizations_update_permitted on organizations for update
  using (id = current_org() and has_perm('org.settings.update'));

drop policy branches_insert_org_wide_member on branches;
drop policy branches_update_org_wide_member on branches;
create policy branches_insert_permitted on branches for insert
  with check (organization_id = current_org() and has_perm('org.branch.create'));
create policy branches_update_permitted on branches for update
  using (organization_id = current_org() and has_perm_branch('org.branch.update', id));

drop policy invitations_select_org_wide_member on invitations;
drop policy invitations_insert_org_wide_member on invitations;
drop policy invitations_revoke_org_wide_member on invitations;
create policy invitations_select_permitted on invitations for select
  using (organization_id = current_org() and has_perm_branch('people.member.read', branch_id));
create policy invitations_insert_permitted on invitations for insert
  with check (
    organization_id = current_org()
    and has_perm_branch('people.member.invite', branch_id)
    and invited_by = current_user_id()
  );
-- Revoke-only: WITH CHECK forces revoked_at to be set, and migration 0004's
-- column-level GRANT (update (revoked_at) only) still applies, so a staff
-- member can't also rewrite an existing invitation's email/phone/role_keys
-- in the same statement.
create policy invitations_revoke_permitted on invitations for update
  using (organization_id = current_org() and has_perm_branch('people.member.invite', branch_id))
  with check (
    organization_id = current_org()
    and has_perm_branch('people.member.invite', branch_id)
    and revoked_at is not null
  );

drop policy join_requests_select_related on join_requests;
drop policy join_requests_decide_org_wide_member on join_requests;
create policy join_requests_select_related on join_requests for select
  using (
    requester_user_id = current_user_id()
    or (organization_id = current_org() and has_perm_branch('people.join_request.read', branch_id))
  );
create policy join_requests_decide_permitted on join_requests for update
  using (organization_id = current_org() and has_perm_branch('people.join_request.approve', branch_id) and status = 'pending')
  with check (
    organization_id = current_org()
    and has_perm_branch('people.join_request.approve', branch_id)
    and status in ('approved', 'rejected')
    and decided_by = current_user_id()
  );

drop policy org_branding_upsert_org_wide_member on org_branding;
drop policy org_branding_update_org_wide_member on org_branding;
create policy org_branding_upsert_permitted on org_branding for insert
  with check (organization_id = current_org() and has_perm('org.branding.update'));
create policy org_branding_update_permitted on org_branding for update
  using (organization_id = current_org() and has_perm('org.branding.update'));

-- Nothing references is_org_wide_member() anymore.
drop function is_org_wide_member(uuid);

-- ── Grants ────────────────────────────────────────────────────

grant select on roles to authenticated;
grant select on permissions to authenticated;
grant select on role_permissions to authenticated;
grant select, insert, delete on membership_roles to authenticated;
grant select on platform_role_assignments to authenticated;
grant select on coach_assignments to authenticated;
grant select on support_access_grants to authenticated;

-- ── Indexes (Doc 07 §18) ──────────────────────────────────────

create index membership_roles_role_id_idx on membership_roles (role_id);
create index platform_role_assignments_role_id_idx on platform_role_assignments (role_id);
create index support_access_grants_organization_id_idx on support_access_grants (organization_id);
create index support_access_grants_grantee_idx on support_access_grants (grantee_user_id) where revoked_at is null;

-- ── Permission catalogue (Doc 04 §4, platform reference data) ────

insert into permissions (key) values
  ('org.settings.read'), ('org.settings.update'), ('org.branding.update'),
  ('org.branch.create'), ('org.branch.update'), ('org.branch.archive'),
  ('org.billing.read'), ('org.billing.manage'), ('org.delete.request'),
  ('people.member.invite'), ('people.member.read'), ('people.member.update'), ('people.member.suspend'),
  ('people.role.grant'), ('people.role.revoke'),
  ('people.join_request.read'), ('people.join_request.approve'),
  ('people.student.read'), ('people.student.update'), ('people.consent.capture'),
  ('schedule.batch.create'), ('schedule.batch.update'), ('schedule.batch.archive'),
  ('schedule.calendar.read'), ('schedule.calendar.manage'), ('schedule.holiday.manage'),
  ('attendance.record'), ('attendance.read'), ('attendance.override'),
  ('attendance.review_queue.resolve'), ('attendance.face.enroll'), ('attendance.self_record'),
  ('finance.policy.manage'), ('finance.charge.create'), ('finance.charge.read'), ('finance.charge.waive'),
  ('finance.fine.manage'), ('finance.payment.record'), ('finance.proof.submit'), ('finance.proof.approve'),
  ('finance.refund.issue'), ('finance.payout.read'), ('finance.ledger.read'),
  ('progress.metric.log'), ('progress.read'), ('progress.report.generate'),
  ('notify.template.manage'), ('notify.send.manual'), ('notify.log.read'), ('notify.fee_reminder.send'),
  ('hr.staff.onboard'), ('hr.leave.approve'), ('hr.payout_settings.manage'),
  ('market.listing.manage'), ('market.lead.read'), ('market.lead.assign'), ('market.review.respond'),
  ('medical.grant.request'), ('medical.record.read'),
  ('platform.org.lifecycle'), ('platform.verification.review'), ('platform.support.request_access'),
  ('platform.subscription.manage'), ('platform.flag.manage'), ('platform.role.grant'), ('platform.announce'),
  ('audit.log.read'), ('platform.audit.read')
on conflict (key) do nothing;

-- ── System roles (Doc 04 §3) ─────────────────────────────────────
-- Org role keys match join_requests.requested_role / the invitation
-- role_keys values already in use since migration 0004 (Phase 3) so
-- applying them to membership_roles (below, and in tenancy-rbac's
-- acceptInvitation/decideJoinRequest) needs no translation table.

insert into roles (key, scope) values
  ('owner','org'), ('org_admin','org'), ('branch_admin','org'), ('coach','org'),
  ('assistant_coach','org'), ('front_desk','org'), ('accountant','org'), ('student','org'),
  ('super_admin','platform'), ('verification_ops','platform'), ('support','platform'),
  ('platform_finance','platform'), ('marketplace_partner','platform')
on conflict (organization_id, key) do nothing;

-- ── role_permissions (Doc 04 §5 access matrix, translated — see this
-- migration's header comment on interpretive judgment calls) ──────

insert into role_permissions (role_id, permission_key)
select r.id, x.permission_key
from (values
  -- Owner: full org-scope control.
  ('owner','org.settings.read'), ('owner','org.settings.update'), ('owner','org.branding.update'),
  ('owner','org.branch.create'), ('owner','org.branch.update'), ('owner','org.branch.archive'),
  ('owner','org.billing.read'), ('owner','org.billing.manage'), ('owner','org.delete.request'),
  ('owner','people.member.invite'), ('owner','people.member.read'), ('owner','people.member.update'),
  ('owner','people.member.suspend'), ('owner','people.role.grant'), ('owner','people.role.revoke'),
  ('owner','people.join_request.read'), ('owner','people.join_request.approve'),
  ('owner','people.student.read'), ('owner','people.student.update'), ('owner','people.consent.capture'),
  ('owner','schedule.batch.create'), ('owner','schedule.batch.update'), ('owner','schedule.batch.archive'),
  ('owner','schedule.calendar.read'), ('owner','schedule.calendar.manage'), ('owner','schedule.holiday.manage'),
  ('owner','attendance.record'), ('owner','attendance.read'), ('owner','attendance.override'),
  ('owner','attendance.review_queue.resolve'), ('owner','attendance.face.enroll'),
  ('owner','finance.policy.manage'), ('owner','finance.charge.create'), ('owner','finance.charge.read'),
  ('owner','finance.charge.waive'), ('owner','finance.fine.manage'), ('owner','finance.payment.record'),
  ('owner','finance.proof.submit'), ('owner','finance.proof.approve'), ('owner','finance.refund.issue'),
  ('owner','finance.payout.read'), ('owner','finance.ledger.read'),
  ('owner','progress.metric.log'), ('owner','progress.read'), ('owner','progress.report.generate'),
  ('owner','notify.template.manage'), ('owner','notify.send.manual'), ('owner','notify.log.read'),
  ('owner','notify.fee_reminder.send'),
  ('owner','hr.staff.onboard'), ('owner','hr.leave.approve'), ('owner','hr.payout_settings.manage'),
  ('owner','market.listing.manage'), ('owner','market.lead.read'), ('owner','market.lead.assign'),
  ('owner','market.review.respond'),
  ('owner','medical.grant.request'), ('owner','medical.record.read'),
  ('owner','audit.log.read'),

  -- Org Admin: Owner's set minus billing-plan changes and org deletion (Doc 04 §3).
  ('org_admin','org.settings.read'), ('org_admin','org.settings.update'), ('org_admin','org.branding.update'),
  ('org_admin','org.branch.create'), ('org_admin','org.branch.update'), ('org_admin','org.branch.archive'),
  ('org_admin','org.billing.read'),
  ('org_admin','people.member.invite'), ('org_admin','people.member.read'), ('org_admin','people.member.update'),
  ('org_admin','people.member.suspend'), ('org_admin','people.role.grant'), ('org_admin','people.role.revoke'),
  ('org_admin','people.join_request.read'), ('org_admin','people.join_request.approve'),
  ('org_admin','people.student.read'), ('org_admin','people.student.update'), ('org_admin','people.consent.capture'),
  ('org_admin','schedule.batch.create'), ('org_admin','schedule.batch.update'), ('org_admin','schedule.batch.archive'),
  ('org_admin','schedule.calendar.read'), ('org_admin','schedule.calendar.manage'), ('org_admin','schedule.holiday.manage'),
  ('org_admin','attendance.record'), ('org_admin','attendance.read'), ('org_admin','attendance.override'),
  ('org_admin','attendance.review_queue.resolve'), ('org_admin','attendance.face.enroll'),
  ('org_admin','finance.policy.manage'), ('org_admin','finance.charge.create'), ('org_admin','finance.charge.read'),
  ('org_admin','finance.charge.waive'), ('org_admin','finance.fine.manage'), ('org_admin','finance.payment.record'),
  ('org_admin','finance.proof.submit'), ('org_admin','finance.proof.approve'), ('org_admin','finance.refund.issue'),
  ('org_admin','finance.payout.read'), ('org_admin','finance.ledger.read'),
  ('org_admin','progress.metric.log'), ('org_admin','progress.read'), ('org_admin','progress.report.generate'),
  ('org_admin','notify.template.manage'), ('org_admin','notify.send.manual'), ('org_admin','notify.log.read'),
  ('org_admin','notify.fee_reminder.send'),
  ('org_admin','hr.staff.onboard'), ('org_admin','hr.leave.approve'), ('org_admin','hr.payout_settings.manage'),
  ('org_admin','market.listing.manage'), ('org_admin','market.lead.read'), ('org_admin','market.lead.assign'),
  ('org_admin','market.review.respond'),
  ('org_admin','medical.grant.request'), ('org_admin','medical.record.read'),
  ('org_admin','audit.log.read'),

  -- Branch Admin: branch-scoped subset (has_perm_branch does the scoping).
  ('branch_admin','org.settings.read'), ('branch_admin','org.branch.update'),
  ('branch_admin','people.member.read'), ('branch_admin','people.member.invite'),
  ('branch_admin','people.member.suspend'), ('branch_admin','people.role.grant'), ('branch_admin','people.role.revoke'),
  ('branch_admin','people.join_request.read'), ('branch_admin','people.join_request.approve'),
  ('branch_admin','people.student.read'), ('branch_admin','people.student.update'), ('branch_admin','people.consent.capture'),
  ('branch_admin','schedule.batch.create'), ('branch_admin','schedule.batch.update'), ('branch_admin','schedule.batch.archive'),
  ('branch_admin','schedule.calendar.read'), ('branch_admin','schedule.calendar.manage'), ('branch_admin','schedule.holiday.manage'),
  ('branch_admin','attendance.record'), ('branch_admin','attendance.read'), ('branch_admin','attendance.override'),
  ('branch_admin','attendance.review_queue.resolve'), ('branch_admin','attendance.face.enroll'),
  ('branch_admin','finance.charge.create'), ('branch_admin','finance.charge.read'), ('branch_admin','finance.charge.waive'),
  ('branch_admin','finance.payment.record'), ('branch_admin','finance.proof.submit'), ('branch_admin','finance.proof.approve'),
  ('branch_admin','finance.refund.issue'),
  ('branch_admin','progress.read'),
  ('branch_admin','notify.template.manage'), ('branch_admin','notify.send.manual'),

  -- Coach: own-batches subset (P2 policies land with Scheduling/Attendance, Phase 7-8).
  ('coach','people.student.read'),
  ('coach','schedule.batch.update'), ('coach','schedule.calendar.read'), ('coach','schedule.calendar.manage'),
  ('coach','attendance.record'), ('coach','attendance.read'), ('coach','attendance.review_queue.resolve'),
  ('coach','attendance.face.enroll'), ('coach','attendance.self_record'),
  ('coach','finance.charge.read'),
  ('coach','notify.send.manual'), ('coach','notify.fee_reminder.send'), ('coach','notify.template.manage'),
  ('coach','progress.metric.log'), ('coach','progress.read'),
  ('coach','market.listing.manage'),

  -- Assistant Coach: narrower than Coach — record/log only, no override or finance.
  ('assistant_coach','people.student.read'),
  ('assistant_coach','schedule.calendar.read'),
  ('assistant_coach','attendance.record'), ('assistant_coach','attendance.read'), ('assistant_coach','attendance.self_record'),
  ('assistant_coach','progress.metric.log'),

  -- Front Desk: check-in + branch read + proof intake, no approvals.
  ('front_desk','people.join_request.read'), ('front_desk','people.student.read'),
  ('front_desk','schedule.calendar.read'),
  ('front_desk','attendance.record'), ('front_desk','attendance.read'), ('front_desk','attendance.face.enroll'),
  ('front_desk','attendance.self_record'),
  ('front_desk','finance.charge.read'), ('front_desk','finance.proof.submit'),

  -- Accountant: finance module full, no people/attendance write.
  ('accountant','org.billing.read'),
  ('accountant','finance.policy.manage'), ('accountant','finance.charge.create'), ('accountant','finance.charge.read'),
  ('accountant','finance.charge.waive'), ('accountant','finance.fine.manage'), ('accountant','finance.payment.record'),
  ('accountant','finance.proof.submit'), ('accountant','finance.proof.approve'), ('accountant','finance.refund.issue'),
  ('accountant','finance.payout.read'), ('accountant','finance.ledger.read'),
  ('accountant','audit.log.read')

  -- Student: no role_permissions rows — self-access is an identity right
  -- (P3 self policies keyed on enrollment/user_id), not RBAC-mediated
  -- (Doc 04 §4 note). The role row exists so invitations/join_requests can
  -- reference the 'student' key.

) as x(role_key, permission_key)
join roles r on r.key = x.role_key and r.organization_id is null
on conflict do nothing;

-- Platform-role matrix (Doc 04 §5, second table). No RLS reads these yet
-- (see header comment) — seeded now because it's the same seed step.
insert into role_permissions (role_id, permission_key)
select r.id, x.permission_key
from (values
  ('super_admin','platform.org.lifecycle'), ('super_admin','platform.verification.review'),
  ('super_admin','platform.support.request_access'), ('super_admin','platform.subscription.manage'),
  ('super_admin','platform.flag.manage'), ('super_admin','platform.role.grant'), ('super_admin','platform.announce'),
  ('super_admin','platform.audit.read'),
  ('verification_ops','platform.verification.review'),
  ('support','platform.support.request_access'),
  ('platform_finance','platform.subscription.manage')
  -- marketplace_partner: no catalogue permission maps to "aggregate campaign
  -- analytics read" yet — empty bundle, flagged here rather than inventing
  -- a key with no consumer.
) as x(role_key, permission_key)
join roles r on r.key = x.role_key and r.organization_id is null
on conflict do nothing;
