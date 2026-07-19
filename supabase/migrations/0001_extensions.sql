-- Abhyas V2 — Extensions
-- V1 schema lives in supabase/migrations_v1_legacy/ for reference; this is a
-- greenfield rebuild (docsV2/00_gap_analysis.md, confirmed no data migration needed).

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;     -- pgvector, face_enrollments (Doc 07 §8)
create extension if not exists pg_trgm;    -- fuzzy/typeahead search support (marketplace, geo)
