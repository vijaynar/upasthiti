-- Abhyas V2 — Row Level Security, grants, and storage buckets.
--
-- Every table's RLS policies reflect their FINAL state across the original
-- migration history — where a later phase DROPped and replaced an earlier
-- policy (e.g. is_org_wide_member()-gated policies replaced by has_perm()
-- once RBAC landed, or invitations' policies widened twice for guardian/
-- support-grant carve-outs), only the final version appears here.
--
-- Postgres checks table-level grants BEFORE RLS row-filtering — a policy
-- without a matching grant is a silent no-op — so grants travel immediately
-- after each table's policies. Column-level grants are used wherever a
-- WITH CHECK can't itself lock down every sensitive column.

-- ── jobs ──────────────────────────────────────────────────────────
-- Zero policies, by design: only apps/worker (service_role, which bypasses
-- RLS) touches this table. Enabling RLS with no policy default-denies the
-- anon/authenticated API path entirely.
alter table jobs enable row level security;

-- ── users ─────────────────────────────────────────────────────────
alter table users enable row level security;

create policy users_select_self on users for select
  using (id = current_user_id());
create policy users_update_self on users for update
  using (id = current_user_id());
-- No insert/delete policy: user rows are created by resolve-or-create
-- (service-role) before a session, and never deleted (soft delete via
-- deleted_at, itself a service-role-only workflow).

-- Guardian read access to a ward's own profile.
create policy users_select_ward on users for select
  using (is_guardian_of(id));

-- Org-staff read path: co-member visibility, scoped to exactly what
-- people.member.read already grants elsewhere (memberships_select_staff).
create policy users_select_org_staff on users for select to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.user_id = users.id
        and m.organization_id = current_org()
        and m.status = 'active'
        and has_perm_branch('people.member.read', m.branch_id)
    )
  );

