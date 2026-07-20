-- Abhyas V2 — Attendance: face enrollment, attendance events, review queue,
-- staff self-attendance (Doc 07 §8 literal schema + §21.2 staff-attendance
-- extension, folded in now rather than deferred since there's no reason to
-- split it into a later migration the way batch_enrollments/coach_assignments
-- had to wait on `batches`). See IMPLEMENTATION_STATUS.md's Phase 8 section.
--
-- Scope decisions (2026-07-20):
--   * `face_enrollments.embedding` is `vector(128)`, not Doc 07's literal
--     `vector(512)` — the project's locked scope decision (face-api.js's
--     actual descriptor length is 128-float, not the 512-dim model Doc 07
--     assumed; see IMPLEMENTATION_STATUS.md's "User-approved scope changes").
--     Confirmed against the archived V1 schema
--     (`migrations_v1_legacy/0001_*`'s `student_face_samples.embedding
--     vector(128)`), which this phase's face-api.js integration reuses
--     wholesale (model weight files already present at
--     `apps/web/public/models/`, `face-api.js` already an `apps/web`
--     dependency — V1 built real face-scan UI against this exact model).
--   * `face_enrollments.embedding` is nullable, deviating from Doc 07's
--     literal `not null` — necessary to support the tombstone-on-withdrawal
--     behavior the doc's own prose describes one line below the schema
--     ("consent withdrawal: embedding nulled + row tombstoned"): a `not
--     null` column can't later be nulled. `deleted_at` marks the tombstone;
--     `embedding is null` is the actual biometric-data-erased state.
--   * `face_enrollments` gains `membership_id uuid` (nullable) alongside
--     `enrollment_id` (also now nullable) with a check that exactly one is
--     set — Doc 07 §21.2's staff-face-enrollment extension, folded into the
--     base table rather than added as a later ALTER (same reasoning as
--     staff_attendance_events below: no `batches`-style dependency forced a
--     later migration here, so there's no reason to ship the narrower
--     student-only version first).
--   * `staff_attendance_events` (Doc 07 §21.2) ships this phase, not
--     deferred — it has no unbuilt dependency (`memberships` has existed
--     since Phase 3) and is explicitly in this module's own scope comment
--     (`packages/modules/attendance/src/service.ts`'s header, README.md),
--     unlike Doc 07 §21.1's per-day coach assignment `days`/`role` columns
--     (already built in migration 0009) or §21.2's `class_sessions
--     .coach_user_ids` denormalization (UX scoping, not a security
--     boundary — not built, no consumer needs it yet, same "schema follows
--     the module that needs it" precedent as `programs.sport_key`).
--   * Doc 04 §21.2's `admin_override` gate ("requires existing
--     `attendance.write` at branch scope") references a permission key that
--     doesn't exist in Doc 04 §4's actual catalogue (migration 0006 seeded
--     `attendance.override`, not `attendance.write`) — same interpretive-
--     translation category as migration 0006's own header notes. Mapped to
--     `attendance.override`, the seeded permission covering corrections/
--     admin actions on attendance records generally.
--   * `match_face()` is `SECURITY DEFINER` and takes NO org/tenant
--     parameter — it derives scope from `current_org()` (session GUC) and a
--     caller-supplied `batch_id` it independently verifies belongs to that
--     org. This closes a real gap found in the archived V1 function of the
--     same name (`migrations_v1_legacy/0004_functions_triggers.sql`):
--     `match_face_embedding(p_tenant_id uuid, ...)` took the tenant as a
--     caller-supplied parameter with no check that the caller actually
--     belonged to it — any authenticated caller could pass an arbitrary
--     `p_tenant_id` and search another org's enrolled faces. Doc 07 §17
--     calls this out by name ("fixes gap G-`match_face_embedding`"); this
--     migration is where that fix lands.
--   * "Own batches" scoping (Doc 04 §6, `my_batch_ids()`) is an app-layer
--     filter for Coach-facing listings, not a second RLS gate — same
--     precedent migrations 0008 (`enrollments_select_staff`) and 0009
--     (`batches_select_staff`) already established: a branch-scoped
--     permission grant via `has_perm_branch()` is sufficient at the RLS
--     layer even where the Doc 04 §5 matrix marks a role "🔷 own batches".
--   * Low-confidence face matches never write `attendance_events` directly
--     (US-3 AC2, "never auto-fine") — `checkInByFace` (service layer) routes
--     them to `attendance_review_queue` instead; only a resolved (confirmed)
--     queue item or a high-confidence match produces a real attendance
--     event. Corrections to an existing event are append-only via
--     `superseded_by` (the OLD row is updated to point at the NEW row, never
--     edited in place) — enforced at the service layer (RLS permits the
--     column-scoped UPDATE; the codebase's established trust boundary is the
--     service function, not a column-grant restriction — same precedent as
--     every other module's `withRequestContext` callers).
--   * Absence marking (grace-period expiry off `class_sessions`/
--     `batches.grace_minutes`) and the consent-withdrawal embedding purge
--     are both service-role background jobs (`attendance.evaluate_absences`,
--     `attendance.purge_withdrawn_face_embeddings`), not triggers — matches
--     migration 0009's own precedent that this codebase keeps business logic
--     in `service.ts` and reserves PL/pgSQL for RLS-adjacent invariants.
--     `attendance.evaluate_absences` inserting an `absent` row also enqueues
--     `attendance.absence_confirmed` (Doc 14 §8's literal event-kind name,
--     "→ notifications + finance consumers") — no handler exists for it yet
--     (Notifications/Finance are Phases 9-10), so these will dead-letter
--     after 5 attempts (migration 0002's default) until a later phase
--     registers a consumer. Harmless: nothing currently reads job failure
--     state for a user-facing purpose, and the underlying signal (the
--     `absent` `attendance_events` row itself) is real and immediately
--     queryable regardless of whether anything consumes the event yet.

-- ── face_enrollments (Doc 07 §8 + §21.2) ──────────────────────────
create table face_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  enrollment_id uuid references enrollments(id),
  membership_id uuid references memberships(id),
  consent_id uuid not null references consents(id),
  embedding vector(128),              -- nullable: see header (tombstone-on-withdrawal)
  quality_score real,
  source_path text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    (enrollment_id is not null and membership_id is null) or
    (enrollment_id is null and membership_id is not null)
  )
);

create index face_enrollments_enrollment_id_idx on face_enrollments (enrollment_id) where enrollment_id is not null;
create index face_enrollments_membership_id_idx on face_enrollments (membership_id) where membership_id is not null;
-- HNSW cosine index (Doc 07 §17 hot-path list) — partial: only live (non-null,
-- non-tombstoned) embeddings are ever searched by match_face().
create index face_enrollments_embedding_idx on face_enrollments
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null and deleted_at is null;

-- "No consent row → no embedding, DB-enforced" (Doc 07 §8 prose) — a
-- BEFORE INSERT trigger rather than a bare FK, because the invariant is
-- richer than "row exists": the consent must be `biometric_face`, not
-- withdrawn, and actually belong to the same person the enrollment is for
-- (the student on `enrollment_id`, or the membership's user on
-- `membership_id`) — a caller can't reuse someone else's consent row.
-- SECURITY DEFINER is required, not optional (hit empirically while
-- smoke-testing this migration): the enrolling caller is staff (holds
-- attendance.face.enroll), not the consent's own subject or granter, so
-- consents_select_related's RLS (subject or granter only) would filter the
-- lookup to zero rows from the staff caller's perspective and this would
-- reject every legitimate enrollment — same root cause as has_perm()/
-- is_guardian_of()/is_batch_participant() needing SECURITY DEFINER for
-- their own internal reads (migrations 0006/0008/0009 headers).
create or replace function enforce_face_enrollment_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  subject_id uuid;
begin
  if new.enrollment_id is not null then
    select student_user_id into subject_id from enrollments where id = new.enrollment_id;
  else
    select user_id into subject_id from memberships where id = new.membership_id;
  end if;

  if not exists (
    select 1 from consents
    where id = new.consent_id
      and kind = 'biometric_face'
      and subject_user_id = subject_id
      and withdrawn_at is null
  ) then
    raise exception 'face_enrollment requires an active biometric_face consent for the same subject';
  end if;

  return new;
end;
$$;

create trigger face_enrollments_enforce_consent
  before insert on face_enrollments
  for each row execute function enforce_face_enrollment_consent();

alter table face_enrollments enable row level security;

-- Staff read/write: branch derived via the linked enrollment/membership
-- (face_enrollments itself has no branch_id — same "join outward, don't
-- denormalize" shape as coach_assignments' policies in migration 0009).
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

-- Delete = revoke a specific sample (re-enrollment / bad capture) — same
-- staff scope as insert. Consent-withdrawal purge (the compliance path) is a
-- separate service-role job, not this policy (see header).
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

-- ── attendance_events (Doc 07 §8, literal) ────────────────────────
create table attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  class_session_id uuid not null references class_sessions(id),
  enrollment_id uuid not null references enrollments(id),
  status text not null check (status in ('present','late','absent','excused')),
  method text not null check (method in ('face','qr','manual','override','geofence')),
  confidence real,
  recorded_by uuid references users(id),
  recorded_at timestamptz not null default now(),
  superseded_by uuid references attendance_events(id),
  unique (class_session_id, enrollment_id, recorded_at)
);

-- Hot path (Doc 07 §17): org+session lookups (roster view) and the
-- "does this enrollment already have a live record" idempotency check
-- (service layer, keyed on class_session_id+enrollment_id, filtering
-- superseded_by is null).
create index attendance_events_org_session_idx on attendance_events (organization_id, class_session_id);
create index attendance_events_enrollment_idx on attendance_events (enrollment_id, class_session_id) where superseded_by is null;

alter table attendance_events enable row level security;

create policy attendance_events_select_staff on attendance_events for select
  using (organization_id = current_org() and has_perm_branch('attendance.read', branch_id));

create policy attendance_events_select_self on attendance_events for select
  using (exists (select 1 from enrollments e where e.id = attendance_events.enrollment_id and e.student_user_id = current_user_id()));

create policy attendance_events_select_guardian on attendance_events for select
  using (exists (select 1 from enrollments e where e.id = attendance_events.enrollment_id and is_my_ward(e.student_user_id, e.organization_id)));

-- Single insert policy branching on method (see header): a first-time record
-- (face/qr/manual/geofence) needs attendance.record; a method='override'
-- insert (an explicit correction row) needs attendance.override. Automated
-- absence-marking (evaluateAbsences) goes through the service-role client,
-- bypassing RLS entirely — same shape as materializeSessions().
create policy attendance_events_insert_staff on attendance_events for insert
  with check (
    organization_id = current_org()
    and (
      (method <> 'override' and has_perm_branch('attendance.record', branch_id))
      or (method = 'override' and has_perm_branch('attendance.override', branch_id))
    )
  );

-- Corrections set the OLD row's superseded_by to point at the NEW row
-- (append-only, never edit the status/method/confidence of an existing
-- row) — requires attendance.override, same gate as inserting the
-- correction row itself.
create policy attendance_events_update_override on attendance_events for update
  using (organization_id = current_org() and has_perm_branch('attendance.override', branch_id))
  with check (organization_id = current_org() and has_perm_branch('attendance.override', branch_id));

grant select, insert, update on attendance_events to authenticated;

-- ── attendance_review_queue (Doc 07 §8, literal) ──────────────────
create table attendance_review_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  class_session_id uuid not null references class_sessions(id),
  candidate_enrollment_id uuid references enrollments(id),
  confidence real not null,
  source_path text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index attendance_review_queue_org_status_idx on attendance_review_queue (organization_id, status);

alter table attendance_review_queue enable row level security;

-- Doc 04 §5's "Review queue" row (✅ Owner/Org Admin, 🔷 branch Branch Admin,
-- 🔷 own batches Coach, — everyone else) maps exactly onto who holds
-- attendance.review_queue.resolve in migration 0006's seed — one permission
-- gates both visibility and resolution, no separate read-only key needed.
create policy attendance_review_queue_select_staff on attendance_review_queue for select
  using (organization_id = current_org() and has_perm_branch('attendance.review_queue.resolve', branch_id));

-- Created by a low-confidence face-match attempt — the caller running the
-- scanner needs attendance.record (the same permission a successful match
-- would have used to write attendance_events directly).
create policy attendance_review_queue_insert_staff on attendance_review_queue for insert
  with check (organization_id = current_org() and has_perm_branch('attendance.record', branch_id));

create policy attendance_review_queue_update_staff on attendance_review_queue for update
  using (organization_id = current_org() and has_perm_branch('attendance.review_queue.resolve', branch_id))
  with check (organization_id = current_org() and has_perm_branch('attendance.review_queue.resolve', branch_id));

grant select, insert, update on attendance_review_queue to authenticated;

-- ── staff_attendance_events (Doc 07 §21.2) ────────────────────────
create table staff_attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  membership_id uuid not null references memberships(id),
  kind text not null check (kind in ('check_in','check_out')),
  method text not null check (method in ('selfie_face','manual','admin_override')),
  geo jsonb,
  confidence real,
  recorded_by uuid references users(id),
  recorded_at timestamptz not null default now()
);

create index staff_attendance_events_org_membership_idx on staff_attendance_events (organization_id, membership_id, recorded_at);

alter table staff_attendance_events enable row level security;

create policy staff_attendance_events_select_self on staff_attendance_events for select
  using (exists (select 1 from memberships m where m.id = staff_attendance_events.membership_id and m.user_id = current_user_id()));

-- Payroll-adjacent staff read (Doc 04 §21.2: "Owner/Admin org-wide, Branch
-- Admin branch-scope") — reuses attendance.read rather than an HR-owned
-- permission (hr.* doesn't exist for this row shape; HR module is Phase 12).
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
-- method='override' branch — Doc 04 §21.2's "admin_override requires
-- attendance.write", translated to attendance.override (see header).
create policy staff_attendance_events_insert_override on staff_attendance_events for insert
  with check (organization_id = current_org() and method = 'admin_override' and has_perm_branch('attendance.override', branch_id));

grant select, insert on staff_attendance_events to authenticated;

-- ── match_face(): SECURITY DEFINER, org derived from session (Doc 07 §17,
-- fixes the V1 gap — see header) ──────────────────────────────────
create or replace function match_face(p_batch_id uuid, p_embedding vector(128), p_match_count int default 3)
returns table (enrollment_id uuid, similarity real)
language sql stable security definer set search_path = public as $$
  select fe.enrollment_id, (1 - (fe.embedding <=> p_embedding))::real as similarity
  from face_enrollments fe
  join enrollments e on e.id = fe.enrollment_id
  join batch_enrollments be on be.enrollment_id = e.id
  join batches b on b.id = be.batch_id
  where b.id = p_batch_id
    and b.organization_id = current_org()
    and fe.embedding is not null
    and fe.deleted_at is null
    and be.status = 'active'
  order by fe.embedding <=> p_embedding asc
  limit p_match_count
$$;
