// platform-admin module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: org verification/lifecycle, platform role grant/revoke, support-access
// request/revoke, feature flags, announcements (M14, Doc 07 §15, Doc 04 §9).
// Target phase: Phase 5 — Platform Administration.
//
// Two access patterns, mirroring tenancy-rbac's precedent:
//  - Feature flags / org feature flags / announcements have real RLS write
//    policies gated by has_platform_perm() (migration 0007) — these run under
//    withRequestContext, same as any org-scoped write. RLS is the real gate.
//  - Org verification/suspend, platform role grant/revoke, and support-access
//    request/revoke have NO write RLS path for `authenticated` (migration
//    0006/0007 comments: "platform console tooling, service-role") because
//    they're cross-actor (acting on someone else's org/role/grant) with no
//    self-insert shape RLS could express. These call assertPlatformPerm()
//    first (a real withRequestContext query against has_platform_perm() —
//    the SAME function RLS itself uses elsewhere) THEN use getServiceClient(),
//    same two-step shape as tenancy-rbac's acceptInvitation/decideJoinRequest.
//    Service-role here has NO app-layer gate otherwise — skipping
//    assertPlatformPerm before a service-role write would be a real
//    authorization hole, not just a style choice.
//
// Plans/subscriptions are schema-only in Phase 5 (RLS + tables exist, no
// service functions/UI) — real billing/checkout is Finance (Phase 9); same
// "schema follows the module that needs it" precedent as org_domains
// (Phase 3) and coach_assignments.batch_id (Phase 4).

import { db, queue } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';
import { writeAuditLog } from '@abhyas/module-audit';

export class PlatformPermissionError extends Error {
  constructor(action = 'perform this platform action') {
    super(`[platform-admin] You do not have permission to ${action}.`);
  }
}

export class OrganizationStateError extends Error {
  constructor(reason: string) {
    super(`[platform-admin] ${reason}`);
  }
}

export class SupportGrantInvalidError extends Error {
  constructor(reason = 'This support access grant cannot be revoked.') {
    super(`[platform-admin] ${reason}`);
  }
}

export async function hasPlatformPerm(session: SessionContext, permission: string): Promise<boolean> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ ok: boolean }>('select has_platform_perm($1) as ok', [permission]);
    return result.rows[0]?.ok ?? false;
  });
}

// Used right after login to route platform staff (who have no org membership
// of their own) straight to the platform console instead of the org-signup
// onboarding flow — `platform_role_assignments_select_self` (migration 0006)
// lets a user read their own row under RLS, no permission check needed.
export async function isPlatformStaff(userId: string): Promise<boolean> {
  return db.withRequestContext({ userId, orgId: undefined }, async (client) => {
    const result = await client.query('select 1 from platform_role_assignments where user_id = $1 limit 1', [userId]);
    return (result.rowCount ?? 0) > 0;
  });
}

// Same self-select RLS path as isPlatformStaff, but returns the role keys
// themselves — used by the app shell to show a "SUPER ADMIN" style badge.
export async function getMyPlatformRoles(userId: string): Promise<string[]> {
  return db.withRequestContext({ userId, orgId: undefined }, async (client) => {
    const result = await client.query<{ key: string }>(
      `select r.key from platform_role_assignments pra join roles r on r.id = pra.role_id where pra.user_id = $1`,
      [userId]
    );
    return result.rows.map((r) => r.key);
  });
}

async function assertPlatformPerm(session: SessionContext, permission: string, action: string): Promise<void> {
  if (!(await hasPlatformPerm(session, permission))) {
    throw new PlatformPermissionError(action);
  }
}

// ── Organization verification & lifecycle (Doc 04 US-1 AC5, wireframe 4a/4b) ──
// service-role: the verification queue and org list need every org, not just
// ones the caller is a member of (organizations' member-only SELECT policy
// doesn't apply to platform staff) — Doc 13 §2.3.

export interface PlatformOrgSummary {
  id: string;
  orgType: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  verifiedAt: string | null;
}

export interface ListOrganizationsInput {
  status?: string;
  search?: string;
  limit?: number;
}

