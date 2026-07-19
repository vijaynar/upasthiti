// POST /api/v1/auth/refresh (Doc 08 §7) — rotates the refresh cookie, reuse-detected.
import { NextRequest, NextResponse } from 'next/server';
import { refreshSession } from '@abhyas/module-identity-auth';
import { getRefreshTokenFromRequest, setSessionCookies, clearSessionCookies, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest) {
  const refreshToken = getRefreshTokenFromRequest(req);
  if (!refreshToken) return jsonError('no_session', 'No refresh token present.', 401);

  try {
    const result = await refreshSession(refreshToken);
    return setSessionCookies(NextResponse.json({ data: { refreshed: true } }), result);
  } catch (err) {
    const response = jsonError('refresh_failed', err instanceof Error ? err.message : 'Refresh failed.', 401);
    return clearSessionCookies(response);
  }
}
