// tenancy-rbac module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: organizations, branches, memberships, invitations, join_requests
// (Phase 3 — Multi-Tenancy). roles/permissions/membership_roles/
// platform_role_assignments/coach_assignments/support_access_grants are
// Phase 4 (RBAC) and don't exist yet — see migration 0004's header comment
// for how the interim "org-wide member" gate stands in for has_perm().

import { randomBytes, createHash } from 'node:crypto';
import { db } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';

export const ORG_TYPES = [
  'independent_coach',
  'academy',
  'school',
  'music',
  'dance',
  'yoga',
  'tuition',
  'corporate',
  'other',
] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const REQUESTED_ROLES = ['student', 'coach', 'assistant_coach'] as const;

export class SlugTakenError extends Error {
  constructor() {
    super('[tenancy-rbac] That organization URL is already taken.');
  }
}

export class InvitationInvalidError extends Error {
  constructor(reason = 'This invitation is invalid, expired, or already used.') {
    super(`[tenancy-rbac] ${reason}`);
  }
}

export class JoinRequestInvalidError extends Error {
  constructor(reason = 'This join request cannot be decided.') {
    super(`[tenancy-rbac] ${reason}`);
  }
}

// A plain UPDATE ... WHERE whose target row is filtered out by an RLS
// USING clause affects zero rows *without raising an error* (unlike a
// WITH CHECK violation, or an INSERT/ON CONFLICT DO UPDATE on an
// already-identified row — both of those genuinely throw 42501). Any
// service function built on a bare UPDATE must check rowCount itself and
// throw this, or a caller with no permission at all would see a silent
// no-op reported back as success.
export class NotAuthorizedError extends Error {
  constructor(action = 'perform this action') {
    super(`[tenancy-rbac] You do not have permission to ${action}.`);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
}

// Same shape as identity-auth/tokens.ts (opaque random + sha256 hash at
// rest) but kept module-local — a public service surface is not the place
// to import another module's internal helpers (Doc 14 §2 rule 2).
function newOpaqueToken(): string {
  return randomBytes(24).toString('base64url');
}
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Organization bootstrap (Doc 02 §9) ──────────────────────────
// Runs as the creating user under withRequestContext, not the service-role
// client — migration 0004's insert policies are ordered specifically to
// make this work (org insert → org-wide active membership insert → Main
// branch insert, each unlocking the next). One transaction, atomic.

export interface CreateOrganizationInput {
  orgType: OrgType;
  name: string;
  slug: string;
}

export interface CreateOrganizationResult {
  organizationId: string;
  branchId: string;
}

export async function createOrganization(
  session: SessionContext,
  input: CreateOrganizationInput
): Promise<CreateOrganizationResult> {
  try {
    return await db.withRequestContext(session, async (client) => {
      const org = await client.query<{ id: string }>(
        `insert into organizations (org_type, name, slug, created_by) values ($1, $2, $3, $4) returning id`,
        [input.orgType, input.name, input.slug, session.userId]
      );
      const organizationId = org.rows[0].id;
      await client.query(
        `insert into memberships (user_id, organization_id, branch_id, status, joined_at)
         values ($1, $2, null, 'active', now())`,
        [session.userId, organizationId]
      );
      const branch = await client.query<{ id: string }>(
        `insert into branches (organization_id, name) values ($1, 'Main') returning id`,
        [organizationId]
      );
      return { organizationId, branchId: branch.rows[0].id };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new SlugTakenError();
    throw err;
  }
}

// ── Workspace switcher data (Doc 02 §5) ─────────────────────────

export interface MembershipSummary {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  orgType: OrgType;
  orgStatus: string;
  branchId: string | null;
  status: string;
}

export async function listMyMemberships(session: SessionContext): Promise<MembershipSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      organization_id: string;
      name: string;
      slug: string;
      org_type: OrgType;
      org_status: string;
      branch_id: string | null;
      status: string;
    }>(
      `select m.organization_id, o.name, o.slug, o.org_type, o.status as org_status, m.branch_id, m.status
       from memberships m
       join organizations o on o.id = m.organization_id
       where m.user_id = $1
       order by m.created_at`,
      [session.userId]
    );
    return result.rows.map((row) => ({
      organizationId: row.organization_id,
      organizationName: row.name,
      organizationSlug: row.slug,
      orgType: row.org_type,
      orgStatus: row.org_status,
      branchId: row.branch_id,
      status: row.status,
    }));
  });
}

