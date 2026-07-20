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
      'resolveOrgBySlug reads a non-member org for the join-by-slug flow (Doc 02 §9), before any membership exists to scope RLS to. acceptInvitation and the approval half of decideJoinRequest write ANOTHER user\'s membership row (the invitee/requester, not the caller), plus that membership\'s initial role grant (invitation.role_keys / join_request.requested_role, Doc 04 §8) — both cross-actor writes with no self-insert RLS path (migrations 0004/0006). Everything else (createOrganization incl. its own bootstrap role grant, branches, invitations create/list/revoke, join_requests create/list/decide-status, members list, grantRole/revokeRole) uses withRequestContext.',
  },
  {
    path: 'packages/modules/platform-admin/src/service.ts',
    justification:
      'Org verification/list/detail/suspend, platform_role_assignments grant/revoke, and support_access_grants request/revoke are all cross-actor (platform staff acting on someone else\'s org/role/grant) with no self-insert RLS path — migrations 0006/0007 grant `authenticated` only SELECT on platform_role_assignments and support_access_grants, and organizations has no platform-wide SELECT policy at all. Every one of these functions calls assertPlatformPerm() (a real withRequestContext query against has_platform_perm(), the same function RLS itself uses elsewhere) BEFORE opening the service-role client — that call is the only authorization gate for this file\'s service-role usage, not RLS. Feature flags / org feature flags / announcements have real RLS write policies (migration 0007) instead and use withRequestContext throughout — no service-role there.',
  },
  {
    path: 'packages/modules/scheduling/src/service.ts',
    justification:
      'materializeSessions() is the Doc 07 §7 rolling 30-day-window job — it runs across every active batch in every org on a schedule (apps/worker), not inside one caller\'s request context, so there is no session to scope withRequestContext to. Every other export in this file (programs/batches/coach assignments/roster/holidays/class-session CRUD) uses withRequestContext and is RLS-gated, per migration 0009.',
  },
  {
    path: 'packages/modules/attendance/src/service.ts',
    justification:
      'evaluateAbsences() (grace-period expiry job, Doc 14 §8) and purgeWithdrawnFaceEmbeddings() (consent-withdrawal deletion job, 24h SLA) both run across every org on a schedule (apps/worker), not inside one caller\'s request context. Every other export (face enrollment, matchFace/checkInByFace, recordAttendance/overrideAttendance, review queue resolution, staff self-attendance) uses withRequestContext and is RLS-gated, per migration 0010.',
  },
  {
    path: 'packages/modules/finance/src/service.ts',
    justification:
      'assessFine() consumes attendance.absence_confirmed queue events (apps/worker) — no caller session exists to scope RLS to when the worker processes a queued event, same category as every other module\'s background jobs. Every other export (fee policies, charges, payments, refunds, ledger reads, payouts) uses withRequestContext and is RLS-gated, per migration 0011; routine ledger writes go through post_ledger_entries()/get_or_create_ledger_account(), SECURITY DEFINER SQL functions callable from within withRequestContext, not service-role escalation.',
  },
  {
    path: 'packages/modules/notifications/src/service.ts',
    justification:
      'dispatchDelivery() (runs from apps/worker for both the manual-send path and notifyAbsenceConfirmed) and notifyAbsenceConfirmed() itself (consumes attendance.absence_confirmed queue events, same category as finance.assessFine()) both run with no caller session to scope RLS to. dispatchDelivery() also needs to read auth_methods/push_subscriptions across arbitrary recipients to resolve contact info, which no single recipient\'s own RLS would allow anyway. sendManualNotification() additionally opens a service-role client just to read the RECIPIENT\'s notification_preferences row before inserting a delivery: notification_preferences RLS (migration 0012) is strictly self-only, so the staff caller\'s own withRequestContext session can never see another user\'s preference row — without this, the muting floor (US-4 AC3) would silently never engage (found and fixed during this phase\'s smoke test: a muted recipient still received a delivery, because the SELECT under the caller\'s own RLS returned zero rows every time). The delivery-row INSERT itself still runs under withRequestContext and stays RLS-gated on notify.send.manual — only the preference lookup is service-role. Every other export (templates, preferences self-CRUD, push subscriptions, listDeliveries) uses withRequestContext and is RLS-gated.',
  },
];
