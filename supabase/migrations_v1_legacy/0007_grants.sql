-- ============================================================
-- MIGRATION: 0007_grants.sql
-- Abhyas — base table/schema privileges for anon/authenticated/service_role
-- ============================================================
-- On a hosted Supabase project, the `public` schema is provisioned once
-- with default privileges already granted to anon/authenticated/service_role
-- (Supabase sets these up when the project is created), so migrations that
-- only add RLS policies work fine there. Locally, `supabase db reset` does
-- a full `DROP SCHEMA public CASCADE` + recreate before replaying migrations,
-- which destroys that default-privilege inheritance — leaving every table
-- in this schema completely inaccessible via PostgREST (permission denied,
-- SQLSTATE 42501) regardless of the RLS policies in 0005, since Postgres
-- checks base table GRANTs before RLS is ever evaluated.
--
-- This migration re-establishes those grants explicitly so a fresh local
-- reset behaves identically to a hosted project. RLS (already enabled on
-- every table in 0005) remains the actual row-level access boundary.
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
