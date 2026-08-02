-- Backend support for the Student Portal (docsV2/STUDENT_PORTAL_SPEC.md
-- Tier 1 + the two Phase-A schema additions the spec's Open Questions
-- resolved to "build now"):
--   1. metric_definitions.target_value / batches.primary_metric_key — the
--      mockup's per-batch "Progress %" ring has no formula anywhere in the
--      schema (progress_entries is per-metric numeric values, no notion of
--      a single 0-100 "batch progress"). Per the answered open question,
--      progress is goal-based on ONE metric the batch tracks (e.g. swimming:
--      50-lap goal), staff-picked per batch rather than inferred — hence a
--      nullable primary_metric_key on batches (which metric represents this
--      batch's progress) and a nullable target_value on metric_definitions
--      (the goal for that metric). Both default null: a batch with neither
--      set renders "not tracked yet", never a fabricated percentage. Read
--      side resolves value/target and applies metric_definitions.direction
--      the same way progress already does elsewhere.
--   2. batch_join_requests + batches_select_org_student — the mockup's
--      "Pending Approvals" stat needs a real batch-level join-request flow
--      (answered open question: "student requests to join a batch, coach
--      approves"), which doesn't exist today — batch_enrollments only ever
--      gets written by staff (schedule.batch.update via addToBatchRoster),
--      there's no student-initiated path and no pending state. This is the
--      exact batch-scoped analog of the existing org-level join_requests
--      table (migration 0002) — same requester/subject/status/decided_by
--      shape, scoped to a batch instead of an org. Kept as its own table
--      rather than adding a 'pending' status to batch_enrollments: that
--      table's composite PK is (enrollment_id, batch_id), so a rejected
--      request would permanently occupy the PK a later approval needs, and
--      every existing staff roster policy/query already assumes
--      batch_enrollments == real membership. Approval is a plain two-write
--      transaction under the approving staff member's own RLS session
--      (mark the request decided, then upsert batch_enrollments) — no
--      service-role needed, since a staff member who can see a pending
--      request already holds schedule.batch.update on that batch, the same
--      permission batch_enrollments_insert_staff requires.
--      batches_select_org_student is the missing prerequisite: today a
--      student can only SELECT a batch they're already IN
--      (batches_select_participant/is_batch_participant) — there was no way
--      to browse batches to request joining one. Scoped to "any active batch
--      in an org where I hold an active enrollment" (org-wide, not
--      branch-limited — a multi-branch academy's students browsing batches
--      to join is expected to see the whole org, same breadth
--      org_announcements already assumes for "All Students").
--   3. coach_assignments_select_student / users_select_org_coach_of_mine /
--      programs_select_student — the student "My Batches"/dashboard
--      aggregate needs a batch's coach name and program name, and neither
--      is visible to a student today: coach_assignments_select_visible only
--      covers the assignee themself or staff with people.member.read;
--      programs_select_member requires an active membership (staff/coach
--      have those, students have enrollments instead); users has no
--      staff-of-mine carve-out at all. Same "silent-empty-join" shape
--      IMPLEMENTATION_STATUS.md's Phase 12/13 sections and migration 0010's
--      users_select_org_join_requester already document for this schema —
--      not a new pattern, just the next table that needed it. All three are
--      scoped to exactly "a batch I'm actively enrolled in" via
--      batch_enrollments, mirroring is_batch_participant()'s own shape.
--   4. org_announcements_select_student / org_announcement_batches_select_student
--      — same gap again: org_announcements_select_staff (migration 0008)
--      requires notify.announcement.read, a permission only staff roles
--      hold (migration 0006's seed), so a student could not see the org
--      notice board at all despite the dashboard mockup showing it front
--      and center. Scoped to published announcements only, and for
--      batch-targeted ones, only if the student is actively in one of the
--      target batches (org_announcement_batches, migration 0009) — same
--      audience rule staff already see when authoring, just applied on read.

-- ── metric_definitions.target_value ──────────────────────────────────
alter table metric_definitions
  add column target_value numeric check (target_value is null or target_value > 0);

-- ── batches.primary_metric_key ───────────────────────────────────────
-- Loose reference (no FK), same precedent as batches.default_fee_policy_id's
-- sibling programs.sport_key / metric_definitions.sport_key — resolved at
-- read time against metric_definitions.key, org-specific row preferred over
-- the platform-library default (same "organization_id nulls last" precedence
-- listMetricDefinitions already establishes).
alter table batches
  add column primary_metric_key text;

-- ── batch_join_requests ──────────────────────────────────────────────
create table batch_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  batch_id uuid not null references batches(id) on delete cascade,
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  requested_by uuid not null references users(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

-- One live request per (batch, enrollment) at a time — a rejected row
-- doesn't block re-requesting, since it falls outside this partial index.
create unique index batch_join_requests_pending_unique
  on batch_join_requests (batch_id, enrollment_id) where status = 'pending';

create index batch_join_requests_batch_idx on batch_join_requests (batch_id, status);

alter table batch_join_requests enable row level security;

create policy batch_join_requests_select_self on batch_join_requests for select to authenticated
  using (
    exists (
      select 1 from enrollments e
      where e.id = batch_join_requests.enrollment_id and e.student_user_id = current_user_id()
    )
  );

create policy batch_join_requests_select_staff on batch_join_requests for select to authenticated
  using (
    exists (
      select 1 from batches b
      where b.id = batch_join_requests.batch_id
        and b.organization_id = current_org()
        and has_perm_branch('schedule.batch.update', b.branch_id)
    )
  );

-- Self-insert only, own enrollment, always starts 'pending' (status isn't
-- caller-suppliable beyond the column default since this policy doesn't
-- reference it, but requested_by/enrollment ownership is the real gate).
create policy batch_join_requests_insert_self on batch_join_requests for insert to authenticated
  with check (
    requested_by = current_user_id()
    and exists (
      select 1 from enrollments e
      where e.id = batch_join_requests.enrollment_id
        and e.student_user_id = current_user_id()
        and e.organization_id = batch_join_requests.organization_id
    )
  );

-- Decide (approve/reject) — staff only, same branch-scoped permission as
-- batch_enrollments_insert_staff so an approval's second write (the roster
-- upsert) succeeds under the same session without a service-role escalation.
create policy batch_join_requests_update_staff on batch_join_requests for update to authenticated
  using (
    exists (
      select 1 from batches b
      where b.id = batch_join_requests.batch_id
        and b.organization_id = current_org()
        and has_perm_branch('schedule.batch.update', b.branch_id)
    )
  )
  with check (
    exists (
      select 1 from batches b
      where b.id = batch_join_requests.batch_id
        and b.organization_id = current_org()
        and has_perm_branch('schedule.batch.update', b.branch_id)
    )
  );

grant select, insert, update on batch_join_requests to authenticated;

-- ── batches_select_org_student (browse-to-join) ──────────────────────
create policy batches_select_org_student on batches for select to authenticated
  using (
    status = 'active'
    and exists (
      select 1 from enrollments e
      where e.student_user_id = current_user_id()
        and e.organization_id = batches.organization_id
        and e.status = 'active'
    )
  );

-- ── coach_assignments_select_student / users_select_org_coach_of_mine /
--    programs_select_student (batch-detail read carve-outs) ────────────
create policy coach_assignments_select_student on coach_assignments for select to authenticated
  using (
    exists (
      select 1 from batch_enrollments be
      join enrollments e on e.id = be.enrollment_id
      where be.batch_id = coach_assignments.batch_id
        and be.status = 'active'
        and e.student_user_id = current_user_id()
    )
  );

create policy users_select_org_coach_of_mine on users for select to authenticated
  using (
    exists (
      select 1 from coach_assignments ca
      join memberships m on m.id = ca.membership_id
      join batch_enrollments be on be.batch_id = ca.batch_id and be.status = 'active'
      join enrollments e on e.id = be.enrollment_id
      where m.user_id = users.id
        and e.student_user_id = current_user_id()
    )
  );

create policy programs_select_student on programs for select to authenticated
  using (
    exists (
      select 1 from batches b
      join batch_enrollments be on be.batch_id = b.id and be.status = 'active'
      join enrollments e on e.id = be.enrollment_id
      where b.program_id = programs.id
        and e.student_user_id = current_user_id()
    )
  );

-- ── org_announcements_select_student / org_announcement_batches_select_student ──
create policy org_announcements_select_student on org_announcements for select to authenticated
  using (
    status = 'published'
    and exists (
      select 1 from enrollments e
      where e.student_user_id = current_user_id()
        and e.organization_id = org_announcements.organization_id
        and e.status = 'active'
    )
    and (
      audience_type = 'all'
      or exists (
        select 1 from org_announcement_batches oab
        join batch_enrollments be on be.batch_id = oab.batch_id and be.status = 'active'
        join enrollments e2 on e2.id = be.enrollment_id
        where oab.announcement_id = org_announcements.id
          and e2.student_user_id = current_user_id()
      )
    )
  );

create policy org_announcement_batches_select_student on org_announcement_batches for select to authenticated
  using (
    exists (
      select 1 from batch_enrollments be
      join enrollments e on e.id = be.enrollment_id
      where be.batch_id = org_announcement_batches.batch_id
        and be.status = 'active'
        and e.student_user_id = current_user_id()
    )
  );
