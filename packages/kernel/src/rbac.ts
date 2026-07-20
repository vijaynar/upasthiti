// Shared RBAC types (Doc 04 §1 principle 1, §10). Application code asks
// permissions, never role identity — "hasPerm(session, 'attendance.record',
// {branchId})", never "is this user a coach?".
//
// There is no can()/hasPerm() function HERE: kernel has zero DB access by
// design (Doc 14 §7 — provider SDKs, and by extension any DB-touching code,
// live only in packages/platform; packages/platform depends on
// packages/kernel, never the other way, so kernel importing it back would
// be circular). The real implementation is
// @abhyas/module-tenancy-rbac's hasPerm()/hasPermBranch() — it owns the
// roles/permissions/membership_roles tables and calls the SAME
// has_perm()/has_perm_branch() Postgres functions RLS itself uses, so the
// advisory app-layer answer can never drift from the real gate. Advisory
// only either way (Doc 04 §10) — RLS is the last line, a bug in the
// advisory check can be wrong without breaching isolation.

export interface PermissionTarget {
  orgId?: string;
  branchId?: string;
  batchId?: string;
  subjectUserId?: string;
}