-- Org-staff read path for ENROLLED STUDENTS (they're in enrollments, not
-- memberships, so the policy above doesn't cover them) — scoped to exactly
-- what people.student.read grants on enrollments.
create policy users_select_org_student on users for select to authenticated
  using (
    exists (
      select 1 from enrollments e
      where e.student_user_id = users.id
        and e.organization_id = current_org()
        and e.status = 'active'
        and has_perm_branch('people.student.read', e.branch_id)
    )
  );

grant select, update on users to authenticated;
grant select on users to service_role;

-- ── auth_methods ──────────────────────────────────────────────────
alter table auth_methods enable row level security;

create policy auth_methods_self on auth_methods for all
  using (user_id = current_user_id())
  with check (user_id = current_user_id());

grant select, insert, update, delete on auth_methods to authenticated;

-- ── sessions ──────────────────────────────────────────────────────
alter table sessions enable row level security;

create policy sessions_select_self on sessions for select
  using (user_id = current_user_id());
create policy sessions_update_self on sessions for update
  using (user_id = current_user_id());
-- No insert policy: sessions are issued by the auth adapter (service-role).

grant select, update on sessions to authenticated;

-- ── guardianships ─────────────────────────────────────────────────
alter table guardianships enable row level security;

create policy guardianships_select_related on guardianships for select
  using (guardian_user_id = current_user_id() or ward_user_id = current_user_id());
-- Insert/update reserved to service-role (guardian-adds-child flow).

grant select on guardianships to authenticated;

-- ── consents ──────────────────────────────────────────────────────
alter table consents enable row level security;

create policy consents_select_related on consents for select
  using (subject_user_id = current_user_id() or granted_by = current_user_id());

-- Requires self-subject or has_consent_authority(subject_user_id) — closes
-- the gap where any authenticated user could grant a consent row for an
-- arbitrary subject.
create policy consents_insert_self_or_ward on consents for insert
  with check (
    granted_by = current_user_id()
    and (subject_user_id = current_user_id() or has_consent_authority(subject_user_id))
  );

create policy consents_update_self_or_ward on consents for update
  using (granted_by = current_user_id())
  with check (
    granted_by = current_user_id()
    and (subject_user_id = current_user_id() or has_consent_authority(subject_user_id))
  );

grant select, insert, update on consents to authenticated;

-- ── organizations ─────────────────────────────────────────────────
alter table organizations enable row level security;

-- Any authenticated user may create an org — createOrganization then
-- self-inserts the org-wide membership + Main branch in the same
-- transaction. created_by = current_user_id() (not just membership) matters:
-- INSERT ... RETURNING must also pass SELECT policy, and no membership row
-- exists yet at the moment organizations is inserted.
create policy organizations_insert_any on organizations for insert
  with check (created_by = current_user_id());

create policy organizations_select_member on organizations for select
  using (
    created_by = current_user_id()
    or exists (select 1 from memberships where organization_id = organizations.id and user_id = current_user_id())
  );

-- Permission-gated (has_perm()) — supersedes the interim "any org-wide
-- member" gate an early phase used before RBAC existed. No WITH CHECK
-- restricting status/verified_* here — those are locked out at the GRANT
-- level (column-level grant below) since WITH CHECK can't cheaply assert
-- "unchanged from OLD" for a handful of columns among many.
create policy organizations_update_permitted on organizations for update
  using (id = current_org() and has_perm('org.settings.update'));

-- Additive: platform support-grant read (Doc 04 §9.3 "org 360 view"). ORs
-- with organizations_select_member, doesn't replace it.
create policy organizations_select_support_grant on organizations for select
  using (support_grant_active(id));

grant select, insert on organizations to authenticated;
grant update (name, slug, default_currency, country_code, timezone, settings) on organizations to authenticated;

-- ── branches ──────────────────────────────────────────────────────
alter table branches enable row level security;

create policy branches_select_member on branches for select
  using (
    exists (select 1 from memberships where organization_id = branches.organization_id and user_id = current_user_id())
  );

create policy branches_insert_permitted on branches for insert
  with check (organization_id = current_org() and has_perm('org.branch.create'));
create policy branches_update_permitted on branches for update
  using (organization_id = current_org() and has_perm_branch('org.branch.update', id));

grant select, insert on branches to authenticated;
grant update (name, status, geo) on branches to authenticated;

-- ── memberships ───────────────────────────────────────────────────
alter table memberships enable row level security;

create policy memberships_select_self on memberships for select
  using (user_id = current_user_id());

-- One-time bootstrap self-insert: only into an org the caller just created,
-- only as the org-wide member. Invitation acceptance / join-request approval
-- create OTHER users' membership rows via the service-role client instead.
create policy memberships_insert_self_as_creator on memberships for insert
  with check (
    user_id = current_user_id()
    and branch_id is null
    and status = 'active'
    and exists (select 1 from organizations o where o.id = organization_id and o.created_by = current_user_id())
  );

-- Self-service is narrowed to "leave the org" only — the real lock is the
-- column-level GRANT below (only `status` is grantable).
create policy memberships_leave_self on memberships for update
  using (user_id = current_user_id())
  with check (user_id = current_user_id() and status = 'left');

create policy memberships_select_staff on memberships for select
  using (organization_id = current_org() and has_perm_branch('people.member.read', branch_id));
create policy memberships_update_staff on memberships for update
  using (organization_id = current_org() and has_perm_branch('people.member.suspend', branch_id))
  with check (
    organization_id = current_org()
    and has_perm_branch('people.member.suspend', branch_id)
    and status in ('active','suspended')
  );

-- Additive: platform support-grant read.
create policy memberships_select_support_grant on memberships for select
  using (support_grant_active(organization_id));

-- Self-service role switch (2026-07-24): USING scoped to the caller's own
-- row, WITH CHECK requires the new active_role_id be a role this membership
-- actually holds. The column-level GRANT below is the real lock.
create policy memberships_switch_active_role_self on memberships for update
  using (user_id = current_user_id())
  with check (
    user_id = current_user_id()
    and exists (
      select 1 from membership_roles mr
      where mr.membership_id = memberships.id and mr.role_id = memberships.active_role_id
    )
  );

grant select, insert on memberships to authenticated;
grant update (status) on memberships to authenticated;
grant update (active_role_id) on memberships to authenticated;

-- ── invitations ───────────────────────────────────────────────────
alter table invitations enable row level security;

-- FINAL form: permission-gated read/write, plus a platform support-grant
-- carve-out so a Super Admin can generate a coach invite link for an org
-- without being a member of it.
create policy invitations_select_permitted on invitations for select
  using (
    (organization_id = current_org() and has_perm_branch('people.member.read', branch_id))
    or support_grant_active(organization_id)
  );

create policy invitations_insert_permitted on invitations for insert
  with check (
    invited_by = current_user_id()
    and (
      (organization_id = current_org() and has_perm_branch('people.member.invite', branch_id))
      or support_grant_active(organization_id)
    )
  );

-- Revoke-only: WITH CHECK forces revoked_at to be set, and the column-level
-- GRANT below (update (revoked_at) only) still applies.
create policy invitations_revoke_permitted on invitations for update
  using (
    (organization_id = current_org() and has_perm_branch('people.member.invite', branch_id))
    or support_grant_active(organization_id)
  )
  with check (
    revoked_at is not null
    and (
      (organization_id = current_org() and has_perm_branch('people.member.invite', branch_id))
      or support_grant_active(organization_id)
    )
  );

grant select, insert on invitations to authenticated;
grant update (revoked_at) on invitations to authenticated;

-- ── join_requests ─────────────────────────────────────────────────
alter table join_requests enable row level security;

create policy join_requests_select_related on join_requests for select
  using (
    requester_user_id = current_user_id()
    or (organization_id = current_org() and has_perm_branch('people.join_request.read', branch_id))
  );

-- Guardian-on-behalf-of-a-ward: subject may be self or a ward the requester
-- is guardian of (never an arbitrary other user).
create policy join_requests_insert_self_or_ward on join_requests for insert
  with check (
    requester_user_id = current_user_id()
    and (subject_user_id = current_user_id() or is_guardian_of(subject_user_id))
  );

-- Two UPDATE policies, deliberately narrow: multiple permissive policies for
-- the same command OR-combine both USING and WITH CHECK, so each one's
-- WITH CHECK must independently restrict what it allows.
create policy join_requests_decide_permitted on join_requests for update
  using (organization_id = current_org() and has_perm_branch('people.join_request.approve', branch_id) and status = 'pending')
  with check (
    organization_id = current_org()
    and has_perm_branch('people.join_request.approve', branch_id)
    and status in ('approved', 'rejected')
    and decided_by = current_user_id()
  );
create policy join_requests_withdraw_self on join_requests for update
  using (requester_user_id = current_user_id() and status = 'pending')
  with check (requester_user_id = current_user_id() and status = 'withdrawn');

grant select, insert on join_requests to authenticated;
grant update (status, decided_by, decided_at, decision_note) on join_requests to authenticated;

-- ── org_branding ──────────────────────────────────────────────────
alter table org_branding enable row level security;

create policy org_branding_select_member on org_branding for select
  using (
    exists (select 1 from memberships where organization_id = org_branding.organization_id and user_id = current_user_id())
  );
create policy org_branding_upsert_permitted on org_branding for insert
  with check (organization_id = current_org() and has_perm('org.branding.update'));
create policy org_branding_update_permitted on org_branding for update
  using (organization_id = current_org() and has_perm('org.branding.update'));

grant select, insert on org_branding to authenticated;
grant update (logo_path, colors, display_name, updated_at) on org_branding to authenticated;

-- ── org_domains ───────────────────────────────────────────────────
alter table org_domains enable row level security;

-- Read-only from the client (schema-only feature) — writes are
-- service-role/platform-admin tooling.
create policy org_domains_select_member on org_domains for select
  using (
    exists (select 1 from memberships where organization_id = org_domains.organization_id and user_id = current_user_id())
  );

grant select on org_domains to authenticated;

-- ── roles / permissions / role_permissions ───────────────────────
alter table roles enable row level security;
-- System roles (organization_id is null) are visible to everyone; org-scoped
-- custom roles (unused in v1) are visible only to that org's members. No
-- write grant — the catalogue is migration-managed reference data.
create policy roles_select_system_or_own_org on roles for select
  using (organization_id is null or organization_id = current_org());
grant select on roles to authenticated;

alter table permissions enable row level security;
create policy permissions_select_all on permissions for select using (true);
grant select on permissions to authenticated;

alter table role_permissions enable row level security;
create policy role_permissions_select_visible on role_permissions for select
  using (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and (r.organization_id is null or r.organization_id = current_org())
    )
  );
grant select on role_permissions to authenticated;

-- ── membership_roles ──────────────────────────────────────────────
alter table membership_roles enable row level security;

-- Visible to the member themselves, or org staff with people.member.read.
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
-- get a first role into a brand-new org.
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
-- grant a role to a membership in their scope.
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

grant select, insert, delete on membership_roles to authenticated;

-- ── platform_role_assignments ─────────────────────────────────────
alter table platform_role_assignments enable row level security;

