import type { SessionContext } from './session';

// can()/RBAC helper (Doc 04 §1 principle 1, §10). Application code asks
// permissions, never role identity — "can(session, 'attendance.record',
// {org, branch})", never "is this user a coach?".
//
// ADVISORY ONLY — this is for UX (hide buttons, early 403s). RLS is the
// real gate (Doc 02 §5); a bug here can be wrong without breaching
// isolation. Real resolution (membership -> membership_role ->
// role_permissions, plus guardianship and coach_assignment paths) needs
// the RBAC schema and lands in Phase 4.

export interface PermissionTarget {
  orgId?: string;
  branchId?: string;
  batchId?: string;
  subjectUserId?: string;
}

export async function can(
  _session: SessionContext,
  _permission: string,
  _target: PermissionTarget = {}
): Promise<boolean> {
  throw new Error('[kernel/rbac] can() is not implemented until Phase 4 (RBAC & Schema Completion).');
}
