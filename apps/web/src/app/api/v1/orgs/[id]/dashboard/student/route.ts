// GET /api/v1/orgs/{id}/dashboard/student — the signed-in student's home
// screen KPIs (attendance/streak/upcoming payments/pending approvals/today's
// schedule/announcements). RLS scopes every figure to the caller's own data.
import type { NextRequest } from 'next/server';
import { getStudentDashboard } from '@abhyas/module-dashboard';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await getStudentDashboard(session, id));
}
