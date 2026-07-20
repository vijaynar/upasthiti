import { queue } from '@abhyas/platform';
import { JOB_HANDLERS } from './registry';

// Queue poller entrypoint (Doc 14 §8). v1 execution: this same loop runs
// either behind a Vercel cron hit (batch-claims and exits) or as an
// always-on process (Railway/Fly fallback) — no code difference, only how
// the process is started.

const WORKER_NAME = process.env.WORKER_NAME ?? `worker-${process.pid}`;
const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 5_000;

async function runOnce(): Promise<number> {
  const jobs = await queue.claim(WORKER_NAME, BATCH_SIZE);
  for (const job of jobs) {
    const handlers = JOB_HANDLERS[job.kind];
    if (!handlers || handlers.length === 0) {
      await queue.fail(job.id, `No handler registered for job kind "${job.kind}"`);
      continue;
    }
    try {
      // Every handler for this kind must succeed for the job to complete
      // (Phase 10 — a kind can have more than one independent consumer,
      // see registry.ts's header). A retry re-runs all of them, so each
      // handler must be idempotent on redelivery.
      for (const handler of handlers) await handler(job);
      await queue.complete(job.id);
    } catch (err) {
      await queue.fail(job.id, err instanceof Error ? err.message : String(err));
    }
  }
  return jobs.length;
}

/** `--once`: drain due jobs then exit (cron-triggered run). Otherwise: poll forever (always-on fallback, Doc 14 §8). */
async function main(): Promise<void> {
  const drainAndExit = process.argv.includes('--once');
  for (;;) {
    const claimed = await runOnce();
    if (drainAndExit && claimed === 0) return;
    if (!drainAndExit) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error('[worker] fatal error', err);
  process.exit(1);
});
