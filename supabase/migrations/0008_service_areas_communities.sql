-- =========================================================================
-- MIGRATION: 0008_service_areas_communities.sql
-- Abhyas — Coach Service Area / Community two-tier geography model
--
-- Tier 1 (service_areas): a small, stable, seeded list of Hyderabad
-- localities, with lat/lng so the Places API (New) Autocomplete can anchor
-- its `locationRestriction` circle on the coach's actually-selected area
-- instead of a single fixed city-wide point. This powers the Discovery
-- "near me" filter — low churn, curated, never coach-editable.
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
    -- Approximate locality-center points (general geographic knowledge, not a
    -- surveyed/geocoded source) — accurate enough to anchor a 5km search
    -- radius, but worth spot-checking in Google Maps if an area looks off-center.
    lat             NUMERIC(9, 6),
    lng             NUMERIC(9, 6),
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

-- 6. Seed Tier 1 — Hyderabad service areas (with coordinates baked in) ------------
INSERT INTO public.service_areas (name, slug, display_order, lat, lng) VALUES
    ('Gachibowli',                 'gachibowli',                 1,  17.4401, 78.3489),
    ('Kondapur',                   'kondapur',                   2,  17.4615, 78.3672),
    ('Kokapet',                    'kokapet',                    3,  17.4147, 78.3339),
    ('Narsingi',                   'narsingi',                   4,  17.3959, 78.3489),
    ('Manikonda',                  'manikonda',                  5,  17.4062, 78.3809),
    ('Financial District',         'financial-district',         6,  17.4131, 78.3454),
    ('Tellapur',                   'tellapur',                   7,  17.4735, 78.3057),
    ('Nallagandla',                'nallagandla',                8,  17.4622, 78.3169),
    ('Miyapur',                    'miyapur',                    9,  17.4969, 78.3629),
    ('Kukatpally',                 'kukatpally',                 10, 17.4849, 78.4108),
    ('Nizampet',                   'nizampet',                   11, 17.5079, 78.3849),
    ('Bachupally',                 'bachupally',                 12, 17.5354, 78.3746),
    ('Kompally',                   'kompally',                   13, 17.5433, 78.4869),
    ('Madhapur',                   'madhapur',                   14, 17.4483, 78.3915),
    ('Hitech City',                'hitech-city',                15, 17.4483, 78.3799),
    ('Jubilee Hills',              'jubilee-hills',               16, 17.4308, 78.4073),
    ('Banjara Hills',              'banjara-hills',               17, 17.4156, 78.4347),
    ('Somajiguda',                 'somajiguda',                 18, 17.4239, 78.4611),
    ('Begumpet',                   'begumpet',                   19, 17.4436, 78.4666),
    ('Ameerpet',                   'ameerpet',                   20, 17.4374, 78.4482),
    ('SR Nagar',                   'sr-nagar',                   21, 17.4423, 78.4416),
    ('Kukatpally Housing Board',   'kukatpally-housing-board',   22, 17.4931, 78.3996),
    ('Chandanagar',                'chandanagar',                23, 17.4938, 78.3389),
    ('Attapur',                    'attapur',                    24, 17.3733, 78.4285),
    ('Rajendra Nagar',             'rajendra-nagar',             25, 17.3389, 78.4006),
    ('LB Nagar',                   'lb-nagar',                   26, 17.3465, 78.5531),
    ('Uppal',                      'uppal',                      27, 17.4058, 78.5591),
    ('Nagole',                     'nagole',                     28, 17.3757, 78.5561),
    ('Alwal',                      'alwal',                      29, 17.5039, 78.5077),
    ('Secunderabad',               'secunderabad',               30, 17.4399, 78.4983),
    ('Dammaiguda',                 'dammaiguda',                 31, 17.4884, 78.5626),
    ('Vanasthalipuram',            'vanasthalipuram',            32, 17.3444, 78.5719),
    ('Dilsukhnagar',               'dilsukhnagar',               33, 17.3687, 78.5247),
    ('Malakpet',                   'malakpet',                   34, 17.3739, 78.5008),
    ('Shamshabad',                 'shamshabad',                 35, 17.2403, 78.4294),
    ('Adibatla',                   'adibatla',                   36, 17.2158, 78.5511),
    ('Nadergul',                   'nadergul',                   37, 17.2836, 78.5225),
    ('Hayathnagar',                'hayathnagar',                38, 17.3267, 78.5992),
    ('Medchal',                    'medchal',                    39, 17.6293, 78.4816),
    ('Suchitra',                   'suchitra',                   40, 17.5285, 78.4592),
    ('Bowenpally',                 'bowenpally',                 41, 17.4667, 78.4783),
    ('Sainikpuri',                 'sainikpuri',                 42, 17.5028, 78.5544),
    ('ECIL',                       'ecil',                       43, 17.4728, 78.5661),
    ('Kapra',                      'kapra',                      44, 17.4772, 78.5535),
    ('Habsiguda',                  'habsiguda',                  45, 17.4103, 78.5453),
    ('Tarnaka',                    'tarnaka',                    46, 17.4278, 78.5347),
    ('Nacharam',                   'nacharam',                   47, 17.4269, 78.5566),
    ('Toli Chowki',                'toli-chowki',                48, 17.3963, 78.4174),
    ('Mehdipatnam',                'mehdipatnam',                49, 17.3948, 78.4392),
    ('Panjagutta',                 'panjagutta',                 50, 17.4275, 78.4506);

-- 7. Row Level Security -----------------------------------------------------------
-- service_areas/service_communities: curated/dynamic geography reference
-- data — public read, writes are admin/service-role only.
ALTER TABLE public.service_areas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_public_read_service_areas"       ON public.service_areas       FOR SELECT USING (is_active = true);
CREATE POLICY "allow_public_read_service_communities" ON public.service_communities FOR SELECT USING (is_active = true);

-- coach_service_areas/coach_service_communities: public read (Discovery
-- reads any coach's areas), self-managed write.
ALTER TABLE public.coach_service_areas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_service_communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_public_read_coach_service_areas" ON public.coach_service_areas FOR SELECT USING (true);
CREATE POLICY "coach_service_areas_self_manage" ON public.coach_service_areas
    FOR ALL USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

CREATE POLICY "allow_public_read_coach_service_communities" ON public.coach_service_communities FOR SELECT USING (true);
CREATE POLICY "coach_service_communities_self_manage" ON public.coach_service_communities
    FOR ALL USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
