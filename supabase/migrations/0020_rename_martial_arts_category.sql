-- =========================================================================
-- MIGRATION: 0020_rename_martial_arts_category.sql
-- Upasthiti — Rename "Martial Arts & Self-Defense" category to "Martial Arts"
--
-- Display-name-only change; slug (martial-arts-self-defense) is left as-is
-- since it's a stable identifier and nothing else references it.
-- =========================================================================

UPDATE public.categories
SET name = 'Martial Arts'
WHERE slug = 'martial-arts-self-defense';
