-- =========================================================================
-- MIGRATION: 0021_move_running_rename_athletics.sql
-- Upasthiti — Move "Running" from Sports to Fitness; rename
-- "Athletics & Track" to "Athletics" (display name only, slug unchanged)
-- =========================================================================

UPDATE public.subcategories
SET category_id = (SELECT id FROM public.categories WHERE slug = 'fitness'),
    display_order = 9
WHERE slug = 'running';

UPDATE public.subcategories
SET name = 'Athletics'
WHERE slug = 'athletics-track';