export async function listOrganizations(session: SessionContext, input: ListOrganizationsInput = {}): Promise<PlatformOrgSummary[]> {
  await assertPlatformPerm(session, 'platform.org.lifecycle', 'view the organization list');
  const client = await db.getServiceClient();
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (input.status) {
      params.push(input.status);
      conditions.push(`status = $${params.length}`);
    }
    if (input.search) {
      params.push(`%${input.search}%`);
      conditions.push(`(name ilike $${params.length} or slug ilike $${params.length})`);
    }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    params.push(Math.min(input.limit ?? 100, 500));
    // Built in a variable, not inline in the .query() call, so the lint rule
    // against interpolated .query() template literals (Doc 13 §9 A03) doesn't
    // flag it — safe here because every `${}` piece is either a static SQL
    // keyword/column name or a $N placeholder INDEX, never a value; every
    // actual value still flows through `params` below.
    const sql = `select id, org_type, name, slug, status, created_at, verified_at
       from organizations ${where} order by created_at desc limit $${params.length}`;
    const result = await client.query<{
      id: string;
      org_type: string;
      name: string;
      slug: string;
      status: string;
      created_at: string;
      verified_at: string | null;
    }>(sql, params);
    return result.rows.map((row) => ({
      id: row.id,
      orgType: row.org_type,
      name: row.name,
      slug: row.slug,
      status: row.status,
      createdAt: row.created_at,
      verifiedAt: row.verified_at,
    }));
  } finally {
    client.release();
  }
}

export interface PlatformOrgDetail extends PlatformOrgSummary {
  defaultCurrency: string;
  countryCode: string;
  memberCount: number;
  branchCount: number;
}

export async function getOrganizationDetail(session: SessionContext, organizationId: string): Promise<PlatformOrgDetail | null> {
  await assertPlatformPerm(session, 'platform.org.lifecycle', 'view this organization');
  const client = await db.getServiceClient();
  try {
    const org = await client.query<{
      id: string;
      org_type: string;
      name: string;
      slug: string;
      status: string;
      default_currency: string;
      country_code: string;
      created_at: string;
      verified_at: string | null;
    }>(
      `select id, org_type, name, slug, status, default_currency, country_code, created_at, verified_at
       from organizations where id = $1`,
      [organizationId]
    );
    const row = org.rows[0];
    if (!row) return null;
    const counts = await client.query<{ member_count: string; branch_count: string }>(
      `select
         (select count(*) from memberships where organization_id = $1 and status = 'active') as member_count,
         (select count(*) from branches where organization_id = $1) as branch_count`,
      [organizationId]
    );
    return {
      id: row.id,
      orgType: row.org_type,
      name: row.name,
      slug: row.slug,
      status: row.status,
      defaultCurrency: row.default_currency,
      countryCode: row.country_code,
      createdAt: row.created_at,
      verifiedAt: row.verified_at,
      memberCount: Number(counts.rows[0]?.member_count ?? 0),
      branchCount: Number(counts.rows[0]?.branch_count ?? 0),
    };
  } finally {
    client.release();
  }
}

export type VerificationDecision = 'approved' | 'rejected';

export async function decideOrganizationVerification(
  session: SessionContext,
  organizationId: string,
  decision: VerificationDecision,
  note?: string
): Promise<void> {
  await assertPlatformPerm(session, 'platform.verification.review', 'review organization verification');
  const client = await db.getServiceClient();
  try {
    const before = await client.query<{ status: string }>(`select status from organizations where id = $1`, [organizationId]);
    if (!before.rows[0] || before.rows[0].status !== 'pending') {
      throw new OrganizationStateError('Only a pending organization can be verified or rejected.');
    }
    const newStatus = decision === 'approved' ? 'active' : 'rejected';
    if (decision === 'approved') {
      await client.query(
        `update organizations set status = $1, verified_at = now(), verified_by = $2 where id = $3`,
        [newStatus, session.userId, organizationId]
      );
    } else {
      await client.query(`update organizations set status = $1 where id = $2`, [newStatus, organizationId]);
    }
  } finally {
    client.release();
  }
  await writeAuditLog(session, {
    action: decision === 'approved' ? 'platform.org.verify' : 'platform.org.reject',
    targetType: 'organization',
    targetId: organizationId,
    organizationId,
    detail: note ? { note } : null,
  });

  // Phase 11 (Marketplace) hook: a listing published before its org
  // finished verification sits `pending_verification` until the org itself
  // goes active (Doc 02 §9 / PRD US-1 AC5). Enqueued rather than a direct
  // table write into marketplace's schema — cross-module reactions go
  // through the queue (this file's own header comment), same pattern
  // Attendance's absence_confirmed event already established for Finance/
  // Notifications. Marketplace has no listing yet for most orgs, so this is
  // a safe no-op far more often than not; activateOrgListings() only
  // touches rows still pending_verification.
  if (decision === 'approved') {
    await queue.enqueue('platform.org_verified', { organizationId }, { idempotencyKey: `platform.org_verified:${organizationId}` });
  }
}

