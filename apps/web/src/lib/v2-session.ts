// apps/web/src/lib/v2-session.ts
// Session cookie plumbing for the V2 rebuild (Doc 05 §6). Deliberately
// separate from lib/api.ts, which the not-yet-rebuilt V1 routes still use —
// no shared state between the two until each V1 route is replaced in its
// own phase.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwt as platformJwt } from '@abhyas/platform';
import type { auth } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';

const ACCESS_COOKIE = 'abhyas_access_token';
const REFRESH_COOKIE = 'abhyas_refresh_token';
const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // Doc 05 §6 — 30d web

const isProd = process.env.NODE_ENV === 'production';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Reads + verifies the access token cookie. Returns null, never throws, on any failure (expired/missing/invalid). */
export function getSessionFromRequest(req: NextRequest): (SessionContext & { sessionId: string }) | null {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const claims = platformJwt.verifyAccessToken(token);
    return { userId: claims.sub, orgId: claims.org, sessionId: claims.sid };
  } catch {
    return null;
  }
}

export function getRefreshTokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get(REFRESH_COOKIE)?.value ?? null;
}

export function setSessionCookies(response: NextResponse, tokens: AuthTokens): NextResponse {
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60, // matches access token TTL, Doc 05 §6
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

/** Sets only the access-token cookie — for flows like workspace switching that reissue the access token without rotating the refresh token. */
export function setAccessTokenCookie(response: NextResponse, accessToken: string): NextResponse {
  response.cookies.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60, // matches access token TTL, Doc 05 §6
  });
  return response;
}

export function clearSessionCookies(response: NextResponse): NextResponse {
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}

// ── PKCE cookie jar (Doc 05 §3) ──────────────────────────────────
// signInWithOAuth/signInWithOtp need to set a code-verifier cookie that
// survives until the callback request; NextResponse can't be mutated
// mid-handler the way middleware can, so pending writes are collected here
// and applied to the final response the route handler builds.

type PendingCookie = { name: string; value: string; options?: Record<string, unknown> };

export function createRouteCookieJar(req: NextRequest): { jar: auth.CookieJar; pending: PendingCookie[] } {
  const pending: PendingCookie[] = [];
  const jar: auth.CookieJar = {
    getAll: () => req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
    setAll: (cookies) => {
      pending.push(...cookies);
    },
  };
  return { jar, pending };
}

export function applyPendingCookies(response: NextResponse, pending: PendingCookie[]): NextResponse {
  for (const c of pending) {
    response.cookies.set({ name: c.name, value: c.value, ...c.options });
  }
  return response;
}

// ── Response envelope (Doc 08 §4) ───────────────────────────────

export function jsonData<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function jsonError(code: string, message: string, status = 400): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

// ── RLS-denial detection (Doc 02 §5) ────────────────────────────
// Several tenancy-rbac writes (branches, invitations, join-request
// decisions, branding) have no dedicated "not authorized" error class —
// authorization IS the RLS policy, so a denied write just throws Postgres's
// generic insufficient_privilege error (42501). Routes check for that
// specifically (never a blanket catch-all) so a real 500 doesn't get
// silently reported as a 403.
export function isRlsDenied(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '42501';
}
