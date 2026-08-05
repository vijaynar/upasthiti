-- Seeds two Global Settings feature flags that only ever existed as rows
-- created through the platform-admin UI (upsertFeatureFlag), never through a
-- migration — so a `supabase db reset` wipes them and the admin console's
-- Feature flags tab shows only whatever migration 0007 seeded
-- (historical_backdating). Both keys are already referenced in application
-- code and are fail-open (default true) when the row is missing, so this
-- migration doesn't change current behavior — it just makes the rows survive
-- a DB recreation like every other flag.

insert into feature_flags (key, default_on, description) values
  ('EnableAcademyOperation', true,
   'Gates all Academy-related UI (marketplace academy discovery, academy onboarding, nav links) for org-type ''academy''. Individual-coach flows are unaffected either way. On by default — today''s behavior.'),
  ('DisableAddWorkspace_ForIndependentCoach', true,
   'When on, independent-coach accounts do not see the "Add another workspace" action on the workspace switcher (an independent coach is limited to a single workspace). On by default — matches the previous hardcoded behavior.')
on conflict (key) do nothing;
