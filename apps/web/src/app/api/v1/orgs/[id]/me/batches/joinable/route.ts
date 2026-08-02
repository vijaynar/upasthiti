// GET /api/v1/orgs/{id}/me/batches/joinable — active batches in this org the
// signed-in student isn't in yet and hasn't already requested to join
// (batches_select_org_student RLS, migration 0011).
import type { NextRequest } from 'next/server';
import { listJoinableBatches } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listJoinableBatches(session, id));
}
