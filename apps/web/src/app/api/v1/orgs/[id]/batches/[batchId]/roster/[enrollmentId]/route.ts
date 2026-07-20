// DELETE /api/v1/orgs/{id}/batches/{batchId}/roster/{enrollmentId} (marks 'left', not a hard delete)
import type { NextRequest } from 'next/server';
import { removeFromBatchRoster, NotAuthorizedError } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string; enrollmentId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { batchId, enrollmentId } = await params;
  try {
    await removeFromBatchRoster(session, enrollmentId, batchId);
    return jsonData({ removed: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
