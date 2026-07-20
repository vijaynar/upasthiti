// Doc 13 §2.3 — every call site allowed to use getServiceClient() (RLS
// bypass) must be listed here with a justification. CI greps the repo for
// getServiceClient()/service-role usage and fails the build on any call
// site not represented by an entry below.
//
// Add an entry BEFORE adding a new call site, not after.

export interface ServiceRoleUse {
  path: string;
  justification: string;
}

export const SERVICE_ROLE_MANIFEST: ServiceRoleUse[] = [
  {
    path: 'apps/worker/src',
    justification:
      'Background jobs act across orgs (alert fan-out, reconciliation, retention purges) and have no single request session to scope to.',
  },
  {
    path: 'scripts/',
    justification:
      'One-off admin scripts (bootstrap-superadmin, seed data) run outside any request context; each is env-flagged and defaults to local (Doc 17).',
  },
  {
    path: 'packages/modules/identity-auth/src/service.ts',
    justification:
      'resolve-or-create identity, session issuance, and refresh all run before a validated session/user_id exists to scope RLS to (Doc 05 §3/§6 chicken-and-egg). Everything with an existing session (listSessions, revokeSession, consents, linking) uses withRequestContext instead.',
  },
  {
    path: 'packages/modules/tenancy-rbac/src/service.ts',
    justification:
      'resolveOrgBySlug reads a non-member org for the join-by-slug flow (Doc 02 §9), before any membership exists to scope RLS to. acceptInvitation and the approval half of decideJoinRequest write ANOTHER user\'s membership row (the invitee/requester, not the caller) — a cross-actor write with no self-insert RLS path (migration 0004). Everything else (createOrganization, branches, invitations create/list/revoke, join_requests create/list/decide-status) uses withRequestContext.',
  },
];