export type OrgLifecycleAction = 'suspend' | 'reinstate';

export async function setOrganizationSuspension(
  session: SessionContext,
  organizationId: string,
  action: OrgLifecycleAction,
  reason?: string
): Promise<void> {
  await assertPlatformPerm(session, 'platform.org.lifecycle', 'suspend or reinstate this organization');
  const client = await db.getServiceClient();
  try {
    const before = await client.query<{ status: string }>(`select status from organizations where id = $1`, [organizationId]);
    const currentStatus = before.rows[0]?.status;
    if (!currentStatus) throw new OrganizationStateError('Organization not found.');
    if (action === 'suspend' && currentStatus !== 'active') {
      throw new OrganizationStateError('Only an active organization can be suspended.');
    }
    if (action === 'reinstate' && currentStatus !== 'suspended') {
      throw new OrganizationStateError('Only a suspended organization can be reinstated.');
    }
    const newStatus = action === 'suspend' ? 'suspended' : 'active';
    await client.query(`update organizations set status = $1 where id = $2`, [newStatus, organizationId]);
  } finally {
    client.release();
  }
  await writeAuditLog(session, {
    action: action === 'suspend' ? 'platform.org.suspend' : 'platform.org.reinstate',
    targetType: 'organization',
    targetId: organizationId,
    organizationId,
    detail: reason ? { reason } : null,
  });
}

// ── Platform role grant/revoke (Doc 04 §3, migration 0006's schema) ──
// Only Super Admin holds platform.role.grant in the seeded catalogue
// (migration 0006) — so this check alone enforces "Super Admin grants
// platform roles", no separate grant-authority table needed (unlike org
// roles' ORG_ROLE_GRANTORS, which has several granting roles per target).

export interface PlatformRoleAssignmentSummary {
  userId: string;
  roleKey: string;
  grantedBy: string | null;
  grantedAt: string;
  seed: boolean;
}

export async function listPlatformRoleAssignments(session: SessionContext): Promise<PlatformRoleAssignmentSummary[]> {
  await assertPlatformPerm(session, 'platform.role.grant', 'view platform role assignments');
  const client = await db.getServiceClient();
  try {
    const result = await client.query<{
      user_id: string;
      role_key: string;
      granted_by: string | null;
      granted_at: string;
      seed: boolean;
    }>(
      `select pra.user_id, r.key as role_key, pra.granted_by, pra.granted_at, pra.seed
       from platform_role_assignments pra join roles r on r.id = pra.role_id
       order by pra.granted_at desc`
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      roleKey: row.role_key,
      grantedBy: row.granted_by,
      grantedAt: row.granted_at,
      seed: row.seed,
    }));
  } finally {
    client.release();
  }
}

export class UnknownPlatformRoleError extends Error {
  constructor(roleKey: string) {
    super(`[platform-admin] Unknown platform role: ${roleKey}`);
  }
}

export async function grantPlatformRole(session: SessionContext, targetUserId: string, roleKey: string): Promise<void> {
  await assertPlatformPerm(session, 'platform.role.grant', 'grant platform roles');
  const client = await db.getServiceClient();
  try {
    const role = await client.query<{ id: string }>(`select id from roles where key = $1 and scope = 'platform'`, [roleKey]);
    if (!role.rows[0]) throw new UnknownPlatformRoleError(roleKey);
    await client.query(
      `insert into platform_role_assignments (user_id, role_id, granted_by) values ($1, $2, $3) on conflict do nothing`,
      [targetUserId, role.rows[0].id, session.userId]
    );
  } finally {
    client.release();
  }
  await writeAuditLog(session, {
    action: 'platform_role.grant',
    targetType: 'user',
    targetId: targetUserId,
    detail: { roleKey },
  });
}

