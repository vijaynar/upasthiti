-- Backend support for the redesigned Students page (People module UI):
--   1. student_notes — a free-text staff note log per enrollment, for the new
--      "Notes" tab / "Add Note" quick action. Nothing in the schema covered
--      this; append-only with author-only delete, same shape as
--      progress_entries' "staff can log, only the author cleans up mis-logs"
--      precedent.
--   2. find_user_by_verified_email() — auth_methods is self-only RLS
--      (auth_methods_self, migration 0005), so a staff caller adding a
--      student "by email" has no way to resolve an existing account's id.
--      SECURITY DEFINER, same pattern as has_perm()/is_batch_participant(),
--      and deliberately returns only id/display_name/avatar_path (never the
--      auth_methods row itself) so this can't be used to enumerate arbitrary
--      account data — just to confirm/link an account the caller already
--      knows the email of.
--   3. users_select_org_join_requester — the Students page's "New Requests"
--      view needs a prospective student's display_name, but neither existing
--      staff-read policy on users covers them: users_select_org_staff needs
--      an active membership, users_select_org_student needs an active
--      enrollment, and a pending join_request is neither yet. Scoped to
--      exactly what people.join_request.read already grants on join_requests
--      itself (join_requests_select_related, migration 0005), and only while
--      the request is still 'pending' — same "silent-empty-join" shape as
--      every other RLS-gated join in this schema, not a new pattern.

-- ── student_notes ────────────────────────────────────────────────────
create table student_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  author_user_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index student_notes_enrollment_idx on student_notes (enrollment_id, created_at desc);

alter table student_notes enable row level security;

create policy student_notes_select_staff on student_notes for select to authenticated
  using (
    organization_id = current_org()
    and exists (
      select 1 from enrollments e
      where e.id = student_notes.enrollment_id
        and has_perm_branch('people.student.read', e.branch_id)
    )
  );

create policy student_notes_insert_staff on student_notes for insert to authenticated
  with check (
    organization_id = current_org()
    and author_user_id = current_user_id()
    and exists (
      select 1 from enrollments e
      where e.id = student_notes.enrollment_id
        and has_perm_branch('people.student.update', e.branch_id)
    )
  );

create policy student_notes_delete_author on student_notes for delete to authenticated
  using (author_user_id = current_user_id());

grant select, insert, delete on student_notes to authenticated;

-- ── find_user_by_verified_email ──────────────────────────────────────
create or replace function find_user_by_verified_email(p_email text)
returns table (id uuid, display_name text, avatar_path text)
language sql stable security definer set search_path = public as $$
  select u.id, u.display_name, u.avatar_path
  from auth_methods am
  join users u on u.id = am.user_id
  where am.provider = 'email_otp'
    and am.verified_identifier = lower(trim(p_email))
    and am.verified_at is not null
    and u.deleted_at is null
  limit 1;
$$;

grant execute on function find_user_by_verified_email(text) to authenticated;

-- ── users_select_org_join_requester ──────────────────────────────────
create policy users_select_org_join_requester on users for select to authenticated
  using (
    exists (
      select 1 from join_requests jr
      where (jr.requester_user_id = users.id or jr.subject_user_id = users.id)
        and jr.organization_id = current_org()
        and jr.status = 'pending'
        and has_perm_branch('people.join_request.read', jr.branch_id)
    )
  );
