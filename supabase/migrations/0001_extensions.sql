-- ============================================================
-- MIGRATION: 0001_extensions.sql
-- Abhyas — Greenfield baseline: extensions
-- ============================================================
-- This migration set replaces the entire prior migration history
-- (0001-0013 in supabase/migrations/). It represents the FINAL shape
-- of the database as of today, reorganized topically instead of
-- chronologically. No intermediate churn (added-then-dropped columns,
-- superseded RLS policies, replaced indexes) is reproduced here.
--
-- "uuid-ossp" was enabled historically but never actually used — every
-- table default uses gen_random_uuid() (pgcrypto) instead — so it is
-- dropped from this baseline.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "vector";     -- pgvector: face-embedding similarity search