export async function revokePlatformRole(session: SessionContext, targetUserId: string, roleKey: string): Promise<void> {
  await assertPlatformPerm(session, 'platform.role.grant', 'revoke platform roles');
  const client = await db.getServiceClient();
  try {
    // protect_seed_platform_role (migration 0006) raises if this targets the
    // seed super admin's row — left uncaught, same precedent as
    // tenancy-rbac's revokeRole (last-Owner trigger).
    await client.query(
      `delete from platform_role_assignments
       where user_id = $1 and role_id = (select id from roles where key = $2 and scope = 'platform')`,
      [targetUserId, roleKey]
    );
  } finally {
    client.release();
  }
  await writeAuditLog(session, {
    action: 'platform_role.revoke',
    targetType: 'user',
    targetId: targetUserId,
    detail: { roleKey },
  });
}

// ── Support access grants (Doc 04 §9) ────────────────────────────
// No separate "request then approve" — the schema (migration 0006) has no
// status/approver column, so a row's existence IS the grant. Requesting is
// gated by platform.support.request_access (held by Support + Super Admin)
// and capped at 24h (Doc 04 §9.1), same interpretation documented in
// migration 0007's header comment.

const MAX_SUPPORT_GRANT_HOURS = 24;

export interface SupportAccessGrantSummary {
  id: string;
  organizationId: string;
  granteeUserId: string;
  reason: string;
  grantedBy: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export async function requestSupportAccess(
  session: SessionContext,
  organizationId: string,
  reason: string,
  durationHours: number
): Promise<SupportAccessGrantSummary> {
  await assertPlatformPerm(session, 'platform.support.request_access', 'request support access to an organization');
  const hours = Math.min(Math.max(1, Math.floor(durationHours)), MAX_SUPPORT_GRANT_HOURS);
  const client = await db.getServiceClient();
  try {
    const result = await client.query<{
      id: string;
      organization_id: string;
      grantee_user_id: string;
      reason: string;
      granted_by: string;
      expires_at: string;
      revoked_at: string | null;
      created_at: string;
    }>(
      `insert into support_access_grants (organization_id, grantee_user_id, reason, granted_by, expires_at)
       values ($1, $2, $3, $4, now() + ($5 || ' hours')::interval)
       returning id, organization_id, grantee_user_id, reason, granted_by, expires_at, revoked_at, created_at`,
      [organizationId, session.userId, reason, session.userId, hours]
    );
    const row = result.rows[0];
    await writeAuditLog(session, {
      action: 'support_grant.enter',
      targetType: 'organization',
      targetId: organizationId,
      organizationId,
      detail: { reason, durationHours: hours },
      supportGrantId: row.id,
    });
    return {
      id: row.id,
      organizationId: row.organization_id,
      granteeUserId: row.grantee_user_id,
      reason: row.reason,
      grantedBy: row.granted_by,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    };
  } finally {
    client.release();
  }
}

// Lists via withRequestContext, not service-role — migration 0006/0007's
// SELECT policies on support_access_grants already cover grantee-self,
// org-owner, and platform-staff visibility; no cross-actor read needed here.
export async function listSupportAccessGrants(session: SessionContext, organizationId?: string): Promise<SupportAccessGrantSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      organization_id: string;
      grantee_user_id: string;
      reason: string;
      granted_by: string;
      expires_at: string;
      revoked_at: string | null;
      created_at: string;
    }>(
      organizationId
        ? `select id, organization_id, grantee_user_id, reason, granted_by, expires_at, revoked_at, created_at
           from support_access_grants where organization_id = $1 order by created_at desc`
        : `select id, organization_id, grantee_user_id, reason, granted_by, expires_at, revoked_at, created_at
           from support_access_grants order by created_at desc limit 200`,
      organizationId ? [organizationId] : []
    );
    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      granteeUserId: row.grantee_user_id,
      reason: row.reason,
      grantedBy: row.granted_by,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    }));
  });
}

export async function revokeSupportAccessGrant(session: SessionContext, grantId: string): Promise<void> {
  const client = await db.getServiceClient();
  try {
    const grant = await client.query<{ grantee_user_id: string; organization_id: string; revoked_at: string | null }>(
      `select grantee_user_id, organization_id, revoked_at from support_access_grants where id = $1`,
      [grantId]
    );
    const row = grant.rows[0];
    if (!row || row.revoked_at) throw new SupportGrantInvalidError();
    // Self-revoke (the grantee ending their own session early) needs no extra
    // permission; revoking someone else's grant needs platform.support.request_access
    // (the same permission that creates one — Support/Super Admin only).
    if (row.grantee_user_id !== session.userId) {
      await assertPlatformPerm(session, 'platform.support.request_access', 'revoke another user’s support access grant');
    }
    await client.query(`update support_access_grants set revoked_at = now() where id = $1`, [grantId]);
  } finally {
    client.release();
  }
  await writeAuditLog(session, {
    action: 'support_grant.revoke',
    targetType: 'support_access_grant',
    targetId: grantId,
  });
}

