-- =========================================================================
-- MIGRATION: 0024_drop_specialization_column.sql
-- Removes coaches.specialization — replaced by the category/subcategory
-- taxonomy (coach_categories/coach_tags) for skill detail, and by the
-- per-category-scoped Qualification field for credential text. No app code
-- reads or writes this column after this migration.
-- =========================================================================

ALTER TABLE public.coaches DROP COLUMN IF EXISTS specialization;
