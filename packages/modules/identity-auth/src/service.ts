// identity-auth module — public API (Doc 14 §2). Owns: users, auth_methods,
// sessions, guardianships, consents (migration 0003). Surfaces call only
// these functions, never the tables directly.
//
// Scope (2026-07-19 decision, see IMPLEMENTATION_STATUS.md): Google OAuth +
// email magic link only. Phone OTP is designed in Doc 05 but not built —
// there is no startOtp/verifyOtp path here to mirror that.

import { db, jwt as platformJwt, supabaseAuthAdapter, auth } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';

type CookieJar = auth.CookieJar;
import { formatRefreshToken, hashSecret, newOpaqueSecret, newSessionId, parseRefreshToken } from './tokens';

const REFRESH_TOKEN_TTL_DAYS = 30; // Doc 05 §6 resolved question — 30d for all org roles, web

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
  isNewUser: boolean;
}

export interface DeviceMeta {
  deviceLabel?: string;
  platform?: 'web' | 'ios' | 'android';
  ip?: string;
}

export class ReuseDetectedError extends Error {
  constructor() {
    super('[identity-auth] Refresh token reuse detected — session revoked.');
  }
}

export class InvalidSessionError extends Error {
  constructor() {
    super('[identity-auth] Session is invalid, expired, or revoked.');
  }
}

export class AuthMethodTakenError extends Error {
  constructor() {
    super('[identity-auth] This login method is already linked to a different account.');
  }
}

// ── Identity resolution (Doc 05 §3, §5) ────────────────────────
// resolve-or-create runs pre-session (no user_id to scope RLS to yet), so
// it uses the service-role client — registered in the Doc 13 §2.3 manifest.

async function resolveOrCreateIdentity(
  provider: 'google' | 'email_otp',
  providerUid: string,
  verifiedEmail?: string
): Promise<{ userId: string; isNewUser: boolean }> {
  const client = await db.getServiceClient();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ user_id: string }>(
      'select user_id from auth_methods where provider = $1 and provider_uid = $2',
      [provider, providerUid]
    );
    if (existing.rows[0]) {
      await client.query(
        'update auth_methods set last_used_at = now() where provider = $1 and provider_uid = $2',
        [provider, providerUid]
      );
      await client.query('COMMIT');
      return { userId: existing.rows[0].user_id, isNewUser: false };
    }

    const displayName = verifiedEmail ? verifiedEmail.split('@')[0] : 'New user';
    const created = await client.query<{ id: string }>(
      'insert into users (display_name) values ($1) returning id',
      [displayName]
    );
    const userId = created.rows[0].id;
    await client.query(
      `insert into auth_methods (user_id, provider, provider_uid, verified_at, last_used_at)
       values ($1, $2, $3, now(), now())`,
      [userId, provider, providerUid]
    );
    await client.query('COMMIT');
    return { userId, isNewUser: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Session issuance (Doc 05 §6) ───────────────────────────────

async function issueSession(userId: string, amr: string[], meta: DeviceMeta = {}): Promise<AuthResult> {
  const sessionId = newSessionId();
  const secret = newOpaqueSecret();
  const refreshHash = hashSecret(secret);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const client = await db.getServiceClient();
  try {
    await client.query(
      `insert into sessions (id, user_id, refresh_hash, family_id, device_label, platform, ip_created, last_seen_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, now(), $8)`,
      [sessionId, userId, refreshHash, sessionId, meta.deviceLabel ?? null, meta.platform ?? null, meta.ip ?? null, expiresAt]
    );
  } finally {
    client.release();
  }

  const accessToken = platformJwt.signAccessToken({ sub: userId, sid: sessionId, org: null, amr, mfa: false });
  return { accessToken, refreshToken: formatRefreshToken(sessionId, secret), userId, isNewUser: false };
}

export async function refreshSession(refreshToken: string): Promise<AuthResult> {
  const { sessionId, secret } = parseRefreshToken(refreshToken);
  const providedHash = hashSecret(secret);

  const client = await db.getServiceClient();
  try {
    const result = await client.query<{
      user_id: string;
      refresh_hash: string;
      active_org_id: string | null;
      revoked_at: string | null;
      expires_at: string;
      mfa_verified_at: string | null;
    }>(
      'select user_id, refresh_hash, active_org_id, revoked_at, expires_at, mfa_verified_at from sessions where id = $1',
      [sessionId]
    );
    const session = result.rows[0];
    if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) {
      throw new InvalidSessionError();
    }
    if (session.refresh_hash !== providedHash) {
      // Doc 05 §6 — a replayed (already-rotated) refresh token revokes the session outright.
      await client.query('update sessions set revoked_at = now() where id = $1', [sessionId]);
      throw new ReuseDetectedError();
    }

    const newSecret = newOpaqueSecret();
    await client.query('update sessions set refresh_hash = $1, last_seen_at = now() where id = $2', [
      hashSecret(newSecret),
      sessionId,
    ]);

    const accessToken = platformJwt.signAccessToken({
      sub: session.user_id,
      sid: sessionId,
      org: session.active_org_id,
      amr: [],
      mfa: Boolean(session.mfa_verified_at),
    });
    return {
      accessToken,
      refreshToken: formatRefreshToken(sessionId, newSecret),
      userId: session.user_id,
      isNewUser: false,
    };
  } finally {
    client.release();
  }
}

