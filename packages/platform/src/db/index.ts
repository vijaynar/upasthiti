import { getPool, type PoolClient } from './pool';
import type { SessionContext } from './types';

export type { SessionContext } from './types';
export { SERVICE_ROLE_MANIFEST } from './service-role-manifest';

/**
 * Runs `fn` inside a transaction with RLS session context set via
 * `set_config(..., true)` (transaction-scoped — safe under pgBouncer
 * transaction-mode pooling, Doc 15 §9). This is the ONLY way application
 * code should touch org-scoped tables; RLS is the real gate (Doc 02 §5),
 * this just feeds it who is asking.
 *
 * `SET LOCAL ROLE authenticated` matters, not just the set_config calls:
 * DATABASE_URL connects as `postgres`, which has BYPASSRLS — without
 * dropping to `authenticated` (the same role Supabase's own PostgREST
 * layer uses, and one `postgres` is already a member of locally) every
 * policy in the schema would be silently skipped and grants/policies would
 * do nothing. Reverts automatically at COMMIT/ROLLBACK (transaction-local).
 */
export async function withRequestContext<T>(
  ctx: SessionContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('select set_config($1, $2, true)', ['app.user_id', ctx.userId]);
    await client.query('select set_config($1, $2, true)', ['app.org_id', ctx.orgId ?? '']);
    await client.query('set local role authenticated');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Bypasses RLS entirely (no session context is set). Reserved for
 * background jobs, admin scripts, and platform-admin tooling explicitly
 * registered in `SERVICE_ROLE_MANIFEST` below (Doc 13 §2.3) — the CI
 * service-role-inventory check greps call sites against that list.
 */
export async function getServiceClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Resolves an org's effective on/off value for a `feature_flags` key —
 * `org_feature_flags`'s per-org override if one exists, else the flag's own
 * `default_on` (migration 0007_platform_admin's feature-flag mechanism).
 *
 * Service-role, NOT the caller's own `withRequestContext` client — this was
 * tried first and is a real bug class this codebase has hit before (Phase
 * 10's notification-muting-floor bug, see IMPLEMENTATION_STATUS.md): the
 * naive version ran on the caller's own session, but `org_feature_flags`'
 * RLS (`organization_id = current_org()`) only matches when the CALLER's
 * currently active workspace happens to equal the org being checked. A
 * caller legitimately acting on an org that isn't their active workspace
 * (e.g. a student submitting a review to an org via URL path, never having
 * called `/me/workspace` for it) got zero rows back — RLS silently, not an
 * error — so this always fell through to `default_on` (false) regardless
 * of the org's real setting. "Is org X's flag on" is inherently
 * context-independent of who's asking (a separate permission check already
 * gates whether the caller may act at all), so it reads via service-role
 * like any other legitimately cross-actor lookup (SERVICE_ROLE_MANIFEST).
 */
export async function isOrgFeatureEnabled(organizationId: string, flagKey: string): Promise<boolean> {
  const client = await getServiceClient();
  try {
    const result = await client.query<{ enabled: boolean }>(
      `select coalesce(off.enabled, ff.default_on, false) as enabled
       from feature_flags ff
       left join org_feature_flags off on off.organization_id = $2 and off.flag_key = ff.key
       where ff.key = $1`,
      [flagKey, organizationId]
    );
    return result.rows[0]?.enabled ?? false;
  } finally {
    client.release();
  }
}
