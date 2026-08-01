// notifications module — public API (Doc 14 §2). Surfaces and other modules
// call only the functions exported here, never this module's tables
// directly.
//
// Scope: notification_templates, notification_preferences,
// notification_deliveries, push_subscriptions (migration 0012). See that
// migration's header for the scope decisions this file assumes: no
// branch-column refinement on templates/deliveries (org-wide has_perm()
// only, app-layer/UI narrows further, same precedent Phase 7 set for
// Coach's "own batches"); push over VAPID instead of FCM/APNs (no vendor
// account exists); en-only seeded template library.
//
// This is the natural first consumer of `attendance.absence_confirmed`
// (Doc 14 §8's <5min parent-alert latency target) — Finance's assessFine()
// consumes the SAME event (Phase 9); apps/worker/src/registry.ts fans a
// single job kind out to both handlers (see that file's header for why
// JOB_HANDLERS changed shape to support this).
//
// Cross-module reads: this file queries `enrollments`/`guardianships`/
// `auth_methods` directly (owned by People/identity-auth) to resolve
// notification recipients — same "read across module boundaries via direct
// SQL" precedent Attendance/Finance already set reading Scheduling's
// `batches`/`class_sessions`; Doc 14 §2 rule 2 only restricts cross-module
// WRITES to the owning module's service.

import { db, notify, queue } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';

export type NotificationChannel = notify.NotificationChannel;
export type SupportedLanguage = notify.SupportedLanguage;

export class NotAuthorizedError extends Error {
  constructor(action = 'perform this action') {
    super(`[notifications] You do not have permission to ${action}.`);
  }
}

// ── Templates ────────────────────────────────────────────────────────────

export interface NotificationTemplate {
  id: string;
  organizationId: string | null;
  key: string;
  channel: NotificationChannel;
  language: SupportedLanguage;
  body: string;
  variables: string[];
  approvedAt: string | null;
}

function mapTemplateRow(row: {
  id: string;
  organization_id: string | null;
  key: string;
  channel: NotificationChannel;
  language: SupportedLanguage;
  body: string;
  variables: string[];
  approved_at: string | null;
}): NotificationTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    key: row.key,
    channel: row.channel,
    language: row.language,
    body: row.body,
    variables: row.variables,
    approvedAt: row.approved_at,
  };
}

const TEMPLATE_COLUMNS = `id, organization_id, key, channel, language, body, variables, approved_at`;

export async function listTemplates(
  session: SessionContext,
  input: { organizationId: string; includePlatformLibrary?: boolean }
): Promise<NotificationTemplate[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapTemplateRow>[0]>(
      input.includePlatformLibrary === false
        ? `select ${TEMPLATE_COLUMNS} from notification_templates where organization_id = $1 order by key, channel, language`
        : `select ${TEMPLATE_COLUMNS} from notification_templates where organization_id = $1 or organization_id is null order by key, channel, language`,
      [input.organizationId]
    );
    return result.rows.map(mapTemplateRow);
  });
}

export interface UpsertTemplateInput {
  organizationId: string;
  key: string;
  channel: NotificationChannel;
  language: SupportedLanguage;
  body: string;
  variables?: string[];
}

const UPSERT_TEMPLATE_SQL = `insert into notification_templates (organization_id, key, channel, language, body, variables)
   values ($1, $2, $3, $4, $5, $6)
   on conflict (organization_id, key, channel, language) where organization_id is not null
   do update set body = excluded.body, variables = excluded.variables, updated_at = now()
   returning ${TEMPLATE_COLUMNS}`;

export async function upsertTemplate(session: SessionContext, input: UpsertTemplateInput): Promise<NotificationTemplate> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapTemplateRow>[0]>(UPSERT_TEMPLATE_SQL, [
      input.organizationId,
      input.key,
      input.channel,
      input.language,
      input.body,
      JSON.stringify(input.variables ?? []),
    ]);
    return mapTemplateRow(result.rows[0]);
  });
}

// ── Preferences (self-service, no permission gate — Doc 04 §4) ───────────

export interface NotificationPreference {
  channel: NotificationChannel;
  kind: string;
  enabled: boolean;
}

export async function getMyPreferences(session: SessionContext): Promise<NotificationPreference[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ channel: NotificationChannel; kind: string; enabled: boolean }>(
      `select channel, kind, enabled from notification_preferences where user_id = $1 order by kind, channel`,
      [session.userId]
    );
    return result.rows;
  });
}

export async function setMyPreference(
  session: SessionContext,
  input: { channel: NotificationChannel; kind: string; enabled: boolean }
): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    await client.query(
      `insert into notification_preferences (user_id, channel, kind, enabled)
       values ($1, $2, $3, $4)
       on conflict (user_id, channel, kind) do update set enabled = excluded.enabled`,
      [session.userId, input.channel, input.kind, input.enabled]
    );
  });
}

