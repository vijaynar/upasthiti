-- Student read access to their own enrolled org(s) (docsV2/STUDENT_PORTAL_SPEC.md
-- cross-org dashboard). Gap found while building the org-agnostic student
-- dashboard/batches/schedule aggregation: organizations_select_member
-- (migration 0005) only grants read to created_by or an active `memberships`
-- row — but a bulk-enrolled student (the common case; see people module's
-- enrollDirect) never gets a `memberships` row, only an `enrollments` row.
-- That student could already read their own batches/enrollments/charges
-- (all self-scoped on student_user_id, migration 0005/0011) but had NO way
-- to read the organizations row itself — so any query joining in the org's
-- name (to label "which academy is this batch from" on a cross-org student
-- view) silently returned zero rows for that join, not an error, exactly
-- the "silent-empty-join" pattern this schema's history keeps flagging.
-- Additive (ORs with organizations_select_member), same shape as
-- organizations_select_support_grant just below it.
create policy organizations_select_student on organizations for select to authenticated
  using (
    exists (
      select 1 from enrollments e
      where e.organization_id = organizations.id
        and e.student_user_id = current_user_id()
        and e.status = 'active'
    )
  );
