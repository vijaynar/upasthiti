// GET /api/v1/orgs/{id}/attendance/face-bio-status (Students page "Face Bio Status" column)
import type { NextRequest } from 'next/server';
import { getFaceBioStatusSummary } from '@abhyas/module-attendance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  return jsonData(await getFaceBioStatusSummary(session, id, searchParams.get('branchId') ?? undefined));
}