// ── Push subscriptions (self-service) ─────────────────────────────────────

// migration 0012 deliberately grants no UPDATE on this table (a
// subscription is delete+insert, never edited — see that migration's
// header) — re-subscribing the same endpoint (keys rotated, or simply
// re-enabling) deletes the old row first rather than upserting.
export async function subscribeToPush(
  session: SessionContext,
  input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }
): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    await client.query(`delete from push_subscriptions where endpoint = $1`, [input.endpoint]);
    await client.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5)`,
      [session.userId, input.endpoint, input.p256dh, input.auth, input.userAgent ?? null]
    );
  });
}

export async function unsubscribeFromPush(session: SessionContext, endpoint: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    await client.query(`delete from push_subscriptions where user_id = $1 and endpoint = $2`, [session.userId, endpoint]);
  });
}

// ── Manual send (staff, notify.send.manual) ───────────────────────────────
// Doc 08 §21 `POST /org/notifications/send`. Inserts one `queued` delivery
// row per recipient (RLS-gated — this genuinely is the staff caller's own
// write, unlike the automatic path below) then enqueues a dispatch job per
// row; the worker (service-role) performs the actual send and flips status.

export interface SendManualNotificationInput {
  organizationId: string;
  recipientUserIds: string[];
  templateKey: string;
  channel: NotificationChannel;
  language: SupportedLanguage;
  variables?: Record<string, unknown>;
  refType?: string;
  refId?: string;
}

export const DISPATCH_DELIVERY_JOB_KIND = 'notifications.dispatch_delivery';

export async function sendManualNotification(
  session: SessionContext,
  input: SendManualNotificationInput
): Promise<{ deliveryIds: string[] }> {
  // Muting-floor check (US-4 AC3) must read via service-role: notification_
  // preferences' RLS is strictly self-only (migration 0012), so a staff
  // caller's own withRequestContext session can never see a recipient's
  // preference row to begin with — the SELECT would just silently return
  // zero rows and the floor would never engage. This is a legitimate read
  // (deciding whether to honor someone's own opt-out), same category as
  // notifyAbsenceConfirmed's identical service-role preference check below.
  const allowedRecipientIds: string[] = [];
  const prefClient = await db.getServiceClient();
  try {
    for (const recipientUserId of input.recipientUserIds) {
      const prefResult = await prefClient.query<{ enabled: boolean }>(
        `select enabled from notification_preferences where user_id = $1 and channel = $2 and kind = $3`,
        [recipientUserId, input.channel, input.templateKey]
      );
      if (prefResult.rows[0]?.enabled !== false) allowedRecipientIds.push(recipientUserId);
    }
  } finally {
    prefClient.release();
  }

  const deliveryIds = await db.withRequestContext(session, async (client) => {
    const ids: string[] = [];
    for (const recipientUserId of allowedRecipientIds) {
      const result = await client.query<{ id: string }>(
        `insert into notification_deliveries (organization_id, recipient_user_id, template_key, channel, language, ref_type, ref_id, status)
         values ($1, $2, $3, $4, $5, $6, $7, 'queued')
         returning id`,
        [input.organizationId, recipientUserId, input.templateKey, input.channel, input.language, input.refType ?? null, input.refId ?? null]
      );
      ids.push(result.rows[0].id);
    }
    return ids;
  });

  for (const deliveryId of deliveryIds) {
    await queue.enqueue(DISPATCH_DELIVERY_JOB_KIND, { deliveryId, variables: input.variables ?? {} });
  }
  return { deliveryIds };
}

// ── Delivery log (staff, notify.log.read) ─────────────────────────────────

export interface NotificationDelivery {
  id: string;
  recipientUserId: string;
  templateKey: string;
  channel: NotificationChannel;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'fallback';
  providerRef: string | null;
  error: string | null;
  createdAt: string;
}

export async function listDeliveries(
  session: SessionContext,
  input: { organizationId: string; recipientUserId?: string; status?: string }
): Promise<NotificationDelivery[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      recipient_user_id: string;
      template_key: string;
      channel: NotificationChannel;
      status: NotificationDelivery['status'];
      provider_ref: string | null;
      error: string | null;
      created_at: string;
    }>(
      `select id, recipient_user_id, template_key, channel, status, provider_ref, error, created_at
       from notification_deliveries
       where organization_id = $1
         and ($2::uuid is null or recipient_user_id = $2)
         and ($3::text is null or status = $3)
       order by created_at desc
       limit 200`,
      [input.organizationId, input.recipientUserId ?? null, input.status ?? null]
    );
    return result.rows.map((row) => ({
      id: row.id,
      recipientUserId: row.recipient_user_id,
      templateKey: row.template_key,
      channel: row.channel,
      status: row.status,
      providerRef: row.provider_ref,
      error: row.error,
      createdAt: row.created_at,
    }));
  });
}

// ── Org announcements (staff, notify.announcement.read / .manage,
// migration 0008) ───────────────────────────────────────────────────────
// A per-workspace notice board — distinct from the platform-wide
// `announcements` table (@abhyas/module-platform-admin), which is authored
// by platform staff and has no organization_id. RLS is the real gate here
// (org_announcements_select_staff / _insert_staff), same as
// listDeliveries/sendManualNotification above — no app-layer permission
// check duplicated in this file.

export interface OrgAnnouncement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  createdAt: string;
}

function mapAnnouncementRow(row: { id: string; title: string; body: string; published_at: string; created_at: string }): OrgAnnouncement {
  return { id: row.id, title: row.title, body: row.body, publishedAt: row.published_at, createdAt: row.created_at };
}

export async function listOrgAnnouncements(session: SessionContext, input: { organizationId: string }): Promise<OrgAnnouncement[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapAnnouncementRow>[0]>(
      `select id, title, body, published_at, created_at from org_announcements where organization_id = $1 order by published_at desc`,
      [input.organizationId]
    );
    return result.rows.map(mapAnnouncementRow);
  });
}

export interface CreateOrgAnnouncementInput {
  organizationId: string;
  title: string;
  body: string;
}

export async function createOrgAnnouncement(session: SessionContext, input: CreateOrgAnnouncementInput): Promise<OrgAnnouncement> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapAnnouncementRow>[0]>(
      `insert into org_announcements (organization_id, title, body, created_by)
       values ($1, $2, $3, $4)
       returning id, title, body, published_at, created_at`,
      [input.organizationId, input.title, input.body, session.userId]
    );
    return mapAnnouncementRow(result.rows[0]);
  });
}

// ── Dispatch (service-role — apps/worker) ─────────────────────────────────
// Renders a template's {{placeholders}} against `variables` — intentionally
// simple (no conditionals/loops); notification bodies are short single-line
// strings (Doc 07 §10), not documents.

function renderTemplate(body: string, variables: Record<string, unknown>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    const value = variables[name];
    return value === undefined || value === null ? match : String(value);
  });
}

const RESOLVE_TEMPLATE_SQL = `
  select body from notification_templates
  where key = $1 and channel = $2 and language = $3
    and (organization_id = $4 or organization_id is null)
  order by organization_id nulls last
  limit 1
