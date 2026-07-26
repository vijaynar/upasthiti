-- Abhyas V2 — public categories route: academy counts.
--
-- GET /api/v1/public/categories already computes coachCount per category via
-- adminDb() (PostgREST over service_role). Adding the same academyCount for
-- listings.category_id (migration 0023) hits the same 42501 gap migration
-- 0019/0020 already documented for coach_profiles/users/geo_areas: tables
-- created by our migrations are owned by role `postgres`, whose default ACL
-- doesn't include service_role SELECT — listings never got this grant
-- because until now nothing read it through PostgREST (the marketplace
-- module's own reads/writes go through db.getServiceClient(), a raw pg
-- connection as `postgres`, which never needed it).

grant select on listings to service_role;
