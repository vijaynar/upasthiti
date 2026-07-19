// Session context carried on every authenticated request (Doc 05 §6).
// Never a role list — roles are resolved per-request from the DB (Doc 04
// §10) so a revoked role takes effect immediately instead of waiting for
// a stale JWT to expire. Defined here (not in platform/db) so both
// @abhyas/platform and business modules can depend on one shared shape
// without a circular import.
export interface SessionContext {
  userId: string;
  /** Active workspace (Doc 05 §7). null = unselected / platform-console session. */
  orgId: string | null;
}
