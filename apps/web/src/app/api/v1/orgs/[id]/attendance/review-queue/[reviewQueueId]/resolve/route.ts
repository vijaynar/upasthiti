// POST /api/v1/orgs/{id}/attendance/review-queue/{reviewQueueId}/resolve
// Confirming writes the real attendance_events row; rejecting just closes
// the queue item (US-3 AC2 — low-confidence matches never auto-record).
import type { NextRequest } from 'next/server';
import { resolveReviewQueueItem, NotAuthorizedError } from '@abhyas/module-attendance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ reviewQueueId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { reviewQueueId } = await params;
  const body = await req.json().catch(() => null);
  const decision = body?.decision;
  const enrollmentId = typeof body?.enrollmentId === 'string' ? body.enrollmentId : undefined;

  if (decision !== 'confirmed' && decision !== 'rejected') {
    return jsonError('invalid_request', 'decision must be "confirmed" or "rejected".', 400);
  }

  try {
    const item = await resolveReviewQueueItem(session, { reviewQueueId, decision, enrollmentId });
    return jsonData(item);
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    if (err instanceof Error) return jsonError('invalid_request', err.message, 400);
    throw err;
  }
}