-- Self-view only in v1 — no write grant.
create policy platform_role_assignments_select_self on platform_role_assignments for select
  using (user_id = current_user_id());

grant select on platform_role_assignments to authenticated;

-- ── coach_assignments ─────────────────────────────────────────────
alter table coach_assignments enable row level security;

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

create policy coach_assignments_insert_staff on coach_assignments for insert
  with check (
    exists (
      select 1 from batches b
      where b.id = coach_assignments.batch_id
        and b.organization_id = current_org()
        and has_perm_branch('schedule.batch.update', b.branch_id)
    )
  );
create policy coach_assignments_update_staff on coach_assignments for update
  using (
    exists (
      select 1 from batches b
      where b.id = coach_assignments.batch_id
        and b.organization_id = current_org()
        and has_perm_branch('schedule.batch.update', b.branch_id)
    )
  );
create policy coach_assignments_delete_staff on coach_assignments for delete
  using (
    exists (
      select 1 from batches b
      where b.id = coach_assignments.batch_id
        and b.organization_id = current_org()
        and has_perm_branch('schedule.batch.update', b.branch_id)
    )
  );

grant select, insert, update, delete on coach_assignments to authenticated;

-- ── support_access_grants ─────────────────────────────────────────
alter table support_access_grants enable row level security;

-- Grantee sees their own grants; an org's Owner/Admin sees grants issued
-- against their org; platform staff who can grant support access see all.
-- No write grant — request/approve is Platform Admin tooling (service-role).
create policy support_access_grants_select_related on support_access_grants for select
  using (
    grantee_user_id = current_user_id()
    or (organization_id = current_org() and has_perm('org.settings.read'))
  );
create policy support_access_grants_select_platform on support_access_grants for select
  using (has_platform_perm('platform.support.request_access'));

grant select on support_access_grants to authenticated;

-- ── feature_flags / org_feature_flags ─────────────────────────────
alter table feature_flags enable row level security;
create policy feature_flags_select_all on feature_flags for select using (true);
create policy feature_flags_insert_permitted on feature_flags for insert
  with check (has_platform_perm('platform.flag.manage'));
create policy feature_flags_update_permitted on feature_flags for update
  using (has_platform_perm('platform.flag.manage'));
create policy feature_flags_delete_permitted on feature_flags for delete
  using (has_platform_perm('platform.flag.manage'));
grant select, insert, update, delete on feature_flags to authenticated;

alter table org_feature_flags enable row level security;
create policy org_feature_flags_select_visible on org_feature_flags for select
  using (organization_id = current_org() or has_platform_perm('platform.flag.manage'));
create policy org_feature_flags_insert_permitted on org_feature_flags for insert
  with check (has_platform_perm('platform.flag.manage'));
create policy org_feature_flags_update_permitted on org_feature_flags for update
  using (has_platform_perm('platform.flag.manage'));
create policy org_feature_flags_delete_permitted on org_feature_flags for delete
  using (has_platform_perm('platform.flag.manage'));
grant select, insert, update, delete on org_feature_flags to authenticated;

-- ── announcements ─────────────────────────────────────────────────
alter table announcements enable row level security;
create policy announcements_select_all on announcements for select using (true);
create policy announcements_insert_permitted on announcements for insert
  with check (has_platform_perm('platform.announce'));
create policy announcements_update_permitted on announcements for update
  using (has_platform_perm('platform.announce'));
create policy announcements_delete_permitted on announcements for delete
  using (has_platform_perm('platform.announce'));
grant select, insert, update, delete on announcements to authenticated;

-- ── plans / subscriptions ─────────────────────────────────────────
alter table plans enable row level security;
create policy plans_select_all on plans for select using (true);
create policy plans_insert_permitted on plans for insert
  with check (has_platform_perm('platform.subscription.manage'));
create policy plans_update_permitted on plans for update
  using (has_platform_perm('platform.subscription.manage'));
grant select, insert, update on plans to authenticated;

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
grant select, insert, update on subscriptions to authenticated;

-- ── audit_log ─────────────────────────────────────────────────────
alter table audit_log enable row level security;
-- No INSERT/UPDATE/DELETE policy for `authenticated` at all — write_audit_log()
-- is SECURITY DEFINER and bypasses RLS for its own insert.
create policy audit_log_select_visible on audit_log for select
  using (
    (organization_id = current_org() and has_perm('audit.log.read'))
    or has_platform_perm('platform.audit.read')
  );
grant select on audit_log to authenticated;
grant execute on function write_audit_log(text, text, uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function has_platform_perm(text) to authenticated;

-- ── enrollments ───────────────────────────────────────────────────
alter table enrollments enable row level security;

create policy enrollments_select_self on enrollments for select
  using (student_user_id = current_user_id());
create policy enrollments_select_guardian on enrollments for select
  using (is_my_ward(student_user_id, organization_id));
create policy enrollments_select_staff on enrollments for select
  using (organization_id = current_org() and has_perm_branch('people.student.read', branch_id));
create policy enrollments_insert_staff on enrollments for insert
  with check (organization_id = current_org() and has_perm_branch('people.student.update', branch_id));
create policy enrollments_update_staff on enrollments for update
  using (organization_id = current_org() and has_perm_branch('people.student.update', branch_id))
  with check (organization_id = current_org() and has_perm_branch('people.student.update', branch_id));

grant select, insert, update on enrollments to authenticated;

-- ── category taxonomy: platform-wide reference data, public read ──
-- service_role grants are explicit here: tables created by our migrations
-- are owned by role `postgres`, whose default ACL does NOT include SELECT
-- for service_role (unlike supabase_admin-owned tables) — PostgREST-via-
-- service-role reads (adminDb(), public API routes) 42501 without them.

alter table categories enable row level security;
create policy categories_select_all on categories for select to authenticated using (true);
grant select on categories to authenticated, service_role;

alter table subcategories enable row level security;
create policy subcategories_select_all on subcategories for select to authenticated using (true);
grant select on subcategories to authenticated, service_role;

alter table tags enable row level security;
create policy tags_select_all on tags for select to authenticated using (true);
grant select on tags to authenticated, service_role;

-- ── marketplace reference data: taxonomy_sports / geo_cities / geo_areas ──
alter table taxonomy_sports enable row level security;
create policy taxonomy_sports_select_all on taxonomy_sports for select to authenticated using (true);
grant select on taxonomy_sports to authenticated;

alter table geo_cities enable row level security;
create policy geo_cities_select_all on geo_cities for select to authenticated using (true);
grant select on geo_cities to authenticated;

alter table geo_areas enable row level security;
create policy geo_areas_select_all on geo_areas for select to authenticated using (true);
grant select on geo_areas to authenticated, service_role;

-- ── fee_policies ──────────────────────────────────────────────────
alter table fee_policies enable row level security;

-- Branch Admin's read-only view reuses org.settings.read (no dedicated
-- read-only key exists for this row).
create policy fee_policies_select_finance on fee_policies for select
  using (organization_id = current_org() and (has_perm('finance.policy.manage') or has_perm('org.settings.read')));
