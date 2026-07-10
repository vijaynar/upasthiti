-- =========================================================================
-- MIGRATION: 0022_service_areas_communities.sql
-- Upasthiti — Coach Service Area / Community two-tier geography model
--
-- Tier 1 (service_areas): a small, stable, seeded list of Hyderabad
-- localities. This is what powers the Discovery "near me" filter — low
-- churn, curated, never coach-editable.
--
-- Tier 2 (service_communities): a dynamic, coach- (or admin-) grown list
-- of specific residential communities/apartment complexes, scoped to one
-- Tier 1 area. Rather than pre-populating an exhaustive list, coaches
-- search/add their own via Google Places Autocomplete on the client; the
-- resolved place is deduped server-side by google_place_id, so the first
-- coach to add "L&T Serene County" creates the row and every subsequent
-- coach searching the same place reuses it.
-- =========================================================================

-- 1. service_areas -----------------------------------------------------------
CREATE TABLE public.service_areas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    city            VARCHAR(100) NOT NULL DEFAULT 'Hyderabad',
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. service_communities -------------------------------------------------------
-- google_place_id is the primary dedup key once a coach resolves a place via
-- Places Autocomplete. It's nullable to support a manual-entry fallback when
-- no Google Maps API key is configured (or the coach's typed name doesn't
-- resolve) — those rows are deduped best-effort by (area_id, name) in the API
-- layer rather than a hard DB constraint, since free-text names aren't a
-- reliable uniqueness key.
CREATE TABLE public.service_communities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id             UUID NOT NULL REFERENCES public.service_areas(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    google_place_id     VARCHAR(255),
    lat                 NUMERIC(9, 6),
    lng                 NUMERIC(9, 6),
    formatted_address   TEXT,
    created_by_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_service_communities_place_id
    ON public.service_communities(google_place_id) WHERE google_place_id IS NOT NULL;

-- 3. coach_service_areas -------------------------------------------------------
CREATE TABLE public.coach_service_areas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id    UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    area_id     UUID NOT NULL REFERENCES public.service_areas(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, area_id)
);

-- 4. coach_service_communities --------------------------------------------------
CREATE TABLE public.coach_service_communities (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id       UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    community_id   UUID NOT NULL REFERENCES public.service_communities(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, community_id)
);

-- 5. Indexes ---------------------------------------------------------------------
CREATE INDEX idx_service_areas_active ON public.service_areas(is_active, display_order);
CREATE INDEX idx_service_communities_area ON public.service_communities(area_id);
CREATE INDEX idx_service_communities_area_name ON public.service_communities(area_id, lower(name));
CREATE INDEX idx_coach_service_areas_coach ON public.coach_service_areas(coach_id);
CREATE INDEX idx_coach_service_areas_area ON public.coach_service_areas(area_id);
CREATE INDEX idx_coach_service_communities_coach ON public.coach_service_communities(coach_id);
CREATE INDEX idx_coach_service_communities_community ON public.coach_service_communities(community_id);

-- 6. Seed Tier 1 — Hyderabad service areas ---------------------------------------
INSERT INTO public.service_areas (name, slug, display_order) VALUES
    ('Gachibowli',                 'gachibowli',                 1),
    ('Kondapur',                   'kondapur',                   2),
    ('Kokapet',                    'kokapet',                    3),
    ('Narsingi',                   'narsingi',                   4),
    ('Manikonda',                  'manikonda',                  5),
    ('Financial District',         'financial-district',         6),
    ('Tellapur',                   'tellapur',                   7),
    ('Nallagandla',                'nallagandla',                8),
    ('Miyapur',                    'miyapur',                    9),
    ('Kukatpally',                 'kukatpally',                 10),
    ('Nizampet',                   'nizampet',                   11),
    ('Bachupally',                 'bachupally',                 12),
    ('Kompally',                   'kompally',                   13),
    ('Madhapur',                   'madhapur',                   14),
    ('Hitech City',                'hitech-city',                15),
    ('Jubilee Hills',              'jubilee-hills',               16),
    ('Banjara Hills',              'banjara-hills',               17),
    ('Somajiguda',                 'somajiguda',                 18),
    ('Begumpet',                   'begumpet',                   19),
    ('Ameerpet',                   'ameerpet',                   20),
    ('SR Nagar',                   'sr-nagar',                   21),
    ('Kukatpally Housing Board',   'kukatpally-housing-board',   22),
    ('Chandanagar',                'chandanagar',                23),
    ('Attapur',                    'attapur',                    24),
    ('Rajendra Nagar',             'rajendra-nagar',             25),
    ('LB Nagar',                   'lb-nagar',                   26),
    ('Uppal',                      'uppal',                      27),
    ('Nagole',                     'nagole',                     28),
    ('Alwal',                      'alwal',                      29),
    ('Secunderabad',               'secunderabad',               30),
    ('Dammaiguda',                 'dammaiguda',                 31),
    ('Vanasthalipuram',            'vanasthalipuram',            32),
    ('Dilsukhnagar',               'dilsukhnagar',               33),
    ('Malakpet',                   'malakpet',                   34),
    ('Shamshabad',                 'shamshabad',                 35),
    ('Adibatla',                   'adibatla',                   36),
    ('Nadergul',                   'nadergul',                   37),
    ('Hayathnagar',                'hayathnagar',                38),
    ('Medchal',                    'medchal',                    39),
    ('Suchitra',                   'suchitra',                   40),
    ('Bowenpally',                 'bowenpally',                 41),
    ('Sainikpuri',                 'sainikpuri',                 42),
    ('ECIL',                       'ecil',                       43),
    ('Kapra',                      'kapra',                      44),
    ('Habsiguda',                  'habsiguda',                  45),
    ('Tarnaka',                    'tarnaka',                    46),
    ('Nacharam',                   'nacharam',                   47),
    ('Toli Chowki',                'toli-chowki',                48),
    ('Mehdipatnam',                'mehdipatnam',                49),
    ('Panjagutta',                 'panjagutta',                 50);
