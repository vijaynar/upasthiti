-- Abhyas V2 — Progress & Performance (Doc 07 §13, Doc 04 §5 "Progress &
-- performance" row, Doc 00 M11). Last feature module.
--
-- Scope: metric_definitions (platform library + org-custom) and
-- progress_entries (packages/modules/progress's README). Coaches log
-- sport-specific metrics + vitals per enrolled student; students/guardians
-- read their own trend over time.
--
-- Scope decisions (2026-07-21):
--   * `progress_entries` denormalizes organization_id + branch_id (from the
--     enrollment) + student_user_id (for the self/guardian SELECT policies),
--     same convention as attendance_events / staff_profiles — RLS reads
--     has_perm_branch(perm, branch_id) and is_my_ward(student_user_id, org)
--     inline with no join back through enrollments. student_user_id is
--     denormalized rather than resolved via an EXISTS into enrollments so
--     the self/guardian policies stay flat (an inline EXISTS would be a
--     one-directional cross-table read into enrollments — legal, but
--     denormalization matches how every prior self-scoped table did it).
--   * "Own batches" (Doc 04 §6, Coach 🔷) is an APP-LAYER filter, NOT a
--     second RLS gate — the same decision migrations 0009 (Scheduling) and
--     0010 (Attendance) already made and documented ("permission grant via
--     has_perm_branch() is sufficient at the RLS level"). RLS here gates by
--     branch + permission only; the /progress coach view filters its student
--     picker to my_batch_ids() (Phase 4) client/service-side. A coach
--     reading a progress row for a same-branch student not in their batch is
--     not a security boundary the matrix draws — Owner/Org Admin see the
--     whole branch anyway, and the coach already reads that student's
--     attendance under the identical Phase-8 rule.
--   * The read/log split in the access matrix (Branch Admin 👁, Asst Coach
--     "log only") is already encoded in migration 0006's role_permissions —
--     branch_admin holds `progress.read` but not `progress.metric.log`;
--     assistant_coach holds `progress.metric.log` but not `progress.read`
--     (can log, can't read back — matches "log only"). RLS just reads those
--     two keys; no per-role special-casing needed here.
--   * One permission key added beyond the Doc 04 §4 catalogue:
--     `progress.metric.manage` (Owner + Org Admin) — gates creating/editing
--     ORG-CUSTOM metric definitions (org config, org-wide not branch-scoped,
--     so gated by has_perm() not has_perm_branch()). The catalogue has no
--     metric-definition-management key and none of the three progress keys
--     fits (logging a value ≠ defining a new metric type). Same "add one,
--     documented" precedent as finance.payout.manage (0011) / hr.staff.read
--     (0014). The platform metric library (organization_id is null) is
--     seeded here and readable by everyone; orgs only ADD to it.
--   * progress_entries is append-only-ish: no UPDATE policy (a corrected
--     value is a new entry, same append-only philosophy as attendance's
--     corrections), but a DELETE gated by `progress.metric.log` is allowed
--     so staff can remove a fat-fingered mis-log — a pragmatic concession,
--     not a full superseded_by chain (progress observations aren't
--     financial/audit records the way attendance/ledger rows are).

-- ── metric_definitions ────────────────────────────────────────────

create table metric_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),  -- null = platform library per sport
  sport_key text,                                      -- taxonomy_sports key, or 'general' for vitals; loose (no FK — 'general' isn't a taxonomy row)
  key text not null,
  label text not null,
  unit text,
  direction text check (direction is null or direction in ('higher_better','lower_better')),  -- null = neutral (height, weight)
  created_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, sport_key, key)
);

create index metric_definitions_sport_key_idx on metric_definitions (sport_key);
create index metric_definitions_organization_id_idx on metric_definitions (organization_id);

-- ── progress_entries ──────────────────────────────────────────────

create table progress_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  student_user_id uuid not null references users(id),  -- denormalized for self/guardian RLS
  metric_key text not null,
  value numeric not null,
  note text,
  recorded_by uuid not null references users(id),
  recorded_on date not null,
  created_at timestamptz not null default now()
);

create index progress_entries_enrollment_metric_idx on progress_entries (enrollment_id, metric_key, recorded_on);
create index progress_entries_organization_id_idx on progress_entries (organization_id);
create index progress_entries_student_user_id_idx on progress_entries (student_user_id);

-- ── Permission catalogue addition (see header note) ───────────────

insert into permissions (key) values ('progress.metric.manage')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_key)
select r.id, x.permission_key
from (values
  ('owner','progress.metric.manage'),
  ('org_admin','progress.metric.manage')
) as x(role_key, permission_key)
join roles r on r.key = x.role_key and r.organization_id is null
on conflict do nothing;