create policy fee_policies_insert_finance on fee_policies for insert
  with check (organization_id = current_org() and has_perm('finance.policy.manage'));
create policy fee_policies_update_finance on fee_policies for update
  using (organization_id = current_org() and has_perm('finance.policy.manage'))
  with check (organization_id = current_org() and has_perm('finance.policy.manage'));

grant select, insert, update on fee_policies to authenticated;

-- ── programs ──────────────────────────────────────────────────────
alter table programs enable row level security;

create policy programs_select_member on programs for select
  using (exists (select 1 from memberships where organization_id = programs.organization_id and user_id = current_user_id()));
create policy programs_insert_staff on programs for insert
  with check (organization_id = current_org() and has_perm('schedule.batch.create'));
create policy programs_update_staff on programs for update
  using (organization_id = current_org() and has_perm('schedule.batch.update'))
  with check (organization_id = current_org() and has_perm('schedule.batch.update'));

grant select, insert, update on programs to authenticated;

-- ── batches ───────────────────────────────────────────────────────
alter table batches enable row level security;

create policy batches_select_staff on batches for select
  using (organization_id = current_org() and has_perm_branch('schedule.calendar.read', branch_id));
create policy batches_select_participant on batches for select
  using (is_batch_participant(id));
create policy batches_insert_staff on batches for insert
  with check (organization_id = current_org() and has_perm_branch('schedule.batch.create', branch_id));
create policy batches_update_staff on batches for update
  using (organization_id = current_org() and has_perm_branch('schedule.batch.update', branch_id))
  with check (organization_id = current_org() and has_perm_branch('schedule.batch.update', branch_id));

grant select, insert, update on batches to authenticated;

-- ── batch_enrollments ─────────────────────────────────────────────
alter table batch_enrollments enable row level security;

create policy batch_enrollments_select_staff on batch_enrollments for select
  using (
    exists (
      select 1 from batches b
      where b.id = batch_enrollments.batch_id
        and b.organization_id = current_org()
        and has_perm_branch('schedule.calendar.read', b.branch_id)
    )
  );
create policy batch_enrollments_select_self on batch_enrollments for select
  using (
    exists (select 1 from enrollments e where e.id = batch_enrollments.enrollment_id and e.student_user_id = current_user_id())
  );
create policy batch_enrollments_select_guardian on batch_enrollments for select
  using (
    exists (
      select 1 from enrollments e
      where e.id = batch_enrollments.enrollment_id and is_my_ward(e.student_user_id, e.organization_id)
    )
  );
create policy batch_enrollments_insert_staff on batch_enrollments for insert
  with check (
    exists (
      select 1 from batches b
      where b.id = batch_enrollments.batch_id
        and b.organization_id = current_org()
        and has_perm_branch('schedule.batch.update', b.branch_id)
    )
  );
create policy batch_enrollments_update_staff on batch_enrollments for update
  using (
    exists (
      select 1 from batches b
      where b.id = batch_enrollments.batch_id
        and b.organization_id = current_org()
        and has_perm_branch('schedule.batch.update', b.branch_id)
    )
  );

grant select, insert, update on batch_enrollments to authenticated;

-- ── class_sessions ────────────────────────────────────────────────
alter table class_sessions enable row level security;

create policy class_sessions_select_staff on class_sessions for select
  using (organization_id = current_org() and has_perm_branch('schedule.calendar.read', branch_id));
create policy class_sessions_select_self on class_sessions for select
  using (
    exists (
      select 1 from batch_enrollments be
      join enrollments e on e.id = be.enrollment_id
      where be.batch_id = class_sessions.batch_id and e.student_user_id = current_user_id()
    )
  );
create policy class_sessions_select_guardian on class_sessions for select
  using (
    exists (
      select 1 from batch_enrollments be
      join enrollments e on e.id = be.enrollment_id
      where be.batch_id = class_sessions.batch_id and is_my_ward(e.student_user_id, e.organization_id)
    )
  );
-- Manual staff overrides — the bulk of inserts come from materializeSessions()
-- via the service-role client (worker job, bypasses RLS).
create policy class_sessions_insert_staff on class_sessions for insert
  with check (organization_id = current_org() and has_perm_branch('schedule.calendar.manage', branch_id));
create policy class_sessions_update_staff on class_sessions for update
  using (organization_id = current_org() and has_perm_branch('schedule.calendar.manage', branch_id))
  with check (organization_id = current_org() and has_perm_branch('schedule.calendar.manage', branch_id));

grant select, insert, update on class_sessions to authenticated;

-- ── holidays ──────────────────────────────────────────────────────
alter table holidays enable row level security;

create policy holidays_select_member on holidays for select
  using (exists (select 1 from memberships where organization_id = holidays.organization_id and user_id = current_user_id()));
-- has_perm_branch(perm, b) with b = NULL (org-wide holiday) only matches an
-- org-wide membership.
create policy holidays_insert_staff on holidays for insert
  with check (organization_id = current_org() and has_perm_branch('schedule.holiday.manage', branch_id));
create policy holidays_update_staff on holidays for update
  using (organization_id = current_org() and has_perm_branch('schedule.holiday.manage', branch_id))
  with check (organization_id = current_org() and has_perm_branch('schedule.holiday.manage', branch_id));
create policy holidays_delete_staff on holidays for delete
  using (organization_id = current_org() and has_perm_branch('schedule.holiday.manage', branch_id));

grant select, insert, update, delete on holidays to authenticated;

-- ── charges ───────────────────────────────────────────────────────
alter table charges enable row level security;

create policy charges_select_staff on charges for select
  using (organization_id = current_org() and has_perm_branch('finance.charge.read', branch_id));
create policy charges_select_self on charges for select
  using (exists (select 1 from enrollments e where e.id = charges.enrollment_id and e.student_user_id = current_user_id()));
create policy charges_select_guardian on charges for select
  using (exists (select 1 from enrollments e where e.id = charges.enrollment_id and is_my_ward(e.student_user_id, e.organization_id)));
