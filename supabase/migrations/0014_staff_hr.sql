-- Abhyas V2 — Staff HR & Payroll (Doc 07 §12, Doc 04 §4/§5, Doc 00 M10).
--
-- Scope: staff_profiles, staff_documents, staff_availability, leave_requests,
-- payout_settings (packages/modules/staff-hr's README). Coach onboarding
-- itself (the four workflows in Doc 04 §8) already exists since Phase 3
-- (invitations/join_requests) and Phase 4 (membership_roles) — this
-- migration is the HR *data* layer for a staff member who already holds an
-- org membership, not a second invite mechanism. `hr.staff.onboard` gates
-- creating/managing that HR data, not the role grant itself.
--
-- Scope decisions (2026-07-21):
--   * Every table denormalizes organization_id + branch_id (+ user_id on
--     child tables), same convention as attendance/scheduling (e.g.
--     attendance_events, batches) — RLS reads has_perm_branch(perm,
--     branch_id) directly with no join back through staff_profiles.
--   * The Doc 04 §5 access-matrix "HR & payroll" row bundles staff
--     profiles/documents/availability/leaves/payouts into one row with
--     markers that don't map to the two seeded permission keys' full
--     granularity — same situation migration 0006/0011's header comments
--     describe for Front Desk/Accountant read-only cases. Two more keys
--     added here beyond the Doc 04 §4 catalogue, same precedent as
--     `finance.payout.read`/`people.join_request.read`:
--       - `hr.staff.read` — Branch Admin's "🔷 branch 👁": read-only,
--         branch-scoped, covers staff_profiles/staff_documents/
--         staff_availability/leave_requests (the whole bundle except
--         payout_settings, which has its own read key below).
--       - `hr.payout_settings.read` — Accountant's "👁 payout data" slice of
--         the same row (Accountant otherwise has no HR visibility).
--   * `staff_documents.storage_path` is a plain text reference, not a real
--     upload pipeline — same simplification as finance's `payments.proof_path`
--     (migration 0011); no signed-URL/ClamAV pipeline exists in this repo yet
--     for any module, so building one here would be scope creep beyond
--     "Core" (Doc 00 M10 row).
--   * Document review does NOT gate membership_roles activation. Doc 04 §8
--     says roles "activate on acceptance + any org-required document
--     verification", but wiring a hold-back into RBAC's existing
--     accept-invitation path is a real cross-module coupling change, not a
--     new-table addition — deferred, tracked here rather than silently
--     built halfway. staff_documents.review_status exists so the *data* is
--     there; enforcing it is a future phase's job if this gets revisited.
--   * leave_requests self-service is insert + read + delete-while-pending
--     (withdraw), not update — mirrors join_requests' withdrawn-by-delete
--     shape rather than inventing an OLD-vs-NEW status trigger (Doc 07 §17
--     pattern from migration 0009 Batches, not needed here since "pending"
--     is the only self-mutable state).

-- ── users: org-staff read path (deferred since migration 0003) ────
-- 0003's header says "no org-staff read paths yet (those arrive with
-- memberships in Phase 3)", but no later phase ever added one —
-- tenancy-rbac's listMembers() (Phase 3) works around it by never joining
-- users at all (returns bare user_id, no display_name), and nothing since
-- has needed a co-member's name badly enough to hit the gap. The staff
-- directory / onboarding picker here is the first real consumer: a Staff
-- HR admin needs to see human names for org members, not just UUIDs.
-- Scoped to exactly the visibility `people.member.read` already grants
-- elsewhere (memberships_select_staff, migration 0006) — no broader
-- exposure than an admin already gets from the members list.
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

create table staff_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),          -- null = org-wide staff
  membership_id uuid not null references memberships(id) on delete cascade,
  user_id uuid not null references users(id),       -- denormalized for self-scoped RLS
  designation text,
  employment_type text not null default 'full_time' check (employment_type in
    ('full_time','part_time','contract','volunteer')),
  status text not null default 'active' check (status in ('active','on_leave','offboarded')),
  notes text,
  onboarded_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (membership_id)
);

create index staff_profiles_organization_id_idx on staff_profiles (organization_id);
create index staff_profiles_user_id_idx on staff_profiles (user_id);

create trigger staff_profiles_set_updated_at
  before update on staff_profiles
  for each row execute function set_updated_at();

create table staff_documents (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references staff_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  user_id uuid not null references users(id),
  doc_type text not null check (doc_type in ('id_proof','address_proof','certification','background_check','other')),
  storage_path text not null,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index staff_documents_staff_profile_id_idx on staff_documents (staff_profile_id);
create index staff_documents_organization_id_idx on staff_documents (organization_id);

create table staff_availability (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references staff_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  user_id uuid not null references users(id),
  day_of_week smallint not null check (day_of_week between 1 and 7),  -- ISO dow, matches batches.schedule (0009)
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index staff_availability_staff_profile_id_idx on staff_availability (staff_profile_id);
create index staff_availability_organization_id_idx on staff_availability (organization_id);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references staff_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  user_id uuid not null references users(id),
  kind text not null default 'other' check (kind in ('sick','casual','earned','unpaid','other')),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create index leave_requests_staff_profile_id_idx on leave_requests (staff_profile_id);
create index leave_requests_organization_id_idx on leave_requests (organization_id);

create table payout_settings (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null unique references staff_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  user_id uuid not null references users(id),
  pay_type text not null default 'salary' check (pay_type in ('salary','commission','hourly')),
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  currency char(3) not null default 'INR',
  commission_pct numeric(5,2) check (commission_pct is null or (commission_pct >= 0 and commission_pct <= 100)),
  notes text,
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payout_settings_organization_id_idx on payout_settings (organization_id);

create trigger payout_settings_set_updated_at
  before update on payout_settings
  for each row execute function set_updated_at();

-- ── Permission catalogue additions (see header note above) ────────

insert into permissions (key) values ('hr.staff.read'), ('hr.payout_settings.read')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_key)
select r.id, x.permission_key
from (values
  ('branch_admin','hr.staff.read'),
  ('accountant','hr.payout_settings.read')
) as x(role_key, permission_key)
join roles r on r.key = x.role_key and r.organization_id is null
on conflict do nothing;

-- ── RLS: staff_profiles ────────────────────────────────────────────

alter table staff_profiles enable row level security;

create policy staff_profiles_select_self on staff_profiles for select to authenticated
  using (user_id = current_user_id());

create policy staff_profiles_select_staff on staff_profiles for select to authenticated
  using (organization_id = current_org() and
    (has_perm_branch('hr.staff.onboard', branch_id) or has_perm_branch('hr.staff.read', branch_id)));

create policy staff_profiles_insert on staff_profiles for insert to authenticated
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id));

create policy staff_profiles_update on staff_profiles for update to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id))
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id));

grant select, insert, update on staff_profiles to authenticated;

-- ── RLS: staff_documents ───────────────────────────────────────────

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

-- ── RLS: staff_availability (self-authored, no approval workflow) ──

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

-- ── RLS: leave_requests ─────────────────────────────────────────────

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

-- ── RLS: payout_settings ─────────────────────────────────────────────

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
