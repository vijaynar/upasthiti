-- Abhyas V2 — Scheduling: programs, batches, class sessions, holidays
-- (Doc 07 §7, literal schema), plus the two joins deferred into this phase
-- for lack of a `batches` table: `coach_assignments.batch_id`'s FK
-- (migration 0006) and `batch_enrollments` (Doc 07 §6, migration 0008).
-- See IMPLEMENTATION_STATUS.md's Phase 7 section for the scope pointer.
--
-- Scope decisions (2026-07-20):
--   * `programs.sport_key` is Doc 07's literal `references taxonomy_sports(key)`
--     — that table doesn't exist (Marketplace/taxonomy is deferred, same
--     "schema follows the module that needs it" precedent as `org_domains`
--     and `coach_assignments.batch_id` itself). Kept as a plain `text` column
--     with a comment flagging the future FK, not built here.
--   * Doc 04 §4's permission catalogue has no dedicated `schedule.program.*`
--     key — only `schedule.batch.*`/`schedule.calendar.*`/`schedule.holiday.manage`.
--     Programs are the "what is taught" behind a batch and nothing in Doc 04
--     §5's matrix calls out program management as a separate row, so this
--     migration reuses `schedule.batch.create`/`schedule.batch.update` for
--     program insert/update — an interpretive call, same category as
--     migration 0006's header notes; re-derive from this file if the
--     catalogue ever grows a dedicated key.
--   * `schedule.batch.archive` (seeded in migration 0006 to Owner/Org Admin/
--     Branch Admin but deliberately NOT to Coach — see that migration's
--     `role_permissions` insert) is enforced separately from
--     `schedule.batch.update`, not folded into one RLS policy: a Coach holds
--     `schedule.batch.update` (can edit their batch's schedule/capacity) but
--     not `.archive`, and RLS's WITH CHECK can't compare OLD vs NEW status in
--     one clause the way a BEFORE UPDATE trigger can. `enforce_batch_archive_perm()`
--     below is that trigger — the same shape as this migration's own
--     Last-Owner/seed-admin protection triggers, not a new pattern.
--   * "Own batches" (Doc 04 §6, `my_batch_ids()` — built in migration 0006,
--     unused until this phase populates `coach_assignments`) is NOT layered
--     into the staff RLS policies below as an extra restriction: migration
--     0008's `enrollments_select_staff` already established the precedent
--     that a branch-scoped permission grant (there, Coach's
--     `people.student.read`) is sufficient at the RLS layer even though the
--     Doc 04 §5 matrix marks Coach as "🔷 own batches" for that row —
--     the "own batches" narrowing is a product-level UI/service-layer scope,
--     not a second RLS gate, consistent across both phases. `my_batch_ids()`
--     gets its first real consumer here as an app-layer query filter
--     (`listMyBatches` in the scheduling service), which is what the "own
--     batches" scoping actually means in this codebase.
--   * Student/Parent read access (matrix: "👁 own" / "👁 wards" for
--     Scheduling) is real RLS here (`batches_select_participant`,
--     `class_sessions_select_self/_guardian`) even though no dedicated
--     student/guardian schedule page is built this phase — same "RLS
--     complete now, UI later" precedent as migration 0008's
--     `listWardEnrollments` (service function shipped, no consuming route
--     yet).
--   * `batches` and `batch_enrollments` policies each originally read the
--     other directly (a student/guardian batch-read needs
--     `batch_enrollments`; a staff batch-roster write needs the batch's
--     `branch_id`) — that's a genuine RLS policy cycle, not just a perf
--     concern ("infinite recursion detected in policy for relation
--     batches", hit empirically while smoke-testing). `is_batch_participant()`
--     below breaks it the same way migration 0006's `has_perm()`/
--     `has_perm_branch()` avoid recursion: a `SECURITY DEFINER` function's
--     internal queries run as the owning role, which bypasses RLS entirely
--     rather than re-scoping it, so evaluating `batches`' policies never
--     re-triggers `batch_enrollments`'.
--   * `class_sessions` materialization (Doc 07 §7 "rolling 30-day window
--     job") is real application logic in `@abhyas/module-scheduling`
--     (`materializeSessions`), not a SQL function — this codebase keeps
--     business logic in service.ts and reserves PL/pgSQL for RLS-adjacent
--     invariants (SECURITY DEFINER helpers, protection triggers), and the
--     per-batch timezone math (org.timezone, fixed-offset for `Asia/Kolkata`
--     in v1) is far more legible as TypeScript than as a date/time-heavy
--     PL/pgSQL block.

-- ── Programs (Doc 07 §7) ──────────────────────────────────────────
create table programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  sport_key text,   -- FK to taxonomy_sports(key) deferred — see header
  description text,
  created_at timestamptz not null default now()
);

-- ── Batches (Doc 07 §7) ───────────────────────────────────────────
create table batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  program_id uuid references programs(id),
  name text not null,
  mode text not null default 'in_person' check (mode in ('in_person','online','hybrid')),
  capacity int,
  status text not null default 'active' check (status in ('active','archived')),
  schedule jsonb not null,  -- { days: int[] (ISO dow 1-7), startTime, endTime: 'HH:MM',
                             --   startDate: date, endDate: date|null }
  grace_minutes int not null default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger batches_set_updated_at
  before update on batches
  for each row execute function set_updated_at();

create index batches_organization_id_idx on batches (organization_id, branch_id, status);

-- ── batch_enrollments (Doc 07 §6, deferred from migration 0008) ──
create table batch_enrollments (
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  batch_id uuid not null references batches(id) on delete cascade,
  status text not null default 'active' check (status in ('active','left')),
  joined_on date not null default current_date,
  left_on date,
  primary key (enrollment_id, batch_id)
);

create index batch_enrollments_batch_id_idx on batch_enrollments (batch_id);

-- ── class_sessions (Doc 07 §7, materialized occurrences) ─────────
create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  batch_id uuid not null references batches(id),
  session_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in
    ('scheduled','completed','cancelled','holiday')),
  created_at timestamptz not null default now(),
  unique (batch_id, session_date, starts_at)
);