create policy charges_insert_staff on charges for insert
  with check (organization_id = current_org() and has_perm_branch('finance.charge.create', branch_id));
-- Any finance-permission holder may attempt the UPDATE; enforce_charge_
-- status_transition() gates which STATUS transition each may actually make.
create policy charges_update_staff on charges for update
  using (
    organization_id = current_org()
    and (
      has_perm_branch('finance.charge.create', branch_id)
      or has_perm_branch('finance.charge.waive', branch_id)
      or has_perm_branch('finance.proof.approve', branch_id)
      or has_perm_branch('finance.refund.issue', branch_id)
    )
  )
  with check (
    organization_id = current_org()
    and (
      has_perm_branch('finance.charge.create', branch_id)
      or has_perm_branch('finance.charge.waive', branch_id)
      or has_perm_branch('finance.proof.approve', branch_id)
      or has_perm_branch('finance.refund.issue', branch_id)
    )
  );

grant select, insert, update on charges to authenticated;

-- ── payments ──────────────────────────────────────────────────────
alter table payments enable row level security;

-- No branch_id on payments (a single payment can settle charges across
-- branches via payment_allocations) — staff read is org-wide.
create policy payments_select_staff on payments for select
  using (organization_id = current_org() and has_perm('finance.charge.read'));
create policy payments_select_self on payments for select
  using (payer_user_id = current_user_id());
-- Self-serve proof submission, staff proof intake, or staff-recorded
-- cash/waiver — 'gateway' deliberately excluded (schema-complete, not wired).
create policy payments_insert on payments for insert
  with check (
    organization_id = current_org()
    and (
      (payer_user_id = current_user_id() and method = 'manual_proof')
      or (method = 'manual_proof' and has_perm('finance.proof.submit'))
      or (method in ('cash','waiver') and has_perm('finance.payment.record'))
    )
  );
create policy payments_update_staff on payments for update
  using (organization_id = current_org() and has_perm('finance.proof.approve'))
  with check (organization_id = current_org() and has_perm('finance.proof.approve'));

grant select, insert, update on payments to authenticated;

-- ── payment_allocations ───────────────────────────────────────────
alter table payment_allocations enable row level security;

create policy payment_allocations_select on payment_allocations for select
  using (
    exists (
      select 1 from payments p
      where p.id = payment_allocations.payment_id
        and (p.payer_user_id = current_user_id() or (p.organization_id = current_org() and has_perm('finance.charge.read')))
    )
  );
-- Written the moment a payment becomes 'succeeded' — either the instant-cash
-- path or the proof-approval path.
create policy payment_allocations_insert on payment_allocations for insert
  with check (
    exists (
      select 1 from payments p
      where p.id = payment_allocations.payment_id
        and p.organization_id = current_org()
        and (has_perm('finance.payment.record') or has_perm('finance.proof.approve'))
    )
  );

grant select, insert on payment_allocations to authenticated;

-- ── ledger_accounts / ledger_entries ──────────────────────────────
alter table ledger_accounts enable row level security;

create policy ledger_accounts_select_org on ledger_accounts for select
  using (organization_id = current_org() and has_perm('finance.ledger.read'));
-- Platform-wide accounts (organization_id is null) — no dedicated
-- platform.ledger.* key exists; reuses platform.subscription.manage.
create policy ledger_accounts_select_platform on ledger_accounts for select
  using (organization_id is null and has_platform_perm('platform.subscription.manage'));

grant select on ledger_accounts to authenticated;
grant execute on function get_or_create_ledger_account(uuid, text) to authenticated;
grant execute on function get_or_create_user_ledger_account(uuid, text) to authenticated;
grant execute on function get_or_create_platform_ledger_account(text) to authenticated;

alter table ledger_entries enable row level security;

create policy ledger_entries_select_org on ledger_entries for select
  using (organization_id = current_org() and has_perm('finance.ledger.read'));
create policy ledger_entries_select_platform on ledger_entries for select
  using (organization_id is null and has_platform_perm('platform.subscription.manage'));

-- No insert/update/delete grant for `authenticated` at all — post_ledger_
-- entries() is SECURITY DEFINER and bypasses RLS for its own insert.
grant select on ledger_entries to authenticated;
grant execute on function post_ledger_entries(jsonb) to authenticated;

-- ── org_bank_accounts / payouts ───────────────────────────────────
alter table org_bank_accounts enable row level security;

create policy org_bank_accounts_select on org_bank_accounts for select
  using (organization_id = current_org() and has_perm('finance.payout.manage'));
create policy org_bank_accounts_insert on org_bank_accounts for insert
  with check (organization_id = current_org() and has_perm('finance.payout.manage'));

grant select, insert on org_bank_accounts to authenticated;

alter table payouts enable row level security;

create policy payouts_select on payouts for select
  using (organization_id = current_org() and has_perm('finance.payout.read'));
create policy payouts_insert on payouts for insert
  with check (organization_id = current_org() and has_perm('finance.payout.manage'));
create policy payouts_update on payouts for update
  using (organization_id = current_org() and has_perm('finance.payout.manage'))
  with check (organization_id = current_org() and has_perm('finance.payout.manage'));

grant select, insert, update on payouts to authenticated;

-- ── face_enrollments ──────────────────────────────────────────────
alter table face_enrollments enable row level security;

-- Staff read/write: branch derived via the linked enrollment/membership
-- (face_enrollments itself has no branch_id).
create policy face_enrollments_select_staff on face_enrollments for select
  using (
    organization_id = current_org()
    and (
      (enrollment_id is not null and exists (
        select 1 from enrollments e where e.id = face_enrollments.enrollment_id
          and has_perm_branch('attendance.face.enroll', e.branch_id)
      ))
      or
      (membership_id is not null and exists (
        select 1 from memberships m where m.id = face_enrollments.membership_id
          and has_perm_branch('attendance.face.enroll', m.branch_id)
      ))
    )
  );
create policy face_enrollments_insert_staff on face_enrollments for insert
  with check (
    organization_id = current_org()
    and (
      (enrollment_id is not null and exists (
        select 1 from enrollments e where e.id = face_enrollments.enrollment_id
          and has_perm_branch('attendance.face.enroll', e.branch_id)
      ))
      or
      (membership_id is not null and exists (
        select 1 from memberships m where m.id = face_enrollments.membership_id
          and has_perm_branch('attendance.face.enroll', m.branch_id)
      ))
    )
  );