// ── Google OAuth / magic link entrypoints ──────────────────────
// A CookieJar is required (not optional): PKCE needs its code-verifier
// cookie to survive between the start request and the later callback
// request (Doc 05 §3 note in platform/auth/index.ts).

export async function startGoogleOAuth(cookies: CookieJar): Promise<{ redirectUrl: string }> {
  return supabaseAuthAdapter.startOAuth('google', cookies);
}

export async function completeGoogleOAuth(
  callbackParams: Record<string, string>,
  cookies: CookieJar,
  meta?: DeviceMeta
): Promise<AuthResult> {
  const identity = await supabaseAuthAdapter.verifyOAuthCallback('google', callbackParams, cookies);
  const { userId, isNewUser } = await resolveOrCreateIdentity('google', identity.providerUid, identity.verifiedEmail);
  const result = await issueSession(userId, ['google'], meta);
  return { ...result, isNewUser };
}

export async function startMagicLink(email: string, cookies: CookieJar): Promise<void> {
  await supabaseAuthAdapter.startMagicLink(email, cookies);
}

export async function completeMagicLink(token: string, cookies: CookieJar, meta?: DeviceMeta): Promise<AuthResult> {
  const identity = await supabaseAuthAdapter.verifyMagicLink(token, cookies);
  const { userId, isNewUser } = await resolveOrCreateIdentity(
    'email_otp',
    identity.providerUid,
    identity.verifiedEmail
  );
  const result = await issueSession(userId, ['email_otp'], meta);
  return { ...result, isNewUser };
}

// ── Profile (Doc 08 GET/PATCH /me) ──────────────────────────────

export interface Profile {
  id: string;
  displayName: string;
  dob: string | null;
  locale: string;
  timezone: string;
  avatarPath: string | null;
}

export async function getProfile(session: SessionContext): Promise<Profile | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      display_name: string;
      dob: string | null;
      locale: string;
      timezone: string;
      avatar_path: string | null;
    }>('select id, display_name, dob, locale, timezone, avatar_path from users where id = $1', [session.userId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      displayName: row.display_name,
      dob: row.dob,
      locale: row.locale,
      timezone: row.timezone,
      avatarPath: row.avatar_path,
    };
  });
}

export interface ProfilePatch {
  displayName?: string;
  dob?: string | null;
  locale?: string;
  timezone?: string;
}

export async function updateProfile(session: SessionContext, patch: ProfilePatch): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    await client.query(
      `update users set
         display_name = coalesce($2, display_name),
         dob = case when $3::boolean then $4::date else dob end,
         locale = coalesce($5, locale),
         timezone = coalesce($6, timezone)
       where id = $1`,
      [session.userId, patch.displayName ?? null, 'dob' in patch, patch.dob ?? null, patch.locale ?? null, patch.timezone ?? null]
    );
  });
}

// ── Auth methods listing (Doc 08 GET /me/auth-methods) ──────────

export interface AuthMethodSummary {
  id: string;
  provider: string;
  verifiedAt: string | null;
  lastUsedAt: string | null;
}

