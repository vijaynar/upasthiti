// tenancy-rbac module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: organizations, branches, memberships, invitations, join_requests
// (Phase 3 — Multi-Tenancy) + roles, permissions, membership_roles,
// platform_role_assignments, coach_assignments, support_access_grants
// (Phase 4 — RBAC, migration 0006). hasPerm()/hasPermBranch() below are the
// advisory app-layer counterpart of the has_perm()/has_perm_branch() SQL
// functions RLS itself uses — same function, same answer, no drift.

import { randomBytes, createHash } from 'node:crypto';
import { db, storage } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';
import { writeAuditLog } from '@abhyas/module-audit';

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

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23503';
}

export class OrganizationLifecycleError extends Error {
  constructor(reason: string) {
    super(`[tenancy-rbac] ${reason}`);
  }
}

// Minimal structural shape of a pg client's query() — enough for the
// helpers below to be shared between withRequestContext's callback and
// getServiceClient's client without importing `pg` (Doc 14 §7 — provider
// SDKs only in packages/platform).
interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

// ── RBAC (Doc 04 §10, Phase 4) ────────────────────────────────────
// Advisory app-layer permission checks — RLS is the real gate. These call
// the exact same has_perm()/has_perm_branch() Postgres functions (migration
// 0006) that every RLS policy uses, so "can I?" and "will RLS let me?" can
// never disagree.

export async function hasPerm(session: SessionContext, permission: string): Promise<boolean> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ ok: boolean }>('select has_perm($1) as ok', [permission]);
    return result.rows[0]?.ok ?? false;
  });
}

export async function hasPermBranch(session: SessionContext, permission: string, branchId: string | null): Promise<boolean> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ ok: boolean }>('select has_perm_branch($1, $2) as ok', [permission, branchId]);
    return result.rows[0]?.ok ?? false;
  });
}

// Doc 04 §8 grant-authority table — who may grant/revoke a given org role.
// A coarser check than the full anti-lockout rule set (no custom-role rank
// system exists), applied on top of the membership_roles_insert_granter /
// _delete_granter RLS policies (which only see "does this permission bit
// exist", not "is target role X within granter's authority"). 'student' is
// intentionally absent — that role is only ever granted via invitation
// acceptance or join-request approval (both service-role paths below),
// never through this direct-grant surface.
const ORG_ROLE_GRANTORS: Record<string, string[]> = {
  owner: ['owner'],
  org_admin: ['owner'],
  accountant: ['owner'],
  branch_admin: ['owner', 'org_admin'],
  coach: ['owner', 'org_admin', 'branch_admin'],
  assistant_coach: ['owner', 'org_admin', 'branch_admin'],
  front_desk: ['owner', 'org_admin', 'branch_admin'],
};

export class RoleGrantNotAllowedError extends Error {
  constructor(reason = 'You do not have authority to grant or revoke that role.') {
    super(`[tenancy-rbac] ${reason}`);
  }
}

export class UnknownRoleError extends Error {
  constructor(roleKey: string) {
    super(`[tenancy-rbac] Unknown or non-grantable role: ${roleKey}`);
  }
}

async function assertGrantAuthority(
  client: QueryClient,
  session: SessionContext,
  organizationId: string,
  targetRoleKey: string
): Promise<void> {
  const allowedGrantors = ORG_ROLE_GRANTORS[targetRoleKey];
  if (!allowedGrantors) throw new UnknownRoleError(targetRoleKey);
  const granterRoles = await client.query<{ key: string }>(
    `select r.key from membership_roles mr
     join memberships m on m.id = mr.membership_id
     join roles r on r.id = mr.role_id
     where m.user_id = $1 and m.organization_id = $2 and m.status = 'active'`,
    [session.userId, organizationId]
  );
  const granterKeys = new Set(granterRoles.rows.map((r) => r.key));
  if (!allowedGrantors.some((key) => granterKeys.has(key))) {
    throw new RoleGrantNotAllowedError();
  }
}

