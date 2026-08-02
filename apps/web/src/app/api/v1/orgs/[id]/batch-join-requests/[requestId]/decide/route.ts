// POST /api/v1/orgs/{id}/batch-join-requests/{requestId}/decide — a coach/
// admin approves or rejects a student's batch join request. Approval
// upserts the real batch_enrollments roster row in the same transaction
// (see decideBatchJoinRequest's comment).
import type { NextRequest } from 'next/server';
import { decideBatchJoinRequest, NotAuthorizedError } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { requestId } = await params;
  const body = await req.json().catch(() => null);
  const decision = body?.decision === 'rejected' ? 'rejected' : body?.decision === 'approved' ? 'approved' : null;
  if (!decision) return jsonError('invalid_request', 'decision must be "approved" or "rejected".', 400);

  try {
    await decideBatchJoinRequest(session, requestId, decision, typeof body?.note === 'string' ? body.note : undefined);
    return jsonData({ decided: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
