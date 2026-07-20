// PATCH /api/v1/orgs/{id}/batches/{batchId}/sessions/{sessionId} — ad-hoc status override (cancel, etc.)
import type { NextRequest } from 'next/server';
import { setClassSessionStatus, NotAuthorizedError, type ClassSessionStatus } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const VALID_STATUSES: ClassSessionStatus[] = ['scheduled', 'completed', 'cancelled', 'holiday'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string; sessionId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { sessionId } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!VALID_STATUSES.includes(status)) {
    return jsonError('invalid_request', `status must be one of ${VALID_STATUSES.join(', ')}.`, 400);
  }

  try {
    await setClassSessionStatus(session, sessionId, status);
    return jsonData({ updated: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
