-- Abhyas V2 — Fix: jobs was never actually RLS-enabled.
--
-- 0002_core_schema.sql's comment on `jobs` claimed "RLS is enabled with zero
-- policies," but 0005_security.sql never issued the corresponding `alter
-- table ... enable row level security`. Result: on the live database, jobs
-- has been readable/writable by the anon key via PostgREST this whole time.
-- No policies are added here on purpose — apps/worker is the only consumer
-- and uses the service_role client, which bypasses RLS.
alter table jobs enable row level security;