-- Delete = revoke a specific sample (re-enrollment / bad capture). Consent-
-- withdrawal purge (the compliance path) is a separate service-role job.
create policy face_enrollments_update_staff on face_enrollments for update
  using (
    organization_id = current_org()
    and (
      (enrollment_id is not null and exists (
        select 1 from enrollments e where e.id = face_enrollments.enrollment_id
          and has_perm_branch('attendance.face.enroll', e.branch_id)
      ))
      or
      (membership_id is not null and exists (
        select 1 from memberships m where m.id = face_enrollments.membership_id
          and has_perm_branch('attendance.face.enroll', m.branch_id)
      ))
    )
  );

grant select, insert, update on face_enrollments to authenticated;

-- ── attendance_events ─────────────────────────────────────────────
alter table attendance_events enable row level security;

create policy attendance_events_select_staff on attendance_events for select
  using (organization_id = current_org() and has_perm_branch('attendance.read', branch_id));
create policy attendance_events_select_self on attendance_events for select
  using (exists (select 1 from enrollments e where e.id = attendance_events.enrollment_id and e.student_user_id = current_user_id()));
create policy attendance_events_select_guardian on attendance_events for select
  using (exists (select 1 from enrollments e where e.id = attendance_events.enrollment_id and is_my_ward(e.student_user_id, e.organization_id)));
-- Single insert policy branching on method: a first-time record needs
-- attendance.record; a method='override' insert needs attendance.override.
-- Automated absence-marking goes through the service-role client.
create policy attendance_events_insert_staff on attendance_events for insert
  with check (
    organization_id = current_org()
    and (
      (method <> 'override' and has_perm_branch('attendance.record', branch_id))
      or (method = 'override' and has_perm_branch('attendance.override', branch_id))
    )
  );
-- Corrections set the OLD row's superseded_by to point at the NEW row
-- (append-only) — requires attendance.override.
create policy attendance_events_update_override on attendance_events for update
  using (organization_id = current_org() and has_perm_branch('attendance.override', branch_id))
  with check (organization_id = current_org() and has_perm_branch('attendance.override', branch_id));

grant select, insert, update on attendance_events to authenticated;

-- ── attendance_review_queue ───────────────────────────────────────
alter table attendance_review_queue enable row level security;

create policy attendance_review_queue_select_staff on attendance_review_queue for select
  using (organization_id = current_org() and has_perm_branch('attendance.review_queue.resolve', branch_id));
create policy attendance_review_queue_insert_staff on attendance_review_queue for insert
  with check (organization_id = current_org() and has_perm_branch('attendance.record', branch_id));
create policy attendance_review_queue_update_staff on attendance_review_queue for update
  using (organization_id = current_org() and has_perm_branch('attendance.review_queue.resolve', branch_id))
  with check (organization_id = current_org() and has_perm_branch('attendance.review_queue.resolve', branch_id));

grant select, insert, update on attendance_review_queue to authenticated;

-- ── staff_attendance_events ───────────────────────────────────────
alter table staff_attendance_events enable row level security;

create policy staff_attendance_events_select_self on staff_attendance_events for select
  using (exists (select 1 from memberships m where m.id = staff_attendance_events.membership_id and m.user_id = current_user_id()));
-- Payroll-adjacent staff read — reuses attendance.read.
create policy staff_attendance_events_select_staff on staff_attendance_events for select
  using (organization_id = current_org() and has_perm_branch('attendance.read', branch_id));
create policy staff_attendance_events_insert_self on staff_attendance_events for insert
  with check (
    method <> 'admin_override'
    and exists (
      select 1 from memberships m where m.id = staff_attendance_events.membership_id
        and m.user_id = current_user_id() and m.organization_id = current_org()
    )
    and has_perm_branch('attendance.self_record', branch_id)
  );
-- admin_override: staff-attendance equivalent of attendance_events'
-- method='override' branch.
create policy staff_attendance_events_insert_override on staff_attendance_events for insert
  with check (organization_id = current_org() and method = 'admin_override' and has_perm_branch('attendance.override', branch_id));

grant select, insert on staff_attendance_events to authenticated;

-- ── notification_templates ────────────────────────────────────────
alter table notification_templates enable row level security;

-- Read: platform library (any authenticated user) or the caller's own org,
-- gated on either permission that needs to read a template.
create policy notification_templates_select on notification_templates
  for select to authenticated
  using (
    organization_id is null
    or (organization_id = current_org() and (has_perm('notify.template.manage') or has_perm('notify.send.manual')))
  );
create policy notification_templates_insert_staff on notification_templates
  for insert to authenticated
  with check (organization_id = current_org() and has_perm('notify.template.manage'));
create policy notification_templates_update_staff on notification_templates
  for update to authenticated
  using (organization_id = current_org() and has_perm('notify.template.manage'))
  with check (organization_id = current_org() and has_perm('notify.template.manage'));

grant select, insert, update on notification_templates to authenticated;

-- ── notification_preferences ──────────────────────────────────────
alter table notification_preferences enable row level security;

create policy notification_preferences_self on notification_preferences
  for all to authenticated
  using (user_id = current_user_id())
  with check (user_id = current_user_id());

grant select, insert, update, delete on notification_preferences to authenticated;

-- ── notification_deliveries ───────────────────────────────────────
alter table notification_deliveries enable row level security;

create policy notification_deliveries_select_staff on notification_deliveries
  for select to authenticated
  using (organization_id = current_org() and has_perm('notify.log.read'));
create policy notification_deliveries_insert_staff on notification_deliveries
  for insert to authenticated
  with check (organization_id = current_org() and has_perm('notify.send.manual') and status = 'queued');

grant select, insert on notification_deliveries to authenticated;

-- ── push_subscriptions ────────────────────────────────────────────
alter table push_subscriptions enable row level security;

create policy push_subscriptions_select_self on push_subscriptions
  for select to authenticated
  using (user_id = current_user_id());
create policy push_subscriptions_insert_self on push_subscriptions
  for insert to authenticated
  with check (user_id = current_user_id());
create policy push_subscriptions_delete_self on push_subscriptions
  for delete to authenticated
  using (user_id = current_user_id());

grant select, insert, delete on push_subscriptions to authenticated;

-- ── listings ──────────────────────────────────────────────────────
alter table listings enable row level security;

create policy listings_select_staff on listings for select to authenticated
  using (organization_id = current_org() and has_perm('market.listing.manage'));
create policy listings_insert_staff on listings for insert to authenticated
  with check (organization_id = current_org() and has_perm('market.listing.manage'));