// Used by the workspace switcher (Doc 05 §7) before reissuing the access
// token with a new `org` claim — the switch itself lives in identity-auth
// (it owns `sessions`), so the caller (route handler) checks membership
// here first, then calls identity-auth.switchActiveOrg.
export async function isActiveMember(session: SessionContext, organizationId: string): Promise<boolean> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query(
      `select 1 from memberships where user_id = $1 and organization_id = $2 and status = 'active'`,
      [session.userId, organizationId]
    );
    return result.rows.length > 0;
  });
}

// ── Organization detail ──────────────────────────────────────────

export interface OrganizationDetail {
  id: string;
  orgType: OrgType;
  name: string;
  slug: string;
  status: string;
  defaultCurrency: string;
  countryCode: string;
  timezone: string;
  settings: Record<string, unknown>;
}

export async function getOrganization(session: SessionContext, organizationId: string): Promise<OrganizationDetail | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      org_type: OrgType;
      name: string;
      slug: string;
      status: string;
      default_currency: string;
      country_code: string;
      timezone: string;
      settings: Record<string, unknown>;
    }>(
      `select id, org_type, name, slug, status, default_currency, country_code, timezone, settings
       from organizations where id = $1`,
      [organizationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      orgType: row.org_type,
      name: row.name,
      slug: row.slug,
      status: row.status,
      defaultCurrency: row.default_currency,
      countryCode: row.country_code,
      timezone: row.timezone,
      settings: row.settings,
    };
  });
}

// Resolves an org by slug for the join flow (Doc 02 §9 "search org / scan
// code") — the requester is not a member yet, so organizations' member-only
// SELECT policy can't be used; this is a narrow service-role lookup limited
// to non-sensitive columns and to orgs that aren't suspended/archived
// (Doc 13 §2.3 manifest entry below).
export interface PublicOrgSummary {
  id: string;
  orgType: OrgType;
  name: string;
  slug: string;
}

export async function resolveOrgBySlug(slug: string): Promise<PublicOrgSummary | null> {
  const client = await db.getServiceClient();
  try {
    const result = await client.query<{ id: string; org_type: OrgType; name: string; slug: string }>(
      `select id, org_type, name, slug from organizations where slug = $1 and status in ('pending', 'active')`,
      [slug]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, orgType: row.org_type, name: row.name, slug: row.slug };
  } finally {
    client.release();
  }
}

// ── Branches (Doc 02 §4) ─────────────────────────────────────────

export interface BranchSummary {
  id: string;
  name: string;
  status: string;
}

export async function listBranches(session: SessionContext, organizationId: string): Promise<BranchSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ id: string; name: string; status: string }>(
      `select id, name, status from branches where organization_id = $1 order by created_at`,
      [organizationId]
    );
    return result.rows;
  });
}

