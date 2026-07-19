// GET /api/v1/auth/oauth/google/start (Doc 08 §7) — redirects to Google's
// consent screen via Supabase's OAuth flow (platform/auth adapter).
import { NextRequest, NextResponse } from 'next/server';
import { startGoogleOAuth } from '@abhyas/module-identity-auth';
import { createRouteCookieJar, applyPendingCookies } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const { jar, pending } = createRouteCookieJar(req);
  const { redirectUrl } = await startGoogleOAuth(jar);
  return applyPendingCookies(NextResponse.redirect(redirectUrl), pending);
}