`;

/** Loads a `queued` delivery, sends it over its channel, and records the outcome. Called by apps/worker for both the manual-send path and notifyAbsenceConfirmed below. */
export async function dispatchDelivery(deliveryId: string, variables: Record<string, unknown>): Promise<void> {
  const client = await db.getServiceClient();
  try {
    const deliveryResult = await client.query<{
      id: string;
      recipient_user_id: string;
      organization_id: string;
      template_key: string;
      channel: NotificationChannel;
      language: SupportedLanguage;
      status: string;
    }>(`select id, recipient_user_id, organization_id, template_key, channel, language, status from notification_deliveries where id = $1`, [deliveryId]);
    const delivery = deliveryResult.rows[0];
    if (!delivery || delivery.status !== 'queued') return; // already processed or missing — idempotent no-op

    const templateResult = await client.query<{ body: string }>(RESOLVE_TEMPLATE_SQL, [
      delivery.template_key,
      delivery.channel,
      delivery.language,
      delivery.organization_id,
    ]);
    const templateBody = templateResult.rows[0]?.body;
    if (!templateBody) {
      await client.query(`update notification_deliveries set status = 'failed', error = $2, updated_at = now() where id = $1`, [
        deliveryId,
        `No ${delivery.channel}/${delivery.language} template found for "${delivery.template_key}".`,
      ]);
      return;
    }
    const body = renderTemplate(templateBody, variables);

    let result: Awaited<ReturnType<typeof notify.send>>;
    if (delivery.channel === 'email') {
      const emailResult = await client.query<{ verified_identifier: string | null }>(
        `select verified_identifier from auth_methods where user_id = $1 and verified_identifier is not null and provider in ('email_otp', 'google') order by verified_at desc nulls last limit 1`,
        [delivery.recipient_user_id]
      );
      const to = emailResult.rows[0]?.verified_identifier;
      result = to
        ? await notify.send({ channel: 'email', to, subject: 'Abhyas notification', body })
        : { status: 'failed', error: 'No verified email on file for recipient.' };
    } else if (delivery.channel === 'push') {
      const subResult = await client.query<{ endpoint: string; p256dh: string; auth: string }>(
        `select endpoint, p256dh, auth from push_subscriptions where user_id = $1 limit 1`,
        [delivery.recipient_user_id]
      );
      const sub = subResult.rows[0];
      result = sub
        ? await notify.send({ channel: 'push', subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, title: 'Abhyas', body })
        : { status: 'failed', error: 'No push subscription on file for recipient.' };
    } else if (delivery.channel === 'whatsapp') {
      result = await notify.send({ channel: 'whatsapp', to: '', templateKey: delivery.template_key, language: delivery.language, variables });
    } else {
      result = await notify.send({ channel: 'sms', to: '', body });
    }

    await client.query(`update notification_deliveries set status = $2, provider_ref = $3, error = $4, updated_at = now() where id = $1`, [
      deliveryId,
      result.status === 'sent' ? 'sent' : 'failed',
      result.providerRef ?? null,
      result.error ?? null,
    ]);
  } finally {
    client.release();
  }
}

// ── notifyAbsenceConfirmed(): consumer of attendance.absence_confirmed ────
// (Doc 14 §8's <5min parent-alert latency target — the natural first
// consumer named in the Phase 10 roadmap entry). Resolves the absent
// student's own account plus any active guardians, and notifies each over
// every channel they haven't muted, for every channel a template exists for
// (email + push — the real v1 channels). Runs inline (no further job
// enqueue) since it's already executing inside apps/worker — see that
// file's header for why this and finance.assessFine() both fire off the
// same job kind.

export interface AbsenceConfirmedConsumerInput {
  organizationId: string;
  branchId: string;
  enrollmentId: string;
  classSessionId: string;
  attendanceEventId: string;
}

const REAL_CHANNELS: NotificationChannel[] = ['email', 'push'];
const TEMPLATE_KEY = 'attendance.absence_confirmed';

const ABSENCE_RECIPIENTS_SQL = `
  select u.id as user_id, u.display_name, u.locale
  from enrollments e
  join users student on student.id = e.student_user_id
  left join guardianships g on g.ward_user_id = e.student_user_id and g.status = 'active'
  join users u on u.id = coalesce(g.guardian_user_id, student.id)
  where e.id = $1
  group by u.id, u.display_name, u.locale
