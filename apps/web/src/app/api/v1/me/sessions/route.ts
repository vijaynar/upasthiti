// GET /api/v1/me/sessions (Doc 08 §7, Doc 05 §10 — device management)
import type { NextRequest } from 'next/server';
import { listSessions } from '@abhyas/module-identity-auth';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const sessions = await listSessions(session);
  return jsonData(sessions.map((s) => ({ ...s, isCurrent: s.id === session.sessionId })));
}
