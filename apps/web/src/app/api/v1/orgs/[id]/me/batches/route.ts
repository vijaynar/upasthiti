// GET /api/v1/orgs/{id}/me/batches — the signed-in student's active batches
// with attendance %, progress %, coach name, and next session (the "My
// Batches" list + the dashboard's batch cards, same underlying aggregate).
import type { NextRequest } from 'next/server';
import { listMyBatchSummaries } from '@abhyas/module-dashboard';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listMyBatchSummaries(session, id));
}
