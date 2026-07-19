# @abhyas/module-tenancy-rbac

**Target phase:** Phase 3-4 — Multi-Tenancy & RBAC
**Scope:** organizations, branches, memberships, invitations, join_requests, roles, permissions, membership_roles, platform_role_assignments, coach_assignments, support_access_grants (M2/M3, Doc 02/04)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
