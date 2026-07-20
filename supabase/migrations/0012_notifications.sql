-- Abhyas V2 — Phase 10: Notifications (Doc 07 §10).
--
-- Scope: notification_templates/notification_preferences/notification_deliveries
-- (literal, Doc 07 §10) + push_subscriptions (new — see point 3 below). Real
-- v1 channels are email + push (2026-07-19 locked scope decision, already
-- noted in packages/platform/src/notify/index.ts since Phase 1); WhatsApp/SMS
-- stay `not_configured` stubs. RBAC needs no new permission keys — migration
-- 0006 already seeded `notify.template.manage`/`notify.send.manual`/
-- `notify.log.read`/`notify.fee_reminder.send` with role grants matching
-- Doc 04 §5's "Notifications (manual/templates)" row exactly.
--
-- Interpretive calls, all deliberate — re-read before touching this schema:
--
-- 1. **Neither `notification_templates` nor `notification_deliveries` has a
--    `branch_id` column** (Doc 07 §10's literal schema doesn't give them
--    one), so the matrix's "🔷 branch" cell for Branch Admin can't be
--    RLS-refined the way `has_perm_branch()` refines e.g. `memberships` —
--    same precedent Phase 7 documented for Coach's "own batches" People
--    read: "branch-scoped permission is sufficient at the RLS layer even
--    though the matrix says 🔷 branch/own batches; the narrowing is an
--    app-layer/UI scope, not enforced here." `has_perm()` (org-wide, not
--    `has_perm_branch()`) gates every policy below for that reason.
--
-- 2. **`updated_at` added to `notification_templates` and
--    `notification_deliveries`**, beyond Doc 07 §10's literal snippet —
--    convention #9 (Doc 07 §1), same justification `enrollments`/`batches`
--    already used: both rows are genuinely mutable (a template gets
--    edited; a delivery's `status` moves queued → sent/delivered/failed/
--    fallback as the dispatch job runs), so a bare `created_at` isn't
--    enough to know when a row last changed.
--
-- 3. **`push_subscriptions` is a new table, not in Doc 07 §10's literal
--    list.** The web-push (VAPID) channel this migration wires up needs
--    somewhere to persist each browser's subscription (endpoint + keys) —
--    without a vendor account, this is the only way to make "push" a real,
--    verifiable-in-this-environment channel rather than another
--    `not_configured` stub next to WhatsApp/SMS (see
--    packages/platform/src/notify/channels/push.ts's header for why VAPID
--    was chosen over FCM/APNs). Owned by this module (not identity-auth)
--    since it's push-channel machinery, not a general identity concern —
--    same "schema follows the module that needs it" precedent as
--    `org_domains`/`coach_assignments.batch_id` before their owning module
--    existed, just additive instead of deferred.
--
-- 4. **`notification_deliveries` gets an asymmetric grant**: `select,
--    insert` to `authenticated`, no `update`/`delete` — the manual-send
--    path (`notifications.send_manual`, RLS-gated on `notify.send.manual`)
--    inserts a `queued` row itself (this IS the staff member's own
--    privileged action, unlike `ledger_entries`/`audit_log`'s "no direct
--    grant at all" pattern reserved for system-of-record tables no single
--    actor should ever directly write), but only the dispatch job
--    (service-role, `apps/worker`) may flip `status` afterward — matches
--    `payment_allocations`' precedent (migration 0011: `select, insert`
--    only) of granting exactly the operations a real RLS-gated actor
--    performs, nothing more.
--
-- 5. **Two partial unique indexes, not one table constraint**, for
--    `notification_templates(organization_id, key, channel, language)` —
--    Postgres treats every `NULL` as distinct in a unique constraint, so a
--    plain constraint would let the platform library (`organization_id is
--    null`) accumulate duplicate rows for the same key/channel/language.
--    Split into an org-scoped partial unique index (`where organization_id
--    is not null`) and a platform-library partial unique index (`where
--    organization_id is null`).
--
-- 6. **Template library seeding is `en`-only.** Doc 07 §1's seed-script
--    line names an "en/hi/te" template library, but fabricating hi/te
--    translations for real user-facing copy isn't something to invent in a
--    migration — only `en` rows are seeded for
--    `attendance.absence_confirmed` (email + push); `hi`/`te` are a real,
--    deliberate gap (real translation content, not placeholder text, is
--    needed) same posture as every prior phase's "designed, UI/content
--    polish later" gaps.

create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id), -- null = platform library
  key text not null,
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'push')),
  language text not null check (language in ('en', 'hi', 'te')),
  body text not null,
  variables jsonb not null default '[]', -- array of variable names the body's {{placeholders}} expect
  approved_at timestamptz, -- WhatsApp template approval; unused for email/push
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index notification_templates_org_key_idx
  on notification_templates (organization_id, key, channel, language)
  where organization_id is not null;
