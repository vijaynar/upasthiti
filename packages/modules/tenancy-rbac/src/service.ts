// tenancy-rbac module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: organizations, branches, memberships, invitations, join_requests, roles, permissions, membership_roles, platform_role_assignments, coach_assignments, support_access_grants (M2/M3, Doc 02/04)
// Target phase: Phase 3-4 — Multi-Tenancy & RBAC (see the implementation roadmap).

export {};
