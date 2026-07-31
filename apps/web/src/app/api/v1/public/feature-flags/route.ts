// GET /api/v1/public/feature-flags
// Public endpoint — no authentication required. Returns each Global
// Settings feature flag's key -> default_on value so anonymous/client-side
// UI (the public marketplace) can gate itself on a flag without a session —
// the existing /api/v1/platform/feature-flags route requires one.
//
// Reads via db.withRequestContext with a synthetic anonymous session
// (empty userId, no org) rather than adminDb()/PostgREST — feature_flags'
// `feature_flags_select_all` RLS policy is `USING (true)` (openly public)
// and `authenticated` (the role withRequestContext always drops to,
// regardless of whether a real user is logged in) already has a SELECT
// grant on the table, so no service-role escalation is needed here.
// adminDb() was tried first and 500'd: service_role has no SELECT grant on
// feature_flags at all (it's managed exclusively through the pg-pool +
// RLS path, never exposed via PostgREST) — see 42501 "permission denied
// for table feature_flags" if this regresses.
//
// Per-org overrides (org_feature_flags) don't apply here; this is only the
// global default, which is what "Global settings" flags like
// EnableAcademyOperation are keyed on.
import { db } from '@abhyas/platform';
import { ok, err } from '@/lib/api';

// No dynamic input (no params/cookies/headers read), so Next.js would
// otherwise statically optimize this route and cache its first response
// forever — silently serving a stale flags snapshot after every DB change.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await db.withRequestContext({ userId: '', orgId: null }, async (client) => {
      const result = await client.query<{ key: string; default_on: boolean }>('select key, default_on from feature_flags');
      return result.rows;
    });

    const flags: Record<string, boolean> = {};
    for (const row of rows) flags[row.key] = row.default_on;

    return ok({ flags });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}
