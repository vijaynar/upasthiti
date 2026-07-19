// POST /api/v1/auth/logout[?all=true] (Doc 08 §7)
import { NextRequest, NextResponse } from 'next/server';
import { revokeSession, revokeAllOtherSessions } from '@abhyas/module-identity-auth';
import { getSessionFromRequest, clearSessionCookies, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const all = req.nextUrl.searchParams.get('all') === 'true';
  if (all) {
    await revokeAllOtherSessions(session, session.sessionId);
  }
  await revokeSession(session, session.sessionId);

  return clearSessionCookies(NextResponse.json({ data: { loggedOut: true } }));
}
