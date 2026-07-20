import { queue } from '@abhyas/platform';
import { materializeSessions } from '@abhyas/module-scheduling';
import { evaluateAbsences, purgeWithdrawnFaceEmbeddings } from '@abhyas/module-attendance';
import { assessFine, ABSENCE_CONFIRMED_JOB_KIND, type AssessFineInput } from '@abhyas/module-finance';

// Job-kind -> handler registry (Doc 14 §8 job inventory). Each module
// registers its own handlers as it lands its jobs (class-session
// materialization here in Phase 7, absence evaluation + face-embedding
// purge in Phase 8, finance's assessFine() consuming
// attendance.absence_confirmed in Phase 9, notification dispatch consuming
// the same event in Phase 10, retention purges throughout).

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
// Notifications (Phase 10) to hit the PRD's <5min alert-latency target once
// it registers a consumer for attendance.absence_confirmed.
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

// One-shot event consumer (not self-rescheduling — each absence produces
// exactly one attendance.absence_confirmed job, unlike the cron-shaped
// handlers above). assessFine() is itself idempotent on the event id (see
// migration 0011's header), so a redelivered job after a transient failure
// is safe to just re-run rather than needing dedupe here.
async function runAssessFine(job: queue.Job): Promise<void> {
  await assessFine(job.payload as AssessFineInput);
}

export const JOB_HANDLERS: Record<string, JobHandler> = {
  'scheduling.materialize_sessions': runMaterializeSessions,
  'attendance.evaluate_absences': runEvaluateAbsences,
  'attendance.purge_withdrawn_face_embeddings': runPurgeWithdrawnFaceEmbeddings,
  [ABSENCE_CONFIRMED_JOB_KIND]: runAssessFine,
};
