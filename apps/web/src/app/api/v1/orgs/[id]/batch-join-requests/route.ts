// GET /api/v1/orgs/{id}/batch-join-requests — the staff-facing pending
// queue (RLS already narrows this to batches the caller holds
// schedule.batch.update on).
import type { NextRequest } from 'next/server';
import { listPendingBatchJoinRequests } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listPendingBatchJoinRequests(session, id));
}
