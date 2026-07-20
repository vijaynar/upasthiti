import { queue } from '@abhyas/platform';
import { materializeSessions } from '@abhyas/module-scheduling';
import { evaluateAbsences, purgeWithdrawnFaceEmbeddings } from '@abhyas/module-attendance';
import { assessFine, ABSENCE_CONFIRMED_JOB_KIND, type AssessFineInput } from '@abhyas/module-finance';
import { dispatchDelivery, notifyAbsenceConfirmed, DISPATCH_DELIVERY_JOB_KIND } from '@abhyas/module-notifications';
import { activateOrgListings, ORG_VERIFIED_JOB_KIND } from '@abhyas/module-marketplace';

// Job-kind -> handler registry (Doc 14 §8 job inventory). Each module
// registers its own handlers as it lands its jobs (class-session
// materialization here in Phase 7, absence evaluation + face-embedding
// purge in Phase 8, finance's assessFine() consuming
// attendance.absence_confirmed in Phase 9, notification dispatch consuming
// the same event in Phase 10, retention purges throughout).
//
// A job kind maps to an ARRAY of handlers, not one (changed in Phase 10) —
// `attendance.absence_confirmed` now has TWO independent consumers
// (finance.assessFine, notifications.notifyAbsenceConfirmed) and a
// Record<string, JobHandler> can only ever hold one function per key. The
// poller (index.ts) runs every handler for a claimed job and only marks it
// complete if all of them succeed; a retry re-runs all handlers for that
// job, so every handler registered here must be safe to re-run (both of
// this event's consumers already are: assessFine dedupes on a description
// string, notifyAbsenceConfirmed dedupes via a notification_deliveries
// ref_type/ref_id/recipient/channel lookup).

export type JobHandler = (job: queue.Job) => Promise<void>;

// Self-rescheduling (Doc 14 §8's "class-session materialization, 30d
// rolling" job): the queue has no native recurrence, so the handler
// re-enqueues its own next run on completion — the same pattern any
// cron-shaped job on this queue uses. idempotencyKey is dated so a
// re-triggered `--once` run within the same day can't double-schedule.
async function runMaterializeSessions(): Promise<void> {
  await materializeSessions();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await queue.enqueue(
    'scheduling.materialize_sessions',
    {},
    { runAt: tomorrow, idempotencyKey: `scheduling.materialize_sessions:${tomorrow.toISOString().slice(0, 10)}` }
  );
}

// Doc 14 §8: "time-critical absence alerts get a dedicated per-5-min cron" —
// self-reschedules at that cadence so the underlying signal
// (evaluateAbsences' absent attendance_events rows) stays fresh enough for
// Notifications to hit the PRD's <5min alert-latency target.
async function runEvaluateAbsences(): Promise<void> {
  await evaluateAbsences();
  const next = new Date(Date.now() + 5 * 60 * 1000);
  await queue.enqueue('attendance.evaluate_absences', {}, { runAt: next, idempotencyKey: `attendance.evaluate_absences:${next.toISOString().slice(0, 16)}` });
}

// Doc 14 §8's "consent-withdrawal deletion (24h SLA)" — every 6h comfortably
// stays inside that SLA even accounting for a missed/delayed run.
async function runPurgeWithdrawnFaceEmbeddings(): Promise<void> {
  await purgeWithdrawnFaceEmbeddings();
  const next = new Date(Date.now() + 6 * 60 * 60 * 1000);
  await queue.enqueue('attendance.purge_withdrawn_face_embeddings', {}, {
    runAt: next,
    idempotencyKey: `attendance.purge_withdrawn_face_embeddings:${next.toISOString().slice(0, 13)}`,
  });
}

// One-shot event consumers (not self-rescheduling — each absence produces
// exactly one attendance.absence_confirmed job). Both are idempotent on
// redelivery (see this file's header), so a transient failure in one
// doesn't risk double-charging or double-notifying on retry.
async function runAssessFine(job: queue.Job): Promise<void> {
  await assessFine(job.payload as AssessFineInput);
}

async function runNotifyAbsenceConfirmed(job: queue.Job): Promise<void> {
  await notifyAbsenceConfirmed(job.payload as Parameters<typeof notifyAbsenceConfirmed>[0]);
}

// Manual-send dispatch (Doc 08 §21 `POST /org/notifications/send`) and the
// automatic absence-confirmed path both funnel through dispatchDelivery();
// this handler is only reached for the manual path — notifyAbsenceConfirmed
// calls dispatchDelivery() directly since it's already running in-worker.
async function runDispatchDelivery(job: queue.Job): Promise<void> {
  const { deliveryId, variables } = job.payload as { deliveryId: string; variables: Record<string, unknown> };
  await dispatchDelivery(deliveryId, variables);
}

// One-shot consumer of platform.org_verified (Phase 11 — enqueued by
// platform-admin.decideOrganizationVerification() on approval, Doc 02 §9 /
// PRD US-1 AC5: a listing published before its org finished verification
// stays pending_verification until this promotes it). Idempotent —
// activateOrgListings() only touches rows still in that status, so a
// redelivered event is a safe no-op.
async function runActivateOrgListings(job: queue.Job): Promise<void> {
  const { organizationId } = job.payload as { organizationId: string };
  await activateOrgListings(organizationId);
}

export const JOB_HANDLERS: Record<string, JobHandler[]> = {
  'scheduling.materialize_sessions': [runMaterializeSessions],
  'attendance.evaluate_absences': [runEvaluateAbsences],
  'attendance.purge_withdrawn_face_embeddings': [runPurgeWithdrawnFaceEmbeddings],
  [ABSENCE_CONFIRMED_JOB_KIND]: [runAssessFine, runNotifyAbsenceConfirmed],
  [DISPATCH_DELIVERY_JOB_KIND]: [runDispatchDelivery],
  [ORG_VERIFIED_JOB_KIND]: [runActivateOrgListings],
};
