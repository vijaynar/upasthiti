// apps/web/src/proxy.ts
// Next.js Edge Proxy — runs on every request
// Responsibilities:
//   1. Refresh Supabase session cookies so JWT stays valid
//   2. Redirect unauthenticated users away from protected routes
//   3. Redirect authenticated users away from auth pages

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

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
            response = NextResponse.next({ request });
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
