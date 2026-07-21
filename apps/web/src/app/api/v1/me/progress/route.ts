// GET /api/v1/me/progress — the signed-in student's own progress entries (RLS self-scoped)
import type { NextRequest } from 'next/server';
import { listMyProgressEntries } from '@abhyas/module-progress';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listMyProgressEntries(session));
}
