# @abhyas/module-tenancy-rbac

**Target phase:** Phase 3-4 — Multi-Tenancy & RBAC
**Scope:** organizations, branches, memberships, invitations, join_requests, roles, permissions, membership_roles, platform_role_assignments, coach_assignments, support_access_grants (M2/M3, Doc 02/04)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.

## Phase 3 (done)

organizations/branches/memberships/invitations/join_requests +
org_branding/org_domains, RLS (migration `0004_tenancy.sql`), and the
service functions for all 4 provisioning flows (Doc 02 §9): create org
(coach/academy), accept invitation, join request + approve, workspace
switcher data.

RBAC proper (roles/permissions/membership_roles/has_perm()) is **not**
built yet — an interim "org-wide member" gate (`is_org_wide_member()`)
stands in for admin-ish authorization until Phase 4. See migration
0004's header comment and `IMPLEMENTATION_STATUS.md`.
