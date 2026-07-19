-- Abhyas V2 — Background job queue (platform/queue adapter, Doc 14 §7-§8)
-- Postgres-backed queue: claimed with `FOR UPDATE SKIP LOCKED`, exponential
-- backoff, dead-letter after 5 attempts. Every module's async work (absence
-- alerts, charge generation, notification dispatch, retention purges, ...)
-- is a row here — see docsV2/14_cloud_architecture.md §8 for the job inventory.
--
-- Touched only by apps/worker via the service-role client (Doc 02 §5 layer 4).
-- RLS is enabled with zero policies: default-deny for the anon/authenticated
-- API path, consistent with every other table (Doc 04 §1 principle 2).

create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}',
  idempotency_key text unique,
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  locked_by text,
  locked_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

-- Claim query shape (used by apps/worker):
--   UPDATE jobs SET locked_by = $1, locked_at = now()
--   WHERE id IN (
--     SELECT id FROM jobs
--     WHERE run_at <= now() AND locked_at IS NULL
--       AND completed_at IS NULL AND failed_at IS NULL
--     ORDER BY run_at LIMIT $2 FOR UPDATE SKIP LOCKED
--   ) RETURNING *;
create index jobs_claim_idx on jobs (run_at)
  where locked_at is null and completed_at is null and failed_at is null;

create index jobs_kind_idx on jobs (kind, run_at);

alter table jobs enable row level security;
