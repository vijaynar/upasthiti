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
