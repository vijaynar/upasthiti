// GET /api/v1/orgs/{id}/attendance/review-queue?status=pending
import type { NextRequest } from 'next/server';
import { listReviewQueue, type ReviewQueueStatus } from '@abhyas/module-attendance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const VALID_STATUSES: ReviewQueueStatus[] = ['pending', 'confirmed', 'rejected'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const status = statusParam && VALID_STATUSES.includes(statusParam as ReviewQueueStatus) ? (statusParam as ReviewQueueStatus) : 'pending';

  return jsonData(await listReviewQueue(session, id, status));
}