-- ── users: org-staff read path for ENROLLED STUDENTS ─────────────
-- Phase 12's users_select_org_staff (migration 0014) only covers users with
-- an active MEMBERSHIP — i.e. staff. Enrolled students are in `enrollments`,
-- not `memberships`, so that policy doesn't let staff read a student's
-- users row (display_name). The progress roster is the first feature to join
-- users for a *student's* name (People's listEnrollments returns bare
-- student_user_id, same avoid-the-join workaround listMembers used), so this
-- gap surfaces here. Scoped to exactly what people.student.read already
-- grants on enrollments (enrollments_select_staff) — no broader exposure
-- than the staff roster already implies. One-directional cross-table read
-- (users policy reads enrollments; no enrollments policy reads users), so
-- inline EXISTS is safe — no recursion, same shape as users_select_org_staff.
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

-- ── RLS: metric_definitions ───────────────────────────────────────
-- Platform library (org null) is reference data — visible to every
-- authenticated user regardless of active org. Org-custom rows are visible
-- to members of that org and writable by Owner/Org Admin (progress.metric.manage).

alter table metric_definitions enable row level security;

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

-- ── RLS: progress_entries ─────────────────────────────────────────

alter table progress_entries enable row level security;

create policy progress_entries_select_self on progress_entries for select to authenticated
  using (student_user_id = current_user_id());

create policy progress_entries_select_guardian on progress_entries for select to authenticated
  using (is_my_ward(student_user_id, organization_id));

create policy progress_entries_select_staff on progress_entries for select to authenticated
  using (organization_id = current_org() and has_perm_branch('progress.read', branch_id));

create policy progress_entries_insert_staff on progress_entries for insert to authenticated
  with check (organization_id = current_org() and has_perm_branch('progress.metric.log', branch_id));

create policy progress_entries_delete_staff on progress_entries for delete to authenticated
  using (organization_id = current_org() and has_perm_branch('progress.metric.log', branch_id));

grant select, insert, delete on progress_entries to authenticated;

-- ── Platform metric library seed (Doc 07 §13 — org-null reference data) ──
-- Vitals under sport_key 'general'; a starter sport-specific set keyed to the
-- taxonomy_sports seed (migration 0013). Orgs add their own via
-- progress.metric.manage; this is the always-available baseline.

insert into metric_definitions (organization_id, sport_key, key, label, unit, direction) values
  (null, 'general', 'height_cm', 'Height', 'cm', null),
  (null, 'general', 'weight_kg', 'Weight', 'kg', null),
  (null, 'general', 'resting_hr_bpm', 'Resting heart rate', 'bpm', 'lower_better'),
  (null, 'swimming', 'freestyle_50m_sec', '50m freestyle', 'sec', 'lower_better'),
  (null, 'swimming', 'endurance_laps', 'Endurance (continuous laps)', 'laps', 'higher_better'),
  (null, 'cricket', 'batting_avg', 'Batting average', 'runs', 'higher_better'),
  (null, 'cricket', 'bowling_economy', 'Bowling economy', 'runs/over', 'lower_better'),
  (null, 'football', 'sprint_40m_sec', '40m sprint', 'sec', 'lower_better'),
  (null, 'football', 'yo_yo_level', 'Yo-yo endurance level', 'level', 'higher_better'),
  (null, 'basketball', 'free_throw_pct', 'Free-throw accuracy', '%', 'higher_better'),
  (null, 'badminton', 'smash_speed_kmh', 'Smash speed', 'km/h', 'higher_better'),
  (null, 'tennis', 'serve_speed_kmh', 'Serve speed', 'km/h', 'higher_better'),
  (null, 'chess', 'rating', 'Rating', 'elo', 'higher_better'),
  (null, 'athletics', 'sprint_100m_sec', '100m sprint', 'sec', 'lower_better'),
  (null, 'athletics', 'long_jump_m', 'Long jump', 'm', 'higher_better'),
  (null, 'yoga', 'flexibility_score', 'Flexibility score', 'pts', 'higher_better')
on conflict (organization_id, sport_key, key) do nothing;
