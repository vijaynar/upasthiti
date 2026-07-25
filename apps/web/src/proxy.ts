// apps/web/src/proxy.ts
// Next.js Proxy (renamed from `middleware` in Next 16 — a file named
// middleware.ts alongside this one is a build error) — runs on every
// request. Responsibility: silently refresh the abhyas_access_token cookie
// (Doc 05 §6) before the request reaches any route handler.
//
// This needs a real Postgres connection (identity-auth's refreshSession,
// packages/platform's db.getServiceClient) and RS256 JWT verification —
// this only works because Proxy (unlike old-style Edge middleware) always
// runs on the Node.js runtime.
//
// V1's Supabase-session refresh + /admin/* route guard used to live here
// too — removed along with the rest of the V1 admin/student surface
// (app/admin/**, app/student/**), which was the only thing reading a
// Supabase session cookie.

import { NextResponse, type NextRequest } from 'next/server';
import { jwt as platformJwt } from '@abhyas/platform';
import { refreshSession } from '@abhyas/module-identity-auth';
import { getRefreshTokenFromRequest, setSessionCookies, clearSessionCookies } from '@/lib/v2-session';

const V2_ACCESS_COOKIE = 'abhyas_access_token';

// V2's own access token is short-lived (15 min) and nothing on the client
// ever calls POST /api/v1/auth/refresh — every page independently re-fetches
// /api/v1/me on mount (22 copies of the same local `api()` helper across
// apps/web/src/app/**), so once it expires every one of those calls 401s.
// Worse, several of those callers (AppShell's sidebar, /me/profile) only
// render past a "Loading…" gate once the fetch *succeeds* — a failed fetch
// just leaves them stuck there forever, which reads as "the session
// randomly vanished" even though the 30-day refresh token is still good.
// This silently rotates it (identity-auth's refreshSession — reuse-
// detected) before the request reaches any route handler, so route
// handlers essentially never see the 15-minute expiry at all.
async function refreshV2AccessToken(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  const accessToken = request.cookies.get(V2_ACCESS_COOKIE)?.value;
  if (accessToken) {
    try {
      platformJwt.verifyAccessToken(accessToken);
      return response; // Still valid — nothing to do.
    } catch {
      // Expired/malformed — fall through to refresh.
    }
  }

  const refreshToken = getRefreshTokenFromRequest(request);
  if (!refreshToken) return response; // Never logged in — let the route 401 normally.

  try {
    const result = await refreshSession(refreshToken);
    return setSessionCookies(response, result);
  } catch {
    // Refresh token expired, revoked, or reuse-detected — a real logout.
    return clearSessionCookies(response);
  }
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  return refreshV2AccessToken(request, response);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
