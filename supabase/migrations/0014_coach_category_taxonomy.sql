-- =========================================================================
-- MIGRATION: 0014_coach_category_taxonomy.sql
-- Upasthiti — Discovery Category/Subcategory/Tag Taxonomy
--
-- Replaces the free-text coaches.primary_skill field with a real,
-- platform-wide (not tenant-scoped) taxonomy so that Discovery filtering
-- and Coach onboarding tagging share the same structured vocabulary.
--
-- categories        top-level domains (Sports, Music, Academic/Tuition, ...)
-- subcategories     leaf specialties under a category. For Academic/Tuition
--                    these are grade-bands, not raw subjects (see rationale
--                    in docs/feature_plan.md discussion) — Class 3-5, Class
--                    9-10, Senior Secondary, Competitive Exams, etc.
-- tags               cross-cutting attributes (board / subject / stream /
--                    exam) that layer on top of an Academic subcategory.
-- coach_categories   join: which subcategories a coach teaches, one primary.
-- coach_tags         join: which tags (board/subject/stream/exam) apply.
-- =========================================================================

-- 1. categories ------------------------------------------------------------
CREATE TABLE public.categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    icon            VARCHAR(10),
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. subcategories -----------------------------------------------------------
CREATE TABLE public.subcategories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    slug            VARCHAR(150) NOT NULL UNIQUE,
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category_id, name)
);

-- 3. tags --------------------------------------------------------------------
-- subcategory_id is nullable: NULL means the tag applies broadly (e.g. Board
-- tags apply across every Academic/Tuition grade-band rather than being
-- duplicated per subcategory). Non-null scopes the tag to one subcategory
-- (e.g. a Subject tag like "Physics" only makes sense under Senior Secondary).
CREATE TABLE public.tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subcategory_id  UUID REFERENCES public.subcategories(id) ON DELETE CASCADE,
    tag_type        VARCHAR(20) NOT NULL CHECK (tag_type IN ('subject', 'board', 'stream', 'exam')),
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial-safe uniqueness: two tags of the same type/slug cannot both be
-- global (NULL subcategory_id), and cannot repeat within the same subcategory.
CREATE UNIQUE INDEX idx_tags_unique_global ON public.tags(tag_type, slug) WHERE subcategory_id IS NULL;
CREATE UNIQUE INDEX idx_tags_unique_scoped ON public.tags(subcategory_id, tag_type, slug) WHERE subcategory_id IS NOT NULL;

-- 4. coach_categories ---------------------------------------------------------
CREATE TABLE public.coach_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id        UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    subcategory_id  UUID NOT NULL REFERENCES public.subcategories(id) ON DELETE CASCADE,
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, subcategory_id)
);

-- Enforce at most one primary subcategory per coach.
CREATE UNIQUE INDEX idx_one_primary_category_per_coach ON public.coach_categories(coach_id) WHERE is_primary = true;

-- 5. coach_tags ----------------------------------------------------------------
CREATE TABLE public.coach_tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id        UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tag_id          UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, tag_id)
);

-- 6. coaches: Discovery filter metadata ----------------------------------------
ALTER TABLE public.coaches
    ADD COLUMN IF NOT EXISTS age_groups   VARCHAR(20)[] NOT NULL DEFAULT '{}'
        CHECK (age_groups <@ ARRAY['Kids', 'Teens', 'Adults']::VARCHAR(20)[]),
    ADD COLUMN IF NOT EXISTS skill_levels VARCHAR(20)[] NOT NULL DEFAULT '{}'
        CHECK (skill_levels <@ ARRAY['Beginner', 'Intermediate', 'Advanced']::VARCHAR(20)[]);

-- 7. Indexes ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_subcategories_category ON public.subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_tags_subcategory ON public.tags(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_coach_categories_coach ON public.coach_categories(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_categories_subcategory ON public.coach_categories(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_coach_tags_coach ON public.coach_tags(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_tags_tag ON public.coach_tags(tag_id);
