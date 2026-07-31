// Feature flag keys shared between client hooks (useFeatureFlags.ts) and
// server-side reads (featureFlags.server.ts) — kept in their own file (no
// 'use client', no server-only imports) so either side can import just the
// key without pulling in the other's runtime.

// Global Settings > Feature Flags key that gates all Academy-related UI
// (marketplace academy discovery, academy onboarding, nav links) — org-type
// 'academy' specifically. Individual-coach flows are unaffected either way.
export const ACADEMY_FEATURE_FLAG_KEY = 'EnableAcademyOperation';
