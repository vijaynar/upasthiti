// GET /api/v1/orgs/{id}/dashboard/owner — org-wide KPIs for the owner/admin
// home screen. RLS scopes every figure to what the caller can read.
import type { NextRequest } from 'next/server';
import { getOwnerDashboard } from '@abhyas/module-dashboard';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await getOwnerDashboard(session, id));
}
