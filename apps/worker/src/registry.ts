import { queue } from '@abhyas/platform';
import { materializeSessions } from '@abhyas/module-scheduling';

// Job-kind -> handler registry (Doc 14 §8 job inventory). Each module
// registers its own handlers as it lands its jobs (class-session
// materialization here in Phase 7, absence alerts in Phase 8/10, charge
// generation and reconciliation in Phase 9, retention purges throughout).

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

export const JOB_HANDLERS: Record<string, JobHandler> = {
  'scheduling.materialize_sessions': runMaterializeSessions,
};