create policy listings_update_staff on listings for update to authenticated
  using (organization_id = current_org() and has_perm('market.listing.manage'))
  with check (organization_id = current_org() and has_perm('market.listing.manage'));

grant select, insert, update on listings to authenticated;
grant select on listings to service_role;
grant execute on function activate_org_listings(uuid) to authenticated;

-- ── leads ─────────────────────────────────────────────────────────
alter table leads enable row level security;

-- No self-insert RLS path — the only writer is the anonymous public capture
-- flow (service-role). Staff read/triage is real RLS.
create policy leads_select_staff on leads for select to authenticated
  using (organization_id = current_org() and has_perm('market.lead.read'));
create policy leads_update_staff on leads for update to authenticated
  using (organization_id = current_org() and has_perm('market.lead.assign'))
  with check (organization_id = current_org() and has_perm('market.lead.assign'));

grant select, update on leads to authenticated;

-- ── reviews ───────────────────────────────────────────────────────
alter table reviews enable row level security;

create policy reviews_select_org on reviews for select to authenticated
  using (organization_id = current_org());
-- Self-service create — verified-student proof via enrollment_id.
create policy reviews_insert_self on reviews for insert to authenticated
  with check (
    organization_id = current_org()
    and author_user_id = current_user_id()
    and exists (
      select 1 from enrollments e
      where e.id = enrollment_id
        and e.student_user_id = current_user_id()
        and e.organization_id = current_org()
    )
  );
create policy reviews_update_staff on reviews for update to authenticated
  using (organization_id = current_org() and has_perm('market.review.respond'))
  with check (organization_id = current_org() and has_perm('market.review.respond'));

grant select, insert, update on reviews to authenticated;

-- ── referrals ─────────────────────────────────────────────────────
alter table referrals enable row level security;

-- Create/read are identity-level self-service — no permission gate.
create policy referrals_select_self on referrals for select to authenticated
  using (referrer_user_id = current_user_id());
-- Attribution is inherently cross-actor (the attributing party is never the
-- referrer who created the code) — referrals_select_self alone would make
-- attribution structurally impossible. This grants read of exactly the
-- un-attributed shape a "redeem this code" lookup needs.
create policy referrals_select_unattributed on referrals for select to authenticated
  using (referred_org_id is null);
-- Postgres ANDs a SELECT policy onto the WITH CHECK validation of the NEW
-- row too — once attributed, neither policy above matches, so this mirrors
-- the UPDATE's own WITH CHECK exactly.
create policy referrals_select_referred_org on referrals for select to authenticated
  using (referred_org_id = current_org() and has_perm('org.settings.update'));
create policy referrals_insert_self on referrals for insert to authenticated
  with check (referrer_user_id = current_user_id() and referred_org_id is null);
create policy referrals_update_attribution on referrals for update to authenticated
  using (referred_org_id is null)
  with check (referred_org_id = current_org() and has_perm('org.settings.update'));

grant select, insert, update on referrals to authenticated;

-- ── staff_profiles ────────────────────────────────────────────────
alter table staff_profiles enable row level security;

create policy staff_profiles_select_self on staff_profiles for select to authenticated
  using (user_id = current_user_id());
create policy staff_profiles_select_staff on staff_profiles for select to authenticated
  using (organization_id = current_org() and
    (has_perm_branch('hr.staff.onboard', branch_id) or has_perm_branch('hr.staff.read', branch_id)));
create policy staff_profiles_insert on staff_profiles for insert to authenticated
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id));
-- Coach self-serve onboarding needs the coach to create their OWN
-- staff_profiles row without holding an HR-admin permission.
create policy staff_profiles_insert_self on staff_profiles for insert to authenticated
  with check (organization_id = current_org() and user_id = current_user_id());
create policy staff_profiles_update on staff_profiles for update to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id))
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id));

grant select, insert, update on staff_profiles to authenticated;

-- ── staff_documents ───────────────────────────────────────────────
alter table staff_documents enable row level security;

create policy staff_documents_select_self on staff_documents for select to authenticated
  using (user_id = current_user_id());
create policy staff_documents_select_staff on staff_documents for select to authenticated
  using (organization_id = current_org() and
    (has_perm_branch('hr.staff.onboard', branch_id) or has_perm_branch('hr.staff.read', branch_id)));
create policy staff_documents_insert_self on staff_documents for insert to authenticated
  with check (organization_id = current_org() and user_id = current_user_id());
create policy staff_documents_insert_staff on staff_documents for insert to authenticated
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id));
create policy staff_documents_update_staff on staff_documents for update to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id))
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id));
create policy staff_documents_delete_self on staff_documents for delete to authenticated
  using (user_id = current_user_id() and review_status = 'pending');
create policy staff_documents_delete_staff on staff_documents for delete to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id));

grant select, insert, update, delete on staff_documents to authenticated;

-- ── staff_availability ────────────────────────────────────────────
alter table staff_availability enable row level security;

create policy staff_availability_select_self on staff_availability for select to authenticated
  using (user_id = current_user_id());
create policy staff_availability_select_staff on staff_availability for select to authenticated
  using (organization_id = current_org() and
    (has_perm_branch('hr.staff.onboard', branch_id) or has_perm_branch('hr.staff.read', branch_id)));
create policy staff_availability_insert_self on staff_availability for insert to authenticated
  with check (user_id = current_user_id());
create policy staff_availability_delete_self on staff_availability for delete to authenticated
  using (user_id = current_user_id());

grant select, insert, delete on staff_availability to authenticated;

-- ── leave_requests ────────────────────────────────────────────────
alter table leave_requests enable row level security;

create policy leave_requests_select_self on leave_requests for select to authenticated
  using (user_id = current_user_id());
create policy leave_requests_select_staff on leave_requests for select to authenticated
  using (organization_id = current_org() and
    (has_perm_branch('hr.leave.approve', branch_id) or has_perm_branch('hr.staff.read', branch_id)));
create policy leave_requests_insert_self on leave_requests for insert to authenticated
  with check (user_id = current_user_id() and status = 'pending');
create policy leave_requests_delete_self on leave_requests for delete to authenticated
  using (user_id = current_user_id() and status = 'pending');
create policy leave_requests_update_decide on leave_requests for update to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.leave.approve', branch_id))
  with check (organization_id = current_org() and has_perm_branch('hr.leave.approve', branch_id));

grant select, insert, update, delete on leave_requests to authenticated;

-- ── payout_settings ───────────────────────────────────────────────
alter table payout_settings enable row level security;