export async function createBranch(session: SessionContext, organizationId: string, name: string): Promise<string> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into branches (organization_id, name) values ($1, $2) returning id`,
      [organizationId, name]
    );
    return result.rows[0].id;
  });
}

// ── Invitations (Doc 02 §9 "I have an invite") ──────────────────

const INVITATION_TTL_DAYS = 7;

export interface CreateInvitationInput {
  organizationId: string;
  branchId?: string | null;
  email?: string;
  phone?: string;
  roleKeys: string[]; // not applied to membership_roles until Phase 4 — recorded for when it lands
}

export interface CreateInvitationResult {
  invitationId: string;
  token: string; // plaintext, shown once — only the hash is persisted
}

export async function createInvitation(
  session: SessionContext,
  input: CreateInvitationInput
): Promise<CreateInvitationResult> {
  const token = newOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into invitations (organization_id, branch_id, phone, email, role_keys, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [
        input.organizationId,
        input.branchId ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.roleKeys,
        tokenHash,
        session.userId,
        expiresAt,
      ]
    );
    return { invitationId: result.rows[0].id, token };
  });
}

export interface InvitationSummary {
  id: string;
  branchId: string | null;
  email: string | null;
  phone: string | null;
  roleKeys: string[];
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export async function listInvitations(session: SessionContext, organizationId: string): Promise<InvitationSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      branch_id: string | null;
      email: string | null;
      phone: string | null;
      role_keys: string[];
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
      created_at: string;
    }>(
      `select id, branch_id, email, phone, role_keys, expires_at, accepted_at, revoked_at, created_at
       from invitations where organization_id = $1 order by created_at desc`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      branchId: row.branch_id,
      email: row.email,
      phone: row.phone,
      roleKeys: row.role_keys,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    }));
  });
}

export async function revokeInvitation(session: SessionContext, invitationId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(`update invitations set revoked_at = now() where id = $1`, [invitationId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('revoke this invitation');
  });
}

// Cross-actor write (the invitee's own membership row, but the invite was
// authored by someone else and there's no self-insert RLS path for it — see
// migration 0004's memberships policy comments) — service-role, Doc 13 §2.3.
export async function acceptInvitation(session: SessionContext, token: string): Promise<{ organizationId: string }> {
  const tokenHash = hashToken(token);
  const client = await db.getServiceClient();
  try {
    await client.query('begin');
    const inv = await client.query<{
      id: string;
      organization_id: string;
      branch_id: string | null;
      email: string | null;
      phone: string | null;
      invited_by: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    }>(
      `select id, organization_id, branch_id, email, phone, invited_by, expires_at, accepted_at, revoked_at
       from invitations where token_hash = $1 for update`,
      [tokenHash]
    );
    const row = inv.rows[0];
    if (!row || row.accepted_at || row.revoked_at || new Date(row.expires_at) < new Date()) {
      throw new InvitationInvalidError();
    }

    // Doc 07 §3 "matched to auth_methods on accept" — the invite only
    // grants membership to the person it was actually sent to.
    let matched = false;
    if (row.email) {
      const m = await client.query(
        `select 1 from auth_methods
         where user_id = $1 and provider = 'email_otp' and verified_at is not null and lower(verified_identifier) = lower($2)`,
        [session.userId, row.email]
      );
      matched = matched || m.rows.length > 0;
    }
    if (row.phone) {
      // Phone OTP is deferred (see IMPLEMENTATION_STATUS.md) — no phone
      // auth_methods will ever match yet, so phone invites can't be
      // accepted until that lands. Left in place rather than special-cased
      // so this starts working automatically once phone OTP ships.
      const m = await client.query(
        `select 1 from auth_methods
         where user_id = $1 and provider = 'phone' and verified_at is not null and provider_uid = $2`,
        [session.userId, row.phone]
      );
      matched = matched || m.rows.length > 0;
    }
    if (!matched) throw new InvitationInvalidError('This invitation was sent to a different login than the one you used.');

    await client.query(
      `insert into memberships (user_id, organization_id, branch_id, status, invited_by, joined_at)
       values ($1, $2, $3, 'active', $4, now())
       on conflict (user_id, organization_id) do update set status = 'active', branch_id = excluded.branch_id, joined_at = now()`,
      [session.userId, row.organization_id, row.branch_id, row.invited_by]
    );
    await client.query(`update invitations set accepted_at = now() where id = $1`, [row.id]);
    await client.query('commit');
    return { organizationId: row.organization_id };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

// ── Join requests (Doc 02 §9 "I'm a parent/student") ─────────────
// subject_user_id is locked to the requester themselves in v1 (migration
// 0004 RLS comment) — no on-behalf-of-a-ward requests until
// guardianship-aware RLS lands (People module, Phase 6).

export type RequestedRole = (typeof REQUESTED_ROLES)[number];

export interface CreateJoinRequestInput {
  organizationId: string;
  branchId?: string | null;
  requestedRole: RequestedRole;
}

export async function createJoinRequest(session: SessionContext, input: CreateJoinRequestInput): Promise<string> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into join_requests (organization_id, branch_id, requester_user_id, subject_user_id, requested_role)
       values ($1, $2, $3, $3, $4) returning id`,
      [input.organizationId, input.branchId ?? null, session.userId, input.requestedRole]
    );
    return result.rows[0].id;
  });
}

