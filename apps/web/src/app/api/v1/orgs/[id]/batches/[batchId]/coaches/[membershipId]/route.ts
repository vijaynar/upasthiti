// DELETE /api/v1/orgs/{id}/batches/{batchId}/coaches/{membershipId}
import type { NextRequest } from 'next/server';
import { removeCoachAssignment, NotAuthorizedError } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string; membershipId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { batchId, membershipId } = await params;
  try {
    await removeCoachAssignment(session, batchId, membershipId);
    return jsonData({ removed: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