create policy payout_settings_select_self on payout_settings for select to authenticated
  using (user_id = current_user_id());
create policy payout_settings_select_staff on payout_settings for select to authenticated
  using (organization_id = current_org() and
    (has_perm_branch('hr.payout_settings.manage', branch_id)
     or has_perm_branch('hr.staff.read', branch_id)
     or has_perm_branch('hr.payout_settings.read', branch_id)));
create policy payout_settings_insert on payout_settings for insert to authenticated
  with check (organization_id = current_org() and has_perm_branch('hr.payout_settings.manage', branch_id));
create policy payout_settings_update on payout_settings for update to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.payout_settings.manage', branch_id))
  with check (organization_id = current_org() and has_perm_branch('hr.payout_settings.manage', branch_id));

grant select, insert, update on payout_settings to authenticated;

-- ── coach_profiles ────────────────────────────────────────────────
alter table coach_profiles enable row level security;

create policy coach_profiles_select_self on coach_profiles for select to authenticated
  using (user_id = current_user_id());
create policy coach_profiles_select_staff on coach_profiles for select to authenticated
  using (organization_id = current_org() and
    (has_perm_branch('hr.staff.onboard', branch_id) or has_perm_branch('hr.staff.read', branch_id)));
create policy coach_profiles_insert_self on coach_profiles for insert to authenticated
  with check (organization_id = current_org() and user_id = current_user_id());
create policy coach_profiles_insert_staff on coach_profiles for insert to authenticated
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id));
create policy coach_profiles_update_self on coach_profiles for update to authenticated
  using (user_id = current_user_id())
  with check (user_id = current_user_id());
create policy coach_profiles_update_staff on coach_profiles for update to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id))
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id));

grant select, insert, update on coach_profiles to authenticated;
grant select on coach_profiles to service_role;

-- ── coach_pricing_policies / coach_pricing_rules ──────────────────
alter table coach_pricing_policies enable row level security;

create policy coach_pricing_policies_select_self on coach_pricing_policies for select to authenticated
  using (coach_profile_id in (select id from coach_profiles where user_id = current_user_id()));
create policy coach_pricing_policies_select_staff on coach_pricing_policies for select to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.staff.read', (select branch_id from coach_profiles where id = coach_pricing_policies.coach_profile_id)));
create policy coach_pricing_policies_write_self on coach_pricing_policies for all to authenticated
  using (coach_profile_id in (select id from coach_profiles where user_id = current_user_id()))
  with check (coach_profile_id in (select id from coach_profiles where user_id = current_user_id()));
create policy coach_pricing_policies_write_staff on coach_pricing_policies for all to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.staff.onboard', (select branch_id from coach_profiles where id = coach_pricing_policies.coach_profile_id)))
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', (select branch_id from coach_profiles where id = coach_pricing_policies.coach_profile_id)));

grant select, insert, update, delete on coach_pricing_policies to authenticated;

alter table coach_pricing_rules enable row level security;

create policy coach_pricing_rules_select on coach_pricing_rules for select to authenticated
  using (policy_id in (
    select p.id from coach_pricing_policies p
    where p.coach_profile_id in (select id from coach_profiles where user_id = current_user_id())
       or (p.organization_id = current_org() and has_perm_branch('hr.staff.read', (select branch_id from coach_profiles where id = p.coach_profile_id)))
  ));
create policy coach_pricing_rules_write on coach_pricing_rules for all to authenticated
  using (policy_id in (
    select p.id from coach_pricing_policies p
    where p.coach_profile_id in (select id from coach_profiles where user_id = current_user_id())
       or (p.organization_id = current_org() and has_perm_branch('hr.staff.onboard', (select branch_id from coach_profiles where id = p.coach_profile_id)))
  ))
  with check (policy_id in (
    select p.id from coach_pricing_policies p
    where p.coach_profile_id in (select id from coach_profiles where user_id = current_user_id())
       or (p.organization_id = current_org() and has_perm_branch('hr.staff.onboard', (select branch_id from coach_profiles where id = p.coach_profile_id)))
  ));

grant select, insert, update, delete on coach_pricing_rules to authenticated;

-- ── metric_definitions ────────────────────────────────────────────
alter table metric_definitions enable row level security;

-- Platform library (org null) is reference data — visible regardless of
-- active org. Org-custom rows are visible to members and writable by
-- Owner/Org Admin (progress.metric.manage).
create policy metric_definitions_select on metric_definitions for select to authenticated
  using (organization_id is null or organization_id = current_org());
create policy metric_definitions_insert on metric_definitions for insert to authenticated
  with check (organization_id = current_org() and has_perm('progress.metric.manage'));
create policy metric_definitions_update on metric_definitions for update to authenticated
  using (organization_id = current_org() and has_perm('progress.metric.manage'))
  with check (organization_id = current_org() and has_perm('progress.metric.manage'));
create policy metric_definitions_delete on metric_definitions for delete to authenticated
  using (organization_id = current_org() and has_perm('progress.metric.manage'));

grant select, insert, update, delete on metric_definitions to authenticated;

-- ── progress_entries ──────────────────────────────────────────────
alter table progress_entries enable row level security;

create policy progress_entries_select_self on progress_entries for select to authenticated
  using (student_user_id = current_user_id());
create policy progress_entries_select_guardian on progress_entries for select to authenticated
  using (is_my_ward(student_user_id, organization_id));
create policy progress_entries_select_staff on progress_entries for select to authenticated
  using (organization_id = current_org() and has_perm_branch('progress.read', branch_id));
create policy progress_entries_insert_staff on progress_entries for insert to authenticated
  with check (organization_id = current_org() and has_perm_branch('progress.metric.log', branch_id));
-- No UPDATE policy: a corrected value is a new entry (append-only-ish).
-- DELETE gated the same as insert so staff can remove a mis-log.
create policy progress_entries_delete_staff on progress_entries for delete to authenticated
  using (organization_id = current_org() and has_perm_branch('progress.metric.log', branch_id));

grant select, insert, delete on progress_entries to authenticated;

-- ── Storage buckets ───────────────────────────────────────────────

-- Avatars — public read (marketplace listing photos, user avatars). Upload
-- still requires a signed URL issued by our own session-checked API, not a
-- bare anon-key client write.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Coach documents — PRIVATE (verification documents are never publicly
-- readable). Upload/read go through the same signed-URL adapter as avatars.
insert into storage.buckets (id, name, public)
values ('coach-documents', 'coach-documents', false)
on conflict (id) do nothing;