export interface JoinRequestSummary {
  id: string;
  branchId: string | null;
  requesterUserId: string;
  requestedRole: RequestedRole;
  status: string;
  createdAt: string;
}

export async function listJoinRequests(session: SessionContext, organizationId: string): Promise<JoinRequestSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      branch_id: string | null;
      requester_user_id: string;
      requested_role: RequestedRole;
      status: string;
      created_at: string;
    }>(
      `select id, branch_id, requester_user_id, requested_role, status, created_at
       from join_requests where organization_id = $1 order by created_at desc`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      branchId: row.branch_id,
      requesterUserId: row.requester_user_id,
      requestedRole: row.requested_role,
      status: row.status,
      createdAt: row.created_at,
    }));
  });
}

// The join_requests status UPDATE is self-service under RLS
// (join_requests_decide_org_wide_member), but granting the resulting
// membership is a cross-actor write (subject_user_id, not the approver) —
// service-role for that half only, Doc 13 §2.3.
export async function decideJoinRequest(
  session: SessionContext,
  joinRequestId: string,
  decision: 'approved' | 'rejected',
  note?: string
): Promise<void> {
  const decided = await db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      organization_id: string;
      branch_id: string | null;
      subject_user_id: string;
      status: string;
    }>(`select organization_id, branch_id, subject_user_id, status from join_requests where id = $1`, [joinRequestId]);
    const row = result.rows[0];
    if (!row || row.status !== 'pending') throw new JoinRequestInvalidError();

    const updated = await client.query(
      `update join_requests set status = $1, decided_by = $2, decided_at = now(), decision_note = $3 where id = $4`,
      [decision, session.userId, note ?? null, joinRequestId]
    );
    if (updated.rowCount === 0) throw new JoinRequestInvalidError();
    return row;
  });

  if (decision !== 'approved') return;

  const client = await db.getServiceClient();
  try {
    await client.query(
      `insert into memberships (user_id, organization_id, branch_id, status, joined_at)
       values ($1, $2, $3, 'active', now())
       on conflict (user_id, organization_id) do update set status = 'active', branch_id = excluded.branch_id, joined_at = now()`,
      [decided.subject_user_id, decided.organization_id, decided.branch_id]
    );
  } finally {
    client.release();
  }
}

// ── Org branding (Doc 02 §10 Tier 1 — in-app branding only in v1) ──

export interface OrgBranding {
  logoPath: string | null;
  colors: Record<string, unknown> | null;
  displayName: string | null;
}

export async function getBranding(session: SessionContext, organizationId: string): Promise<OrgBranding | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ logo_path: string | null; colors: Record<string, unknown> | null; display_name: string | null }>(
      `select logo_path, colors, display_name from org_branding where organization_id = $1`,
      [organizationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { logoPath: row.logo_path, colors: row.colors, displayName: row.display_name };
  });
}

export async function updateBranding(session: SessionContext, organizationId: string, patch: OrgBranding): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    await client.query(
      `insert into org_branding (organization_id, logo_path, colors, display_name, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (organization_id) do update set
         logo_path = excluded.logo_path, colors = excluded.colors, display_name = excluded.display_name, updated_at = now()`,
      [organizationId, patch.logoPath, patch.colors, patch.displayName]
    );
  });
}
