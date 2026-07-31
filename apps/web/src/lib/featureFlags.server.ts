// Server-side read of a Global Settings feature flag's default_on value, for
// server components that render chrome before any client JS runs (e.g.
// PublicSiteHeader's nav links). Mirrors useFeatureFlags.ts's fail-open
// default so server and client renders agree.
//
// Reads via db.withRequestContext (pg pool, drops to the `authenticated`
// role) rather than adminDb()/PostgREST — see the header comment in
// api/v1/public/feature-flags/route.ts for why: service_role has no SELECT
// grant on feature_flags, only `authenticated` does, and the table's RLS
// policy is openly public (`USING (true)`) so an anonymous session works.

import { db } from '@abhyas/platform';
import { ACADEMY_FEATURE_FLAG_KEY } from './featureFlags';

export async function isFeatureFlagEnabledServer(key: string, defaultValue = true): Promise<boolean> {
  try {
    const row = await db.withRequestContext({ userId: '', orgId: null }, async (client) => {
      const result = await client.query<{ default_on: boolean }>('select default_on from feature_flags where key = $1', [key]);
      return result.rows[0];
    });
    return row ? row.default_on : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function isAcademyOperationEnabledServer(): Promise<boolean> {
  return isFeatureFlagEnabledServer(ACADEMY_FEATURE_FLAG_KEY, true);
}
