-- Coach self-service Announcements (Doc 04 §6 precedent — "own batches" as
-- an app-layer filter, not a stricter RLS gate; same pattern
-- scheduling.listMyBatches()/my_batch_ids() already established).
--
-- 0008 gave org_announcements a bare title/body/published_at shape with
-- coach holding only notify.announcement.read. This migration:
--   1. grants coach notify.announcement.manage, so they can author
--      announcements the same as owner/org_admin/branch_admin (RLS on
--      org_announcements is still the real gate — no branch/batch dimension
--      exists on that policy, matching 0008's own precedent);
--   2. adds status/tag/scheduled_at/audience_type so an announcement can be
--      saved as a draft, scheduled for later (published_at stays null until
--      the worker's announcements.publish job flips it), or archived;
--   3. adds org_announcement_batches so an audience can target specific
--      batches instead of the whole org ("All Students").

insert into role_permissions (role_id, permission_key)
select r.id, 'notify.announcement.manage'
from roles r
where r.key = 'coach' and r.organization_id is null
on conflict do nothing;

-- ── org_announcements: status/schedule/tag/audience ───────────────
alter table org_announcements
  alter column published_at drop not null,
  alter column published_at drop default,
  add column status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  add column tag text not null default 'general' check (tag in ('general', 'event', 'urgent', 'holiday', 'academic')),
  add column audience_type text not null default 'all' check (audience_type in ('all', 'batches')),
  add column scheduled_at timestamptz;

-- Backfill: every pre-existing row was published immediately (0008's
-- default), so status='published' (the column default) already matches.

create index org_announcements_org_status_idx on org_announcements (organization_id, status);

-- ── audience targeting (only populated when audience_type = 'batches') ────
create table org_announcement_batches (
  announcement_id uuid not null references org_announcements(id) on delete cascade,
  batch_id uuid not null references batches(id) on delete cascade,
  primary key (announcement_id, batch_id)
);

alter table org_announcement_batches enable row level security;

-- Scoped through the parent announcement's own org_id + permission check —
-- same "join back to the owning row" shape as any child-table RLS policy
-- elsewhere in this schema (e.g. batch_enrollments -> batches).
create policy org_announcement_batches_select_staff on org_announcement_batches
  for select to authenticated
  using (exists (
    select 1 from org_announcements a
    where a.id = announcement_id and a.organization_id = current_org() and has_perm('notify.announcement.read')
  ));

create policy org_announcement_batches_insert_staff on org_announcement_batches
  for insert to authenticated
  with check (exists (
    select 1 from org_announcements a
    where a.id = announcement_id and a.organization_id = current_org() and has_perm('notify.announcement.manage')
  ));

create policy org_announcement_batches_delete_staff on org_announcement_batches
  for delete to authenticated
  using (exists (
    select 1 from org_announcements a
    where a.id = announcement_id and a.organization_id = current_org() and has_perm('notify.announcement.manage')
  ));

grant select, insert, delete on org_announcement_batches to authenticated;
