// apps/web/src/proxy.ts
// Next.js Proxy (renamed from `middleware` in Next 16 — a file named
// middleware.ts alongside this one is a build error) — runs on every
// request. Responsibilities:
//   1. V2: silently refresh the abhyas_access_token cookie (Doc 05 §6)
//   2. V1: refresh Supabase session cookies so JWT stays valid
//   3. Redirect unauthenticated users away from protected routes
//   4. Redirect authenticated users away from auth pages
//
// #1 needs a real Postgres connection (identity-auth's refreshSession,
// packages/platform's db.getServiceClient) and RS256 JWT verification —
// this only works because Proxy (unlike old-style Edge middleware) always
// runs on the Node.js runtime.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
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
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  response = await refreshV2AccessToken(request, response);

  try {
    // Check if env variables are available before constructing client
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.warn('[Proxy Middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
      return response;
    }

    // Create a Supabase client that can read/write cookies
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            // Carry over any cookies refreshV2AccessToken already set (e.g.
            // abhyas_access_token) — this rebuilds `response` from scratch
            // and would otherwise silently drop them if a V1 Supabase
            // session and a V2 session coexist in the same browser.
            const priorCookies = response.cookies.getAll();
            response = NextResponse.next({ request });
            priorCookies.forEach((c) => response.cookies.set(c));
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Refresh session — important: always call getUser() to refresh
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    // ── Auth route guards ─────────────────────────────────────
    const isAdminRoute = pathname.startsWith('/admin');
    const isApiRoute = pathname.startsWith('/api');

    // API routes handle their own auth — skip proxy for them
    if (isApiRoute) {
      return response;
    }

    // NOTE (V2 rebuild, Phase 3): this used to also bounce `/auth/*` away to
    // `/admin/dashboard` whenever `supabase.auth.getUser()` found a session.
    // That's now the wrong signal — `/auth/login` is V2's rebuilt login page
    // (Doc 05), which authenticates against our own JWT
    // (`abhyas_access_token`), not a Supabase session. The V2 magic-link/
    // OAuth flows use Supabase's GoTrue transiently (PKCE exchange) and can
    // leave a Supabase session cookie behind as a side effect, which used to
    // make `/auth/login` permanently unreachable afterwards — even for a
    // second person signing in on the same browser. `/admin/*` (still
    // V1-live, unrebuilt) keeps its guard below unchanged.

    // Redirect unauthenticated users to login for protected routes
    if (isAdminRoute && !user) {
      const redirectUrl = new URL('/auth/login', request.url);
      redirectUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(redirectUrl);
    }
  } catch (error) {
    console.error('[Proxy Middleware] Unexpected error:', error);
  }

  return response;
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
