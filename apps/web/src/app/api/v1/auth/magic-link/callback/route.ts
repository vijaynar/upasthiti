// GET /api/v1/auth/magic-link/callback (Doc 08 §7) — the emailed link
// lands here with ?code=...; exchange it, issue OUR session, set cookies.
import { NextRequest, NextResponse } from 'next/server';
import { completeMagicLink } from '@abhyas/module-identity-auth';
import { createRouteCookieJar, applyPendingCookies, setSessionCookies } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_code', req.url));
  }

  const { jar, pending } = createRouteCookieJar(req);
  try {
    const result = await completeMagicLink(code, jar, {
      platform: 'web',
      ip: req.headers.get('x-forwarded-for') ?? undefined,
    });
    const response = NextResponse.redirect(new URL(result.isNewUser ? '/onboarding' : '/workspace', req.url));
    applyPendingCookies(response, pending);
    return setSessionCookies(response, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'magic_link_failed';
    const response = NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(message)}`, req.url));
    return applyPendingCookies(response, pending);
  }
}