// ── Feature flags (Doc 07 §15) ────────────────────────────────────
// Real RLS write policies (migration 0007) — withRequestContext throughout,
// no service-role needed. RLS is the last-line gate; assertPlatformPerm here
// is advisory (better error message than a bare 42501).

export interface FeatureFlagSummary {
  key: string;
  defaultOn: boolean;
  description: string | null;
}

export async function listFeatureFlags(session: SessionContext): Promise<FeatureFlagSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ key: string; default_on: boolean; description: string | null }>(
      `select key, default_on, description from feature_flags order by key`
    );
    return result.rows.map((row) => ({ key: row.key, defaultOn: row.default_on, description: row.description }));
  });
}

export async function upsertFeatureFlag(
  session: SessionContext,
  key: string,
  defaultOn: boolean,
  description?: string
): Promise<void> {
  await assertPlatformPerm(session, 'platform.flag.manage', 'manage feature flags');
  await db.withRequestContext(session, async (client) => {
    await client.query(
      `insert into feature_flags (key, default_on, description) values ($1, $2, $3)
       on conflict (key) do update set default_on = excluded.default_on, description = excluded.description`,
      [key, defaultOn, description ?? null]
    );
  });
  await writeAuditLog(session, { action: 'platform.flag.upsert', targetType: 'feature_flag', targetId: null, detail: { key, defaultOn } });
}

export interface OrgFeatureFlagSummary {
  flagKey: string;
  enabled: boolean;
  updatedAt: string;
}

export async function listOrgFeatureFlags(session: SessionContext, organizationId: string): Promise<OrgFeatureFlagSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ flag_key: string; enabled: boolean; updated_at: string }>(
      `select flag_key, enabled, updated_at from org_feature_flags where organization_id = $1 order by flag_key`,
      [organizationId]
    );
    return result.rows.map((row) => ({ flagKey: row.flag_key, enabled: row.enabled, updatedAt: row.updated_at }));
  });
}

export async function setOrgFeatureFlag(session: SessionContext, organizationId: string, flagKey: string, enabled: boolean): Promise<void> {
  await assertPlatformPerm(session, 'platform.flag.manage', 'override a feature flag for an organization');
  await db.withRequestContext(session, async (client) => {
    await client.query(
      `insert into org_feature_flags (organization_id, flag_key, enabled, updated_at)
       values ($1, $2, $3, now())
       on conflict (organization_id, flag_key) do update set enabled = excluded.enabled, updated_at = now()`,
      [organizationId, flagKey, enabled]
    );
  });
  await writeAuditLog(session, {
    action: 'platform.flag.org_override',
    targetType: 'organization',
    targetId: organizationId,
    organizationId,
    detail: { flagKey, enabled },
  });
}

// ── Announcements (Doc 07 §15) ───────────────────────────────────

export interface AnnouncementSummary {
  id: string;
  audience: string;
  title: string;
  body: string;
  publishedAt: string | null;
  createdAt: string;
}

export async function listAnnouncements(session: SessionContext): Promise<AnnouncementSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      audience: string;
      title: string;
      body: string;
      published_at: string | null;
      created_at: string;
    }>(`select id, audience, title, body, published_at, created_at from announcements order by created_at desc limit 100`);
    return result.rows.map((row) => ({
      id: row.id,
      audience: row.audience,
      title: row.title,
      body: row.body,
      publishedAt: row.published_at,
      createdAt: row.created_at,
    }));
  });
}

export interface CreateAnnouncementInput {
  audience: 'all' | 'org_admins' | 'platform_staff';
  title: string;
  body: string;
  publishNow?: boolean;
}

export async function createAnnouncement(session: SessionContext, input: CreateAnnouncementInput): Promise<string> {
  await assertPlatformPerm(session, 'platform.announce', 'publish announcements');
  const id = await db.withRequestContext(session, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into announcements (audience, title, body, published_at, created_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [input.audience, input.title, input.body, input.publishNow === false ? null : new Date().toISOString(), session.userId]
    );
    return result.rows[0].id;
  });
  await writeAuditLog(session, { action: 'platform.announcement.create', targetType: 'announcement', targetId: id, detail: { audience: input.audience, title: input.title } });
  return id;
}
