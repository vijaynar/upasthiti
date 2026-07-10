-- =========================================================================
-- MIGRATION: 0023_service_areas_coordinates.sql
-- Abhyas — Add lat/lng to service_areas
--
-- Needed to center the Places API (New) Autocomplete `locationRestriction`
-- circle on the coach's actually-selected area (Gachibowli, Shamshabad, …)
-- instead of a single fixed city-wide point — that's what let a Gachibowli
-- search surface Shamshabad results ~40km away, since a soft citywide bias
-- doesn't exclude anything, it only re-ranks.
--
-- Coordinates are approximate locality-center points (general geographic
-- knowledge, not a surveyed/geocoded source) — accurate enough to anchor a
-- 5km search radius, but worth spot-checking in Google Maps if a specific
-- area's results look off-center.
-- =========================================================================

ALTER TABLE public.service_areas
    ADD COLUMN IF NOT EXISTS lat NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS lng NUMERIC(9, 6);

UPDATE public.service_areas SET lat = v.lat, lng = v.lng FROM (VALUES
    ('gachibowli',                 17.4401, 78.3489),
    ('kondapur',                   17.4615, 78.3672),
    ('kokapet',                    17.4147, 78.3339),
    ('narsingi',                   17.3959, 78.3489),
    ('manikonda',                  17.4062, 78.3809),
    ('financial-district',         17.4131, 78.3454),
    ('tellapur',                   17.4735, 78.3057),
    ('nallagandla',                17.4622, 78.3169),
    ('miyapur',                    17.4969, 78.3629),
    ('kukatpally',                 17.4849, 78.4108),
    ('nizampet',                   17.5079, 78.3849),
    ('bachupally',                 17.5354, 78.3746),
    ('kompally',                   17.5433, 78.4869),
    ('madhapur',                   17.4483, 78.3915),
    ('hitech-city',                17.4483, 78.3799),
    ('jubilee-hills',              17.4308, 78.4073),
    ('banjara-hills',              17.4156, 78.4347),
    ('somajiguda',                 17.4239, 78.4611),
    ('begumpet',                   17.4436, 78.4666),
    ('ameerpet',                   17.4374, 78.4482),
    ('sr-nagar',                   17.4423, 78.4416),
    ('kukatpally-housing-board',   17.4931, 78.3996),
    ('chandanagar',                17.4938, 78.3389),
    ('attapur',                    17.3733, 78.4285),
    ('rajendra-nagar',             17.3389, 78.4006),
    ('lb-nagar',                   17.3465, 78.5531),
    ('uppal',                      17.4058, 78.5591),
    ('nagole',                     17.3757, 78.5561),
    ('alwal',                      17.5039, 78.5077),
    ('secunderabad',               17.4399, 78.4983),
    ('dammaiguda',                 17.4884, 78.5626),
    ('vanasthalipuram',            17.3444, 78.5719),
    ('dilsukhnagar',               17.3687, 78.5247),
    ('malakpet',                   17.3739, 78.5008),
    ('shamshabad',                 17.2403, 78.4294),
    ('adibatla',                   17.2158, 78.5511),
    ('nadergul',                   17.2836, 78.5225),
    ('hayathnagar',                17.3267, 78.5992),
    ('medchal',                    17.6293, 78.4816),
    ('suchitra',                   17.5285, 78.4592),
    ('bowenpally',                 17.4667, 78.4783),
    ('sainikpuri',                 17.5028, 78.5544),
    ('ecil',                       17.4728, 78.5661),
    ('kapra',                      17.4772, 78.5535),
    ('habsiguda',                  17.4103, 78.5453),
    ('tarnaka',                    17.4278, 78.5347),
    ('nacharam',                   17.4269, 78.5566),
    ('toli-chowki',                17.3963, 78.4174),
    ('mehdipatnam',                17.3948, 78.4392),
    ('panjagutta',                 17.4275, 78.4506)
) AS v(slug, lat, lng)
WHERE service_areas.slug = v.slug;
