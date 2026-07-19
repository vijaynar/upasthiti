import type { queue } from '@abhyas/platform';

// Job-kind -> handler registry (Doc 14 §8 job inventory). Each module
// registers its own handlers as it lands its jobs (class-session
// materialization in Phase 7, absence alerts in Phase 8/10, charge
// generation and reconciliation in Phase 9, retention purges throughout).
// Empty until the first job-producing module (Phase 7) is built.

export type JobHandler = (job: queue.Job) => Promise<void>;

export const JOB_HANDLERS: Record<string, JobHandler> = {};