create index class_sessions_batch_id_idx on class_sessions (batch_id, session_date);
create index class_sessions_organization_id_idx on class_sessions (organization_id, branch_id, session_date);

-- ── Holidays (Doc 07 §7) ──────────────────────────────────────────
create table holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),  -- null = org-wide holiday
  on_date date not null,
  label text not null,
  created_at timestamptz not null default now()
);

create index holidays_organization_id_idx on holidays (organization_id, on_date);

-- ── coach_assignments: add the FK deferred from migration 0006 ───
alter table coach_assignments
  add constraint coach_assignments_batch_id_fkey
  foreign key (batch_id) references batches(id) on delete cascade;

-- ── Programs RLS ──────────────────────────────────────────────────
alter table programs enable row level security;

create policy programs_select_member on programs for select
  using (exists (select 1 from memberships where organization_id = programs.organization_id and user_id = current_user_id()));

create policy programs_insert_staff on programs for insert
  with check (organization_id = current_org() and has_perm('schedule.batch.create'));

create policy programs_update_staff on programs for update
  using (organization_id = current_org() and has_perm('schedule.batch.update'))
  with check (organization_id = current_org() and has_perm('schedule.batch.update'));

grant select, insert, update on programs to authenticated;

-- `batches` and `batch_enrollments` each need to read the other in their own
-- RLS policies (a student/guardian reading a batch needs to check their
-- batch_enrollments row; staff reading/writing a batch_enrollments row needs
-- the batch's branch_id) — a direct EXISTS subquery each way is a genuine
-- policy cycle ("infinite recursion detected in policy for relation
-- batches", hit empirically while smoke-testing this migration), not just a
-- performance concern. Same root cause as migration 0006's has_perm()/
-- has_perm_branch() header note, different shape: there it was one function
-- querying the table its own callers' RLS depends on; here it's two
-- ordinary tables' policies pointing at each other. Fixed the same way —
-- SECURITY DEFINER functions whose internal queries run as the owning role
-- (bypasses RLS entirely, not just re-scopes it), so evaluating one table's
-- policy never re-triggers the other's.
create or replace function is_batch_participant(p_batch_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from batch_enrollments be
    join enrollments e on e.id = be.enrollment_id
    where be.batch_id = p_batch_id
      and (e.student_user_id = current_user_id() or is_my_ward(e.student_user_id, e.organization_id))
  )
$$;

-- ── Batches RLS ───────────────────────────────────────────────────
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

-- Archive is a stricter action than a general update (see header) — a
-- BEFORE UPDATE trigger, not a second RLS policy, since RLS's WITH CHECK
-- only sees the NEW row and can't cheaply compare against OLD.status.
create or replace function enforce_batch_archive_perm() returns trigger
language plpgsql as $$
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    if not has_perm_branch('schedule.batch.archive', old.branch_id) then
      raise exception 'insufficient_permission: schedule.batch.archive required to archive this batch';
    end if;
  end if;
  return new;
end;
$$;

create trigger batches_enforce_archive_perm
  before update on batches
  for each row execute function enforce_batch_archive_perm();

-- ── batch_enrollments RLS ─────────────────────────────────────────
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

-- ── class_sessions RLS ────────────────────────────────────────────
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

-- Manual staff overrides (cancel a session, adjust timing) — the bulk of
-- inserts come from materializeSessions() via the service-role client
-- (worker job, bypasses RLS), this covers ad-hoc staff writes.
create policy class_sessions_insert_staff on class_sessions for insert
  with check (organization_id = current_org() and has_perm_branch('schedule.calendar.manage', branch_id));

create policy class_sessions_update_staff on class_sessions for update
  using (organization_id = current_org() and has_perm_branch('schedule.calendar.manage', branch_id))
  with check (organization_id = current_org() and has_perm_branch('schedule.calendar.manage', branch_id));

grant select, insert, update on class_sessions to authenticated;

-- ── Holidays RLS ──────────────────────────────────────────────────
alter table holidays enable row level security;

create policy holidays_select_member on holidays for select
  using (exists (select 1 from memberships where organization_id = holidays.organization_id and user_id = current_user_id()));

-- has_perm_branch(perm, b) with b = NULL (org-wide holiday) only matches an
-- org-wide membership (branch_id is null on both sides never equates via
-- `=`) — a Branch Admin can still create a branch-specific holiday (b = their
-- branch) but not an org-wide one, matching Doc 04 §5's "Scheduling" row.
create policy holidays_insert_staff on holidays for insert
  with check (organization_id = current_org() and has_perm_branch('schedule.holiday.manage', branch_id));

create policy holidays_update_staff on holidays for update
  using (organization_id = current_org() and has_perm_branch('schedule.holiday.manage', branch_id))
  with check (organization_id = current_org() and has_perm_branch('schedule.holiday.manage', branch_id));

create policy holidays_delete_staff on holidays for delete
  using (organization_id = current_org() and has_perm_branch('schedule.holiday.manage', branch_id));

grant select, insert, update, delete on holidays to authenticated;

-- ── coach_assignments: real write path (was schema-only, migration 0006) ─
drop policy coach_assignments_select_visible on coach_assignments;

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

grant insert, update, delete on coach_assignments to authenticated;
