// GET /api/v1/orgs/{id}/staff/{staffId}/availability — view a staff member's weekly slots
import type { NextRequest } from 'next/server';
import { listAvailability } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId } = await params;
  return jsonData(await listAvailability(session, staffId));
}
