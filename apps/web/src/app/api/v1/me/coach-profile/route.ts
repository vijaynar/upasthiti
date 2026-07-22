// GET /api/v1/me/coach-profile — the caller's own coach professional profile in their active org, if any
import type { NextRequest } from 'next/server';
import { getMyCoachProfile } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await getMyCoachProfile(session));
}
