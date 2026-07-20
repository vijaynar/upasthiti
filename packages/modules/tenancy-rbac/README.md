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

## Phase 4 (done)

roles/permissions/role_permissions/membership_roles/platform_role_assignments/
coach_assignments/support_access_grants + `has_perm()`/`has_perm_branch()`/
`my_batch_ids()`/`support_grant_active()` (all `SECURITY DEFINER` — see
migration 0006's header, this is load-bearing not stylistic) + last-Owner
and seed-super-admin protection triggers + the full permission
catalogue/system roles/role_permissions seed (migration `0006_rbac.sql`).
`is_org_wide_member()` is gone — migration 0004's policies that used it are
DROPped and replaced with `has_perm()`/`has_perm_branch()` versions inside
0006 itself (not an edit to 0004; RBAC's tables have FKs into tenancy's, so
0004 can never call a function 0006 defines).

`hasPerm()`/`hasPermBranch()` (app-layer, advisory) call the same SQL
functions RLS uses. `createOrganization`/`acceptInvitation`/
`decideJoinRequest` now grant the relevant role(s) for real.
`listMembers`/`grantRole`/`revokeRole` are new — no admin UI yet (same
precedent as Phase 3's invitations/join-requests). See
`IMPLEMENTATION_STATUS.md`'s Phase 4 section for the full writeup,
including known gaps.
