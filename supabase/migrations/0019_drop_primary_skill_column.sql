-- =========================================================================
-- MIGRATION: 0019_drop_primary_skill_column.sql
-- Upasthiti — Drop coaches.primary_skill (superseded by category taxonomy)
--
-- primary_skill was replaced by coach_categories/coach_tags in 0014/0015.
-- No app code reads or writes it anymore (confirmed by repo-wide search —
-- only a same-named local variable derived from coach_categories remains,
-- unrelated to this column). No indexes, views, or functions depend on it.
-- 0018 already dropped its NOT NULL constraint as a stopgap; this
-- completes the cleanup.
-- =========================================================================

ALTER TABLE public.coaches DROP COLUMN primary_skill;
