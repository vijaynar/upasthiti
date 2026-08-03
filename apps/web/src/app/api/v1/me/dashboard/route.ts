// GET /api/v1/me/dashboard — the signed-in student's home screen KPIs,
// aggregated across every org they hold an active enrollment in (a student
// has no "active workspace" of their own — see getStudentDashboard's
// comment). RLS scopes every figure to the caller's own data regardless of org.
import type { NextRequest } from 'next/server';
import { getStudentDashboard } from '@abhyas/module-dashboard';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await getStudentDashboard(session));
}
