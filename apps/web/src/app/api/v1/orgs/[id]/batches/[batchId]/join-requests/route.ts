// POST /api/v1/orgs/{id}/batches/{batchId}/join-requests — a student
// requests to join a batch they can now browse (batches_select_org_student)
// but aren't in yet. A coach/admin decides it via
// /api/v1/orgs/{id}/batch-join-requests/{requestId}/decide.
import type { NextRequest } from 'next/server';
import { requestBatchJoin, DuplicateJoinRequestError, NotAuthorizedError } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { batchId } = await params;
  try {
    const request = await requestBatchJoin(session, batchId);
    return jsonData(request, 201);
  } catch (err) {
    if (err instanceof DuplicateJoinRequestError) return jsonError('duplicate_request', err.message, 409);
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
