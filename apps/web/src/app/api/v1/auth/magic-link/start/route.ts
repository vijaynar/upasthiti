// POST /api/v1/auth/magic-link/start { email } (Doc 08 §7)
import type { NextRequest } from 'next/server';
import { startMagicLink } from '@abhyas/module-identity-auth';
import { createRouteCookieJar, applyPendingCookies, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!email) return jsonError('invalid_email', 'A valid email is required.', 400);

  const { jar, pending } = createRouteCookieJar(req);
  await startMagicLink(email, jar);
  return applyPendingCookies(jsonData({ sent: true }), pending);
}
