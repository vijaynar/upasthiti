-- Abhyas V2 — listings: category/subcategory/tag/age-group/skill-level
-- taxonomy (parallels coach_profiles, migration 0019).
--
-- Context: the Academies onboarding wizard (AcademyOnboardingWizard.tsx
-- Step 3, "Programs & Taxonomy") already renders the full CategoryPicker
-- and collects categoryId/subcategoryIds/primarySubcategoryId/tagIds/
-- ageGroups/skillLevels from the org — but `listings` never had columns
-- for any of it, so the wizard silently dropped that selection at submit
-- time and only sport_keys (the older, unrelated taxonomy_sports taxonomy)
-- made it to the marketplace listing. This adds the same columns
-- coach_profiles got in 0019 so that selection can actually be persisted
-- and /explore/academies can filter the same way /explore/search does for
-- coaches — same taxonomy, same facets, not a lookalike.
--
-- taxonomy_sports/sport_keys stays as-is (still used for the sport chips on
-- the listing card / org branch), this is additive, not a replacement.

alter table listings
  add column category_id uuid references categories(id),
  add column subcategory_ids uuid[] not null default '{}',
  add column primary_subcategory_id uuid references subcategories(id),
  add column tag_ids uuid[] not null default '{}',
  add column age_groups text[] not null default '{}',
  add column skill_levels text[] not null default '{}';

create index listings_category_idx on listings(category_id);
