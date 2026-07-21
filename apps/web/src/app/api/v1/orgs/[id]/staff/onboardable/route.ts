// GET /api/v1/orgs/{id}/staff/onboardable — active members with no HR profile yet
import type { NextRequest } from 'next/server';
import { listOnboardableMembers } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listOnboardableMembers(session, id));
}
