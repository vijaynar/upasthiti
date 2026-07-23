-- Abhyas V2 — public coach search grants.
--
-- GET /api/v1/public/coaches (rewritten in this change to query coach_profiles
-- + categories/subcategories/tags instead of V1's dead coaches/coach_categories
-- tables) reads via adminDb() — PostgREST over the service_role key, same
-- "public/anonymous reads go through service-role" precedent migration 0013's
-- header point 1 documents. categories/subcategories/tags/coach_profiles
-- already picked up their service_role grants in migration 0019; `users` and
-- `geo_areas` never did (0003_identity.sql/0013_marketplace.sql only granted
-- `authenticated`), so the joins/lookups this route needs (coach_profiles ->
-- users for name/avatar; city -> geo_areas.key for the city filter) 42501
-- without them — same root cause as the categories-route permission-denied
-- bug migration 0019 fixed.

grant select on users to service_role;
grant select on geo_areas to service_role;
