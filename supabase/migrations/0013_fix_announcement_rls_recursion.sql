-- Fixes "infinite recursion detected in policy for relation org_announcements",
-- hit for the first time while building the org-agnostic student dashboard
-- (a real student, for the first time, actually queried org_announcements
-- end-to-end through the app instead of via validate.mjs's staff-only checks).
--
-- The cycle: org_announcements_select_student (migration 0011) has a branch
-- that checks org_announcement_batches for a targeted (non-'all') audience.
-- Resolving THAT table's own RLS runs org_announcement_batches_select_staff
-- (migration 0009), which queries back into org_announcements to resolve
-- current_org() — Postgres's RLS planner detects this as a structural cycle
-- (org_announcements -> org_announcement_batches -> org_announcements)
-- regardless of actual row data, so every query against org_announcements
-- recurses, not just targeted-audience ones.
--
-- Fix: the staff policy's back-reference only ever needed the announcement's
-- organization_id, not a full RLS-checked read of the row — same
-- "security definer helper breaks the cycle" shape as is_batch_participant()
-- (migration 0004). This function is owned by the migration role (bypasses
-- RLS on its own internal read, same as any other security definer helper
-- here), so resolving it no longer re-enters org_announcements' policies.
create or replace function get_announcement_org(p_announcement_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from org_announcements where id = p_announcement_id
$$;

drop policy org_announcement_batches_select_staff on org_announcement_batches;
create policy org_announcement_batches_select_staff on org_announcement_batches
  for select to authenticated
  using (
    get_announcement_org(announcement_id) = current_org() and has_perm('notify.announcement.read')
  );