export async function listAuthMethods(session: SessionContext): Promise<AuthMethodSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      provider: string;
      verified_at: string | null;
      last_used_at: string | null;
    }>('select id, provider, verified_at, last_used_at from auth_methods order by created_at');
    return result.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      verifiedAt: row.verified_at,
      lastUsedAt: row.last_used_at,
    }));
  });
}

// ── Device management (Doc 08 /me/sessions, Doc 05 §10) ────────
// Caller already has a validated access token here, so these run through
// withRequestContext — RLS (sessions_select_self/sessions_update_self) is
// real defense-in-depth, not just an app-layer assumption.

export interface SessionSummary {
  id: string;
  deviceLabel: string | null;
  platform: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export async function listSessions(session: SessionContext): Promise<SessionSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      device_label: string | null;
      platform: string | null;
      last_seen_at: string | null;
      created_at: string;
    }>(
      `select id, device_label, platform, last_seen_at, created_at
       from sessions where revoked_at is null order by last_seen_at desc nulls last`
    );
    return result.rows.map((row) => ({
      id: row.id,
      deviceLabel: row.device_label,
      platform: row.platform,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    }));
  });
}

export async function revokeSession(session: SessionContext, targetSessionId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    await client.query('update sessions set revoked_at = now() where id = $1', [targetSessionId]);
  });
}

export async function revokeAllOtherSessions(session: SessionContext, currentSessionId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    await client.query('update sessions set revoked_at = now() where id <> $1 and revoked_at is null', [
      currentSessionId,
    ]);
  });
}

// ── Account linking & duplicate prevention (Doc 05 §5) ──────────

export async function linkAuthMethod(
  session: SessionContext,
  provider: 'google' | 'email_otp',
  providerUid: string
): Promise<void> {
  const client = await db.getServiceClient(); // cross-user uniqueness check needs to see beyond self
  try {
    const owner = await client.query<{ user_id: string }>(
      'select user_id from auth_methods where provider = $1 and provider_uid = $2',
      [provider, providerUid]
    );
    if (owner.rows[0] && owner.rows[0].user_id !== session.userId) {
      throw new AuthMethodTakenError();
    }
  } finally {
    client.release();
  }

  await db.withRequestContext(session, async (client) => {
    await client.query(
      `insert into auth_methods (user_id, provider, provider_uid, verified_at, last_used_at)
       values ($1, $2, $3, now(), now())
       on conflict (provider, provider_uid) do nothing`,
      [session.userId, provider, providerUid]
    );
  });
}

export async function unlinkAuthMethod(session: SessionContext, authMethodId: string): Promise<void> {
  // The >=1-verified-method deferred trigger (migration 0003) rejects this
  // at COMMIT if it would leave the user with zero verified methods.
  await db.withRequestContext(session, async (client) => {
    await client.query('delete from auth_methods where id = $1', [authMethodId]);
  });
}

// ── Consent (Doc 07 §3, Doc 13 §5-§6) ──────────────────────────

export type ConsentKind = 'biometric_face' | 'minor_login' | 'media_publish' | 'medical_access' | 'marketing';

export async function captureConsent(
  session: SessionContext,
  subjectUserId: string,
  kind: ConsentKind,
  evidence: Record<string, unknown> = {}
): Promise<string> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into consents (subject_user_id, kind, granted_by, evidence)
       values ($1, $2, $3, $4) returning id`,
      [subjectUserId, kind, session.userId, evidence]
    );
    return result.rows[0].id;
  });
}

export async function withdrawConsent(session: SessionContext, consentId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    await client.query('update consents set withdrawn_at = now() where id = $1', [consentId]);
  });
}

// ── Guardianship (minimal — full flow lands with `people`, Phase 6) ────
// No RLS insert policy exists yet for guardianships by design (migration
// 0003 comment); this is a placeholder used only by admin/seed tooling
// until Phase 6 adds a real guardian-adds-child flow with proper checks.

export async function createGuardianshipUnsafe(
  guardianUserId: string,
  wardUserId: string,
  relationship: 'father' | 'mother' | 'guardian'
): Promise<string> {
  const client = await db.getServiceClient();
  try {
    const result = await client.query<{ id: string }>(
      `insert into guardianships (guardian_user_id, ward_user_id, relationship)
       values ($1, $2, $3) returning id`,
      [guardianUserId, wardUserId, relationship]
    );
    return result.rows[0].id;
  } finally {
    client.release();
  }
}
