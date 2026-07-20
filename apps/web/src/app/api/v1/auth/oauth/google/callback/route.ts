// GET /api/v1/auth/oauth/google/callback (Doc 08 §7) — Google redirects
// here with ?code=...; exchange it, issue OUR session, set cookies.
import { NextRequest, NextResponse } from 'next/server';
import { completeGoogleOAuth } from '@abhyas/module-identity-auth';
import { createRouteCookieJar, applyPendingCookies, setSessionCookies } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_code', req.url));
  }

  const { jar, pending } = createRouteCookieJar(req);
  try {
    const result = await completeGoogleOAuth(
      { code },
      jar,
      { platform: 'web', ip: req.headers.get('x-forwarded-for') ?? undefined }
    );
    const response = NextResponse.redirect(new URL(result.isNewUser ? '/onboarding' : '/workspace', req.url));
    applyPendingCookies(response, pending);
    return setSessionCookies(response, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'oauth_failed';
    const response = NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(message)}`, req.url));
    return applyPendingCookies(response, pending);
  }
}
