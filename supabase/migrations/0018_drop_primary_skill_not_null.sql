-- =========================================================================
-- MIGRATION: 0018_drop_primary_skill_not_null.sql
-- Upasthiti — Drop NOT NULL on coaches.primary_skill
--
-- The category/subcategory taxonomy (0014/0015) replaced primary_skill as
-- the source of truth for coach specialty — coach_categories/coach_tags
-- now carry that data, and no app code writes primary_skill anymore.
-- The column was intentionally kept (not dropped) as inert legacy data,
-- but its original NOT NULL constraint was never relaxed, so every new
-- coach INSERT (which no longer supplies a value) fails with a not-null
-- violation. This surfaced as a generic "Internal server error" on Step 5
-- of Coach Onboarding, since Supabase/PostgREST errors aren't `Error`
-- instances and fell through to the API's generic catch-all message.
-- =========================================================================

ALTER TABLE public.coaches ALTER COLUMN primary_skill DROP NOT NULL;
