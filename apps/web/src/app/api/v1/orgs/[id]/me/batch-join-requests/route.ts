// GET /api/v1/orgs/{id}/me/batch-join-requests — the signed-in student's own
// batch join requests (any status), so "My Batches"/dashboard can show a
// pending state instead of letting them re-request silently.
import type { NextRequest } from 'next/server';
import { listMyBatchJoinRequests } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listMyBatchJoinRequests(session));
}
