// GET /api/v1/me/enrollments (Doc 07 §6 — self, as student)
import type { NextRequest } from 'next/server';
import { listMyEnrollments } from '@abhyas/module-people';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listMyEnrollments(session));
}