create unique index notification_templates_platform_key_idx
  on notification_templates (key, channel, language)
  where organization_id is null;
create index notification_templates_org_id_idx on notification_templates (organization_id);

create trigger notification_templates_set_updated_at
  before update on notification_templates
  for each row execute function set_updated_at();

alter table notification_templates enable row level security;

-- Read: platform library (any authenticated user — templates carry no
-- secrets) or the caller's own org, gated on either permission that needs
-- to read a template (managing it, or picking one to send).
create policy notification_templates_select on notification_templates
  for select to authenticated
  using (
    organization_id is null
    or (organization_id = current_org() and (has_perm('notify.template.manage') or has_perm('notify.send.manual')))
  );

create policy notification_templates_insert_staff on notification_templates
  for insert to authenticated
  with check (organization_id = current_org() and has_perm('notify.template.manage'));

create policy notification_templates_update_staff on notification_templates
  for update to authenticated
  using (organization_id = current_org() and has_perm('notify.template.manage'))
  with check (organization_id = current_org() and has_perm('notify.template.manage'));

grant select, insert, update on notification_templates to authenticated;

-- ── notification_preferences ────────────────────────────────────────────
-- Self-service (Doc 04 §4: "own notification prefs" is an identity right,
-- not a permission) — every authenticated user manages only their own rows,
-- no `has_perm()` check anywhere on this table.

create table notification_preferences (
  user_id uuid not null references users(id),
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'push')),
  kind text not null, -- notification_templates.key this preference mutes/allows
  enabled boolean not null default true,
  primary key (user_id, channel, kind)
);

alter table notification_preferences enable row level security;

create policy notification_preferences_self on notification_preferences
  for all to authenticated
  using (user_id = current_user_id())
  with check (user_id = current_user_id());

grant select, insert, update, delete on notification_preferences to authenticated;

-- ── notification_deliveries ──────────────────────────────────────────────
-- Append-only, partition-ready (Doc 07 §10's own comment) — `updated_at`
-- tracks status transitions (point 2 above), but rows are never deleted and
-- their identity (id, created_at) never changes.

create table notification_deliveries (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  recipient_user_id uuid not null references users(id),
  template_key text not null,
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'push')),
  language text not null check (language in ('en', 'hi', 'te')),
  ref_type text,
  ref_id uuid,
  status text not null check (status in ('queued', 'sent', 'delivered', 'failed', 'fallback')),
  provider_ref text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, created_at)
);

create index notification_deliveries_org_idx on notification_deliveries (organization_id, created_at desc);
create index notification_deliveries_recipient_idx on notification_deliveries (recipient_user_id, created_at desc);
-- Dedup lookup for the automatic (event-driven) dispatch path — "has this
-- recipient already been notified for this source event on this channel"
-- (packages/modules/notifications/src/service.ts's notifyAbsenceConfirmed).
create index notification_deliveries_ref_idx on notification_deliveries (ref_type, ref_id, recipient_user_id, channel);

alter table notification_deliveries enable row level security;

create policy notification_deliveries_select_staff on notification_deliveries
  for select to authenticated
  using (organization_id = current_org() and has_perm('notify.log.read'));

create policy notification_deliveries_insert_staff on notification_deliveries
  for insert to authenticated
  with check (organization_id = current_org() and has_perm('notify.send.manual') and status = 'queued');

grant select, insert on notification_deliveries to authenticated;

-- ── push_subscriptions ────────────────────────────────────────────────────
-- New table (point 3 above). Self-only — a subscription is a browser/device
-- credential, never shared or staff-managed.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (endpoint)
);

create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_select_self on push_subscriptions
  for select to authenticated
  using (user_id = current_user_id());

create policy push_subscriptions_insert_self on push_subscriptions
  for insert to authenticated
  with check (user_id = current_user_id());

create policy push_subscriptions_delete_self on push_subscriptions
  for delete to authenticated
  using (user_id = current_user_id());

grant select, insert, delete on push_subscriptions to authenticated;

-- ── Platform template library seed (point 6 above) ───────────────────────
-- `attendance.absence_confirmed` is this phase's named first consumer (Doc
-- 14 §8's <5min parent-alert latency target). English only.

insert into notification_templates (organization_id, key, channel, language, body, variables) values
  (null, 'attendance.absence_confirmed', 'email', 'en',
   'Hi {{recipientName}}, {{studentName}} was marked absent from {{batchName}} on {{sessionDate}}. If this looks wrong, contact your academy.',
   '["recipientName", "studentName", "batchName", "sessionDate"]'),
  (null, 'attendance.absence_confirmed', 'push', 'en',
   '{{studentName}} was marked absent from {{batchName}} today.',
   '["studentName", "batchName"]');
