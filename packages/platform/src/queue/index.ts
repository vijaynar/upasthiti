import { getServiceClient } from '../db';

// platform/queue — Postgres-backed job queue (Doc 14 §7-§8). One `jobs`
// table (migration 0002); claimed with FOR UPDATE SKIP LOCKED so multiple
// workers can run concurrently without double-processing.

export interface EnqueueOptions {
  runAt?: Date;
  idempotencyKey?: string;
}

export interface Job {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export async function enqueue(
  kind: string,
  payload: Record<string, unknown>,
  opts: EnqueueOptions = {}
): Promise<string> {
  const client = await getServiceClient();
  try {
    const result = await client.query<{ id: string }>(
      `insert into jobs (kind, payload, run_at, idempotency_key)
       values ($1, $2, coalesce($3, now()), $4)
       on conflict (idempotency_key) do nothing
       returning id`,
      [kind, payload, opts.runAt ?? null, opts.idempotencyKey ?? null]
    );
    return result.rows[0]?.id ?? '';
  } finally {
    client.release();
  }
}

/** Claims up to `batchSize` due jobs for `workerName`. Skips locked rows. */
export async function claim(workerName: string, batchSize: number): Promise<Job[]> {
  const client = await getServiceClient();
  try {
    await client.query('BEGIN');
    const result = await client.query<Job>(
      `update jobs set locked_by = $1, locked_at = now()
       where id in (
         select id from jobs
         where run_at <= now() and locked_at is null
           and completed_at is null and failed_at is null
         order by run_at
         limit $2
         for update skip locked
       )
       returning id, kind, payload, attempts, max_attempts as "maxAttempts"`,
      [workerName, batchSize]
    );
    await client.query('COMMIT');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function complete(jobId: string): Promise<void> {
  const client = await getServiceClient();
  try {
    await client.query('update jobs set completed_at = now() where id = $1', [jobId]);
  } finally {
    client.release();
  }
}

/** Re-queues with exponential backoff, or dead-letters past max_attempts (Doc 14 §8). */
export async function fail(jobId: string, error: string): Promise<void> {
  const client = await getServiceClient();
  try {
    await client.query(
      `update jobs set
         attempts = attempts + 1,
         last_error = $2,
         locked_by = null,
         locked_at = null,
         run_at = case when attempts + 1 >= max_attempts then run_at
                       else now() + (power(2, attempts + 1) * interval '1 minute') end,
         failed_at = case when attempts + 1 >= max_attempts then now() else null end
       where id = $1`,
      [jobId, error]
    );
  } finally {
    client.release();
  }
}