async function getMembershipOrgBranch(
  client: QueryClient,
  membershipId: string
): Promise<{ organizationId: string; branchId: string | null } | null> {
  const result = await client.query<{ organization_id: string; branch_id: string | null }>(
    `select organization_id, branch_id from memberships where id = $1`,
    [membershipId]
  );
  const row = result.rows[0];
  return row ? { organizationId: row.organization_id, branchId: row.branch_id } : null;
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

      // Repoint current_org() at the new org for the rest of this
      // transaction — has_perm()/has_perm_branch() (used by the Main
      // branch insert below) read session-context current_org(), which is
      // still whatever was active before this org existed otherwise
      // (transaction-scoped set_config, same mechanism withRequestContext
      // itself used at BEGIN — see migration 0004's header comment).
      await client.query(`select set_config('app.org_id', $1, true)`, [organizationId]);

      const membership = await client.query<{ id: string }>(
        `insert into memberships (user_id, organization_id, branch_id, status, joined_at)
         values ($1, $2, null, 'active', now()) returning id`,
        [session.userId, organizationId]
      );
      const membershipId = membership.rows[0].id;

      // Owner always; Coach too for a self-serve independent coach (Doc 04
      // §3 "An independent coach's org auto-assigns Owner + Coach to the
      // founder"). Granted via migration 0006's
      // membership_roles_insert_bootstrap_owner RLS policy — the only path
      // that can grant a role before any role exists on this membership.
      const bootstrapRoleKeys = input.orgType === 'independent_coach' ? ['owner', 'coach'] : ['owner'];
      for (const roleKey of bootstrapRoleKeys) {
        await client.query(
          `insert into membership_roles (membership_id, role_id, granted_by)
           select $1, id, $2 from roles where key = $3 and organization_id is null`,
          [membershipId, session.userId, roleKey]
        );
      }

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
  activeRoleKey: string | null;
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
      active_role_key: string | null;
    }>(
      `select m.organization_id, o.name, o.slug, o.org_type, o.status as org_status, m.branch_id, m.status,
              ar.key as active_role_key
       from memberships m
       join organizations o on o.id = m.organization_id
       left join roles ar on ar.id = m.active_role_id
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
      activeRoleKey: row.active_role_key,
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

async function isOrgOwner(client: QueryClient, userId: string, organizationId: string): Promise<boolean> {
  const result = await client.query(
    `select 1 from memberships m
     join membership_roles mr on mr.membership_id = m.id
     join roles r on r.id = mr.role_id
     where m.user_id = $1 and m.organization_id = $2 and m.status = 'active'
       and r.key = 'owner' and r.organization_id is null`,
    [userId, organizationId]
  );
  return result.rows.length > 0;
}

// Cleanup for an abandoned org signup (Doc 02 §9 onboarding creates the org
// + owner membership immediately on step 1, before the profile wizard is
// ever finished — see onboarding page comments) or for a rejected
// verification. Deliberately scoped to 'pending'/'rejected' only: an
// active/suspended org has real member and business data an owner should
// never lose to a single self-service click. `organizations` has no DELETE
// grant to `authenticated` (migration 0005) — same cross-actor-write shape
// as acceptInvitation/decideJoinRequest above, service-role after an
// app-layer ownership check.
export async function deleteOrganization(session: SessionContext, organizationId: string): Promise<void> {
  const owner = await db.withRequestContext(session, (client) => isOrgOwner(client, session.userId, organizationId));
  if (!owner) throw new NotAuthorizedError('delete this workspace');

  const client = await db.getServiceClient();
  let orgName: string | null = null;
  let documentPaths: string[] = [];
  try {
    await client.query('begin');
    const before = await client.query<{ status: string; name: string }>(`select status, name from organizations where id = $1`, [organizationId]);
    const status = before.rows[0]?.status;
    if (!status) throw new OrganizationLifecycleError('Workspace not found.');
    if (status !== 'pending' && status !== 'rejected') {
      throw new OrganizationLifecycleError('Only a pending or rejected workspace can be deleted. Leave an active workspace instead.');
    }
    orgName = before.rows[0].name;

    // Captured before the memberships cascade wipes staff_documents rows —
    // each upload path is timestamped/unique to that document (see
    // /api/v1/me/staff/documents/upload-url), so removing them can't affect
    // another org's documents even though the path lives under the
    // uploading user's own identity prefix, not an org-scoped one.
    const docs = await client.query<{ storage_path: string }>(`select storage_path from staff_documents where organization_id = $1`, [organizationId]);
    documentPaths = docs.rows.map((r) => r.storage_path);

    // Dependency order for tables with no ON DELETE CASCADE from
    // organizations; membership_roles cascades automatically once its
    // parent memberships row is gone.
    await client.query(`delete from join_requests where organization_id = $1`, [organizationId]);
    await client.query(`delete from invitations where organization_id = $1`, [organizationId]);
    await client.query(`delete from org_branding where organization_id = $1`, [organizationId]);
    await client.query(`delete from org_domains where organization_id = $1`, [organizationId]);
    await client.query(`delete from listings where organization_id = $1`, [organizationId]);
    // membership_roles_protect_last_owner (migration 0004) is BEFORE DELETE
    // on membership_roles and still fires on the cascade delete triggered
    // below — from its point of view we're removing the org's only owner
    // while the org row still exists, so it raises. That protection is
    // correct for revokeRole/leave; it's a false positive here, where the
    // whole org (including the owner) is intentionally going away. Disabled
    // only for this statement, transactionally scoped — reverts on
    // commit/rollback either way.
    await client.query(`alter table membership_roles disable trigger membership_roles_protect_last_owner`);
    await client.query(`delete from memberships where organization_id = $1`, [organizationId]);
    await client.query(`alter table membership_roles enable trigger membership_roles_protect_last_owner`);
    await client.query(`delete from branches where organization_id = $1`, [organizationId]);
    // audit_log.organization_id is a nullable FK with no cascade — any org
    // that was ever touched by a verify/reject/reason-logged action (e.g. a
    // 'rejected' org always has its rejection entry) would otherwise block
    // this delete forever. Detach rather than erase: the historical
    // action/actor/detail/occurred_at rows all survive, just no longer
    // pointing at a row that's about to stop existing.
    await client.query(`update audit_log set organization_id = null where organization_id = $1`, [organizationId]);
    await client.query(`delete from organizations where id = $1`, [organizationId]);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    if (err instanceof OrganizationLifecycleError) throw err;
    // Any other FK still pointing at this org (enrollments, batches, charges...)
    // means real business data exists despite the 'pending'/'rejected' status —
    // refuse rather than silently deleting only part of it.
    if (isForeignKeyViolation(err)) {
      throw new OrganizationLifecycleError('This workspace has data attached to it and cannot be deleted. Contact support.');
    }
    throw err;
  } finally {
    client.release();
  }

  // Best-effort Storage cleanup — a separate HTTP system from Postgres, so
  // it can't be part of the transaction above; the DB deletion already
  // succeeded by this point, so a failure here (network blip, already-gone
  // object) becomes an orphaned file, never a reason to report the
  // workspace deletion itself as failed.
  if (documentPaths.length > 0) {
    const docsStorage = storage.makeSupabaseStorageAdapter('coach-documents');
    await Promise.allSettled(documentPaths.map((path) => docsStorage.remove(path as storage.StoragePrefix)));
  }

  // organizationId omitted (not organizationId: organizationId) — the org
  // row is gone by now and audit_log.organization_id has a real FK to
  // organizations(id) (nullable, no ON DELETE SET NULL); passing the
  // now-dangling id would 23503 this insert. name is carried in `detail`
  // instead so the audit trail stays readable after the org is gone.
  await writeAuditLog(session, {
    action: 'org.delete',
    targetType: 'organization',
    targetId: organizationId,
    detail: { name: orgName },
  });
}

// Self-service "leave" for a member of someone else's org (Doc 02 §9 — a
// coach can join several academies). memberships_leave_self (migration
// 0005) is the real gate: self-row only, status -> 'left' only; the
// assert_owner_remains_on_membership_suspend trigger (migration 0004)
// backstops the case of a non-owner accidentally being an org's last owner.
// Owners are refused up front with a clear message rather than relying on
// that trigger's bare exception.
export async function leaveOrganization(session: SessionContext, organizationId: string): Promise<void> {
  const owner = await db.withRequestContext(session, (client) => isOrgOwner(client, session.userId, organizationId));
  if (owner) {
    throw new OrganizationLifecycleError('Workspace owners cannot leave — delete the workspace or transfer ownership first.');
  }

  await db.withRequestContext(session, async (client) => {
    const result = await client.query(
      `update memberships set status = 'left' where user_id = $1 and organization_id = $2 and status = 'active'`,
      [session.userId, organizationId]
    );
    if (result.rowCount === 0) throw new NotAuthorizedError('leave this workspace');
  });

  await writeAuditLog(session, {
    action: 'org.leave',
    targetType: 'organization',
    targetId: organizationId,
    organizationId,
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
      role_keys: string[];
      invited_by: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    }>(
      `select id, organization_id, branch_id, email, phone, role_keys, invited_by, expires_at, accepted_at, revoked_at
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

    const membership = await client.query<{ id: string }>(
      `insert into memberships (user_id, organization_id, branch_id, status, invited_by, joined_at)
       values ($1, $2, $3, 'active', $4, now())
       on conflict (user_id, organization_id) do update set status = 'active', branch_id = excluded.branch_id, joined_at = now()
       returning id`,
      [session.userId, row.organization_id, row.branch_id, row.invited_by]
    );
    const membershipId = membership.rows[0].id;
    // Doc 04 §8 "Invitations carry the intended roles; roles activate only
    // when the invite is accepted" — applied here, service-role (this
    // whole block already bypasses RLS for the cross-actor membership
    // write above; membership_roles needs the same bypass since the
    // inviter, not the accepting user, is granted_by).
    for (const roleKey of row.role_keys) {
      await client.query(
        `insert into membership_roles (membership_id, role_id, granted_by)
         select $1, id, $2 from roles where key = $3 and organization_id is null and scope = 'org'
         on conflict do nothing`,
        [membershipId, row.invited_by, roleKey]
      );
    }
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
// subject_user_id can now be a ward, not just the requester themselves —
// migration 0008's join_requests_insert_self_or_ward RLS policy is the real
// gate (is_guardian_of()); this function just forwards whatever the caller
// asks for and lets RLS accept or reject it.

export type RequestedRole = (typeof REQUESTED_ROLES)[number];

export interface CreateJoinRequestInput {
  organizationId: string;
  branchId?: string | null;
  requestedRole: RequestedRole;
  subjectUserId?: string; // guardian requesting on behalf of a ward (Doc 02 §9); defaults to self
}

export async function createJoinRequest(session: SessionContext, input: CreateJoinRequestInput): Promise<string> {
  const subjectUserId = input.subjectUserId ?? session.userId;
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into join_requests (organization_id, branch_id, requester_user_id, subject_user_id, requested_role)
       values ($1, $2, $3, $4, $5) returning id`,
      [input.organizationId, input.branchId ?? null, session.userId, subjectUserId, input.requestedRole]
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

export interface JoinRequestDecisionResult {
  approved: boolean;
  organizationId: string;
  branchId: string | null;
  subjectUserId: string;
  requestedRole: RequestedRole;
}

// The join_requests status UPDATE is self-service under RLS
// (join_requests_decide_permitted), but granting the resulting membership
// (+ its requested role) is a cross-actor write (subject_user_id, not the
// approver) — service-role for that half only, Doc 13 §2.3. Returns the
// decision context (not just void) so callers — namely the join-requests
// decide route — can react to a student approval by also creating the
// People module's enrollment row (Doc 07 §6), without this module reaching
// into people's tables itself (Doc 14 §2 rule 2).
export async function decideJoinRequest(
  session: SessionContext,
  joinRequestId: string,
  decision: 'approved' | 'rejected',
  note?: string
): Promise<JoinRequestDecisionResult> {
  const decided = await db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      organization_id: string;
      branch_id: string | null;
      subject_user_id: string;
      requested_role: RequestedRole;
      status: string;
    }>(`select organization_id, branch_id, subject_user_id, requested_role, status from join_requests where id = $1`, [
      joinRequestId,
    ]);
    const row = result.rows[0];
    if (!row || row.status !== 'pending') throw new JoinRequestInvalidError();

    const updated = await client.query(
      `update join_requests set status = $1, decided_by = $2, decided_at = now(), decision_note = $3 where id = $4`,
      [decision, session.userId, note ?? null, joinRequestId]
    );
    if (updated.rowCount === 0) throw new JoinRequestInvalidError();
    return row;
  });

  const result: JoinRequestDecisionResult = {
    approved: decision === 'approved',
    organizationId: decided.organization_id,
    branchId: decided.branch_id,
    subjectUserId: decided.subject_user_id,
    requestedRole: decided.requested_role,
  };
  if (!result.approved) return result;

  const client = await db.getServiceClient();
  try {
    const membership = await client.query<{ id: string }>(
      `insert into memberships (user_id, organization_id, branch_id, status, joined_at)
       values ($1, $2, $3, 'active', now())
       on conflict (user_id, organization_id) do update set status = 'active', branch_id = excluded.branch_id, joined_at = now()
       returning id`,
      [decided.subject_user_id, decided.organization_id, decided.branch_id]
    );
    // Doc 04 §8 — approving a join request activates the role it requested.
    await client.query(
      `insert into membership_roles (membership_id, role_id, granted_by)
       select $1, id, $2 from roles where key = $3 and organization_id is null and scope = 'org'
       on conflict do nothing`,
      [membership.rows[0].id, session.userId, decided.requested_role]
    );
  } finally {
    client.release();
  }
  return result;
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

// ── Members & roles (Doc 04 §5 "Members & roles" row, Phase 4) ────
// No admin UI for this yet (same precedent as Phase 3's invitations/
// join-requests — service + routes exist, the page doesn't). Visibility
// relies on migration 0006's memberships_select_staff RLS policy
// (has_perm_branch('people.member.read', ...)).

export interface MemberSummary {
  membershipId: string;
  userId: string;
  branchId: string | null;
  status: string;
  roleKeys: string[];
}

export async function listMembers(session: SessionContext, organizationId: string): Promise<MemberSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      membership_id: string;
      user_id: string;
      branch_id: string | null;
      status: string;
      role_keys: (string | null)[];
    }>(
      `select m.id as membership_id, m.user_id, m.branch_id, m.status,
              array_remove(array_agg(r.key), null) as role_keys
       from memberships m
       left join membership_roles mr on mr.membership_id = m.id
       left join roles r on r.id = mr.role_id
       where m.organization_id = $1
       group by m.id
       order by m.created_at`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      membershipId: row.membership_id,
      userId: row.user_id,
      branchId: row.branch_id,
      status: row.status,
      roleKeys: (row.role_keys ?? []).filter((k): k is string => k !== null),
    }));
  });
}

export async function grantRole(
  session: SessionContext,
  organizationId: string,
  membershipId: string,
  roleKey: string
): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const target = await getMembershipOrgBranch(client, membershipId);
    if (!target || target.organizationId !== organizationId) {
      throw new NotAuthorizedError('grant a role in this organization');
    }
    await assertGrantAuthority(client, session, organizationId, roleKey);
    // membership_roles_insert_granter (migration 0006) is the RLS
    // last-line check — this insert still fails with 42501 if that
    // permission bit is somehow absent despite the grant-authority check
    // above passing (e.g. a stale/derived role list).
    await client.query(
      `insert into membership_roles (membership_id, role_id, granted_by)
       select $1, id, $2 from roles where key = $3 and organization_id is null and scope = 'org'
       on conflict do nothing`,
      [membershipId, session.userId, roleKey]
    );
  });
}

export async function revokeRole(
  session: SessionContext,
  organizationId: string,
  membershipId: string,
  roleKey: string
): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const target = await getMembershipOrgBranch(client, membershipId);
    if (!target || target.organizationId !== organizationId) {
      throw new NotAuthorizedError('revoke a role in this organization');
    }
    await assertGrantAuthority(client, session, organizationId, roleKey);
    // membership_roles_protect_last_owner (migration 0006) raises a
    // Postgres exception (not a distinguishable error class) if this would
    // remove an org's last Owner — left uncaught here, same as any other
    // unexpected DB error; callers get a 500 rather than a friendly
    // message until that's worth special-casing.
    await client.query(
      `delete from membership_roles
       where membership_id = $1
         and role_id = (select id from roles where key = $2 and organization_id is null)`,
      [membershipId, roleKey]
    );
  });
}

// ── Active role (migration 0022) ─────────────────────────────────
// A membership can HOLD several roles (membership_roles, unchanged) but
// only one is ACTIVE at a time — has_perm()/has_perm_branch() check only
// the active role (see migration 0022's header). Switching is a self-service
// UPDATE on the caller's own membership row, gated by
// memberships_switch_active_role_self.

export async function getMyActiveRole(session: SessionContext, organizationId: string): Promise<string | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ key: string | null }>(
      `select r.key
       from memberships m
       left join roles r on r.id = m.active_role_id
       where m.user_id = $1 and m.organization_id = $2 and m.status = 'active'`,
      [session.userId, organizationId]
    );
    return result.rows[0]?.key ?? null;
  });
}

// Permission keys of the active role only — used to show/hide nav by what
// the caller can actually do right now, not by every role they hold.
export async function getMyActivePermissions(session: SessionContext, organizationId: string): Promise<string[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ permission_key: string }>(
      `select rp.permission_key
       from memberships m
       join role_permissions rp on rp.role_id = m.active_role_id
       where m.user_id = $1 and m.organization_id = $2 and m.status = 'active'`,
      [session.userId, organizationId]
    );
    return result.rows.map((r) => r.permission_key);
  });
}

// UPDATE ... FROM only touches the row if a membership_roles match exists
// for (this membership, roleKey) — rowCount is 0 for a bad key, an org
// mismatch, or a role the caller doesn't actually hold, so a mistyped
// roleKey can never blank out active_role_id (unlike a plain subselect,
// which would silently resolve to NULL and null out the column).
export async function switchActiveRole(session: SessionContext, organizationId: string, roleKey: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(
      `update memberships m set active_role_id = mr.role_id
       from membership_roles mr
       join roles r on r.id = mr.role_id
       where m.id = mr.membership_id
         and m.user_id = $1 and m.organization_id = $2 and m.status = 'active'
         and r.key = $3 and r.organization_id is null and r.scope = 'org'`,
      [session.userId, organizationId, roleKey]
    );
    if (result.rowCount === 0) {
      throw new NotAuthorizedError('switch to a role you do not hold in this organization');
    }
  });
}
