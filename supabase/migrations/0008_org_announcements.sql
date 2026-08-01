-- Abhyas V2 — Org-scoped announcements (notice board for the active
-- workspace's own staff, distinct from the platform-wide `announcements`
-- table in 0002/0005, which is authored by platform staff via
-- has_platform_perm('platform.announce') and has no organization_id column).
-- Surfaced under Manage → Announcements for any org role holding
-- notify.announcement.read; publishing gated on notify.announcement.manage.

-- ── permission catalogue additions ────────────────────────────────
insert into permissions (key) values
  ('notify.announcement.read'), ('notify.announcement.manage')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_key)
select r.id, x.permission_key
from (values
  ('owner','notify.announcement.read'), ('owner','notify.announcement.manage'),
  ('org_admin','notify.announcement.read'), ('org_admin','notify.announcement.manage'),
  ('branch_admin','notify.announcement.read'), ('branch_admin','notify.announcement.manage'),
  ('coach','notify.announcement.read'),
  ('assistant_coach','notify.announcement.read'),
  ('front_desk','notify.announcement.read'),
  ('accountant','notify.announcement.read')
) as x(role_key, permission_key)
join roles r on r.key = x.role_key and r.organization_id is null
on conflict do nothing;

-- ── table ──────────────────────────────────────────────────────────
create table org_announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  title text not null,
  body text not null,
  published_at timestamptz not null default now(),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index org_announcements_org_published_idx on org_announcements (organization_id, published_at desc);

-- ── RLS ────────────────────────────────────────────────────────────
alter table org_announcements enable row level security;

create policy org_announcements_select_staff on org_announcements
  for select to authenticated
  using (organization_id = current_org() and has_perm('notify.announcement.read'));

create policy org_announcements_insert_staff on org_announcements
  for insert to authenticated
  with check (organization_id = current_org() and has_perm('notify.announcement.manage'));

create policy org_announcements_update_staff on org_announcements
  for update to authenticated
  using (organization_id = current_org() and has_perm('notify.announcement.manage'))
  with check (organization_id = current_org() and has_perm('notify.announcement.manage'));

create policy org_announcements_delete_staff on org_announcements
  for delete to authenticated
  using (organization_id = current_org() and has_perm('notify.announcement.manage'));

grant select, insert, update, delete on org_announcements to authenticated;