`;

const SESSION_CONTEXT_SQL = `
  select cs.session_date, b.name as batch_name, e.student_user_id, student.display_name as student_name
  from class_sessions cs
  join batches b on b.id = cs.batch_id
  join enrollments e on e.id = $2
  join users student on student.id = e.student_user_id
  where cs.id = $1
  limit 1
`;

export async function notifyAbsenceConfirmed(input: AbsenceConfirmedConsumerInput): Promise<{ dispatched: number; skipped: number }> {
  const client = await db.getServiceClient();
  try {
    const contextResult = await client.query<{ session_date: string; batch_name: string; student_user_id: string; student_name: string }>(
      SESSION_CONTEXT_SQL,
      [input.classSessionId, input.enrollmentId]
    );
    const context = contextResult.rows[0];
    if (!context) return { dispatched: 0, skipped: 0 };

    const recipientsResult = await client.query<{ user_id: string; display_name: string; locale: SupportedLanguage }>(
      ABSENCE_RECIPIENTS_SQL,
      [input.enrollmentId]
    );

    let dispatched = 0;
    let skipped = 0;
    for (const recipient of recipientsResult.rows) {
      for (const channel of REAL_CHANNELS) {
        // Idempotency: a redelivered attendance.absence_confirmed job (see
        // migration 0011's precedent on the same event) must not re-notify.
        const existing = await client.query(
          `select 1 from notification_deliveries where ref_type = 'attendance_event' and ref_id = $1 and recipient_user_id = $2 and channel = $3 limit 1`,
          [input.attendanceEventId, recipient.user_id, channel]
        );
        if (existing.rows[0]) {
          skipped += 1;
          continue;
        }

        const prefResult = await client.query<{ enabled: boolean }>(
          `select enabled from notification_preferences where user_id = $1 and channel = $2 and kind = $3`,
          [recipient.user_id, channel, TEMPLATE_KEY]
        );
        if (prefResult.rows[0]?.enabled === false) {
          skipped += 1;
          continue;
        }

        const language = recipient.locale ?? 'en';
        const inserted = await client.query<{ id: string }>(
          `insert into notification_deliveries (organization_id, recipient_user_id, template_key, channel, language, ref_type, ref_id, status)
           values ($1, $2, $3, $4, $5, 'attendance_event', $6, 'queued')
           returning id`,
          [input.organizationId, recipient.user_id, TEMPLATE_KEY, channel, language, input.attendanceEventId]
        );

        await dispatchDelivery(inserted.rows[0].id, {
          recipientName: recipient.display_name,
          studentName: context.student_name,
          batchName: context.batch_name,
          sessionDate: context.session_date,
        });
        dispatched += 1;
      }
    }
    return { dispatched, skipped };
  } finally {
    client.release();
  }
}

export const ABSENCE_CONFIRMED_JOB_KIND = 'attendance.absence_confirmed';
