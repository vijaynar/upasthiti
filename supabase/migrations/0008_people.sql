-- Abhyas V2 — People: Enrollment, Guardianship, Consent (Doc 07 §6, Doc 04 §7,
-- Doc 02 §6-9). There is no dedicated People doc in docsV2/ — spec is
-- scattered across those three, see IMPLEMENTATION_STATUS.md's Phase 6
-- section for the pointer breakdown.
--
-- Scope decisions (2026-07-20):
--   * `enrollments` (Doc 07 §6, literal) lands here. `batch_enrollments` does
--     NOT — it FKs into `batches`, which doesn't exist until Scheduling
--     (Phase 7). Same "schema follows the module that needs it" precedent as
--     `org_domains` (migration 0004) and `coach_assignments.batch_id`
--     (migration 0006): building a join table with nothing to join to yet
--     just produces dead schema. `enrollments` alone is fully useful without
--     it (it's the org-scoped student record; batch membership is a Phase 7
--     concern layered on top).
--   * `is_guardian_of()`/`has_consent_authority()`/`is_my_ward()` are the
--     guardianship-aware RLS primitives Doc 04 §7 needs and Phase 4 deferred
--     (`is_my_ward()` specifically needed `enrollments` to know if a ward is
--     actually enrolled in the target org — that's what this migration adds).
--     Split into three functions rather than one because they gate different
--     things: `is_guardian_of` (bare active link — join-request-for-a-ward),
--     `has_consent_authority` (link + consent_authority=true — consent
--     capture, matches Doc 04 §7's "Capture/withdraw biometric & minor
--     consents" row), `is_my_ward` (link + active enrollment in the target
--     org + org's guardian_visibility setting — cross-org reads like
--     enrollments itself, and later attendance/progress/finance in their own
--     phases). All three are SECURITY DEFINER for the same reason
--     has_perm()/has_perm_branch() are (migration 0006 header): they're
--     called from RLS policies on tables they also query internally
--     (`guardianships`, `enrollments`), which would otherwise recurse through
--     the calling role's own RLS.
--   * `consents` and `join_requests` had guardian-shaped gaps this migration
--     closes, not just additions:
--     - `consents_insert_self_granted`/`_update_self_granted` (migration
--       0003) checked ONLY `granted_by = current_user_id()` — nothing tied
--       `subject_user_id` to the granter, so any authenticated user could
--       already grant a consent row for an arbitrary subject. Not exploited
--       (nothing read consents for authorization decisions yet), but a real
--       gap, closed here by requiring self-subject or
--       `has_consent_authority(subject_user_id)`.
--     - `join_requests_insert_self` (migration 0004) locked subject to
--       requester deliberately, with a comment pointing at this migration —
--       replaced with a guardian-aware version per that comment.
--   * `users_select_ward` is new: guardians had no RLS path to read a ward's
--     own `users` row (Doc 04 §7 "Read ward's profile") — migration 0003's
--     `users` policies are self-only. Added here alongside the other
--     guardianship-derived reads rather than in 0003, since it depends on
--     `guardianships` (already existed) but conceptually belongs with this
--     migration's "guardianship-aware policies" theme.
--   * No admin UI precedent broken: this migration, like every phase before
--     it, ships real RLS + service + routes; UI coverage is scoped in the
--     app layer, not gated on schema completeness.

-- ── Enrollments (Doc 07 §6) ──────────────────────────────────────
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),   -- enrollment decides visibility (Doc 04 §6)
  student_user_id uuid not null references users(id),
  status text not null default 'active' check (status in
    ('active','paused','completed','cancelled')),
  roll_number text,                  -- org-local profile data lives HERE, not on users
  profile jsonb not null default '{}',   -- org-specific fields (sport level, uniform size…)
  started_on date not null, ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),   -- convention #9 (Doc 07 §1); Doc 07 §6's
                                                     -- literal snippet omits it, status is mutable
  unique (organization_id, student_user_id, branch_id)
);

create trigger enrollments_set_updated_at
  before update on enrollments
  for each row execute function set_updated_at();

create index enrollments_organization_id_idx on enrollments (organization_id, branch_id, status);
create index enrollments_student_user_id_idx on enrollments (student_user_id);

-- ── Guardianship-aware RLS primitives (Doc 04 §7, Doc 02 §5) ────
create or replace function is_guardian_of(p_ward_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from guardianships
    where guardian_user_id = current_user_id()
      and ward_user_id = p_ward_user_id
      and status = 'active'
  )
$$;

create or replace function has_consent_authority(p_ward_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from guardianships
    where guardian_user_id = current_user_id()
      and ward_user_id = p_ward_user_id
      and consent_authority = true
      and status = 'active'
  )
$$;

-- Guardian read access to a ward's org-scoped data: active guardianship AND
-- the ward has an active enrollment in the target org AND that org hasn't
-- turned guardian visibility off (Doc 02 §12 assumption: default on).
create or replace function is_my_ward(p_ward_user_id uuid, p_organization_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_guardian_of(p_ward_user_id)
    and exists (
      select 1 from enrollments
      where student_user_id = p_ward_user_id
        and organization_id = p_organization_id
        and status = 'active'
    )
    and coalesce((
      select (settings->>'guardian_visibility')::boolean
      from organizations where id = p_organization_id
    ), true)
$$;

-- ── Enrollments RLS ───────────────────────────────────────────────
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

-- ── users: guardian read (Doc 04 §7 "Read ward's profile") ───────
create policy users_select_ward on users for select
  using (is_guardian_of(id));

-- ── consents: close the any-subject gap (see header) ─────────────
drop policy consents_insert_self_granted on consents;
drop policy consents_update_self_granted on consents;

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

-- ── join_requests: guardian-on-behalf-of-a-ward (Doc 02 §9) ──────
drop policy join_requests_insert_self on join_requests;

create policy join_requests_insert_self_or_ward on join_requests for insert
  with check (
    requester_user_id = current_user_id()
    and (subject_user_id = current_user_id() or is_guardian_of(subject_user_id))
  );
