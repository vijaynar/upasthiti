// POST /api/v1/orgs/{id}/reviews/{reviewId}/respond — market.review.respond
import type { NextRequest } from 'next/server';
import { respondToReview, NotAuthorizedError } from '@abhyas/module-marketplace';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { reviewId } = await params;
  const body = await req.json().catch(() => null);
  const orgResponse = typeof body?.orgResponse === 'string' ? body.orgResponse.trim() : '';
  if (!orgResponse) return jsonError('invalid_request', 'orgResponse is required.', 400);

  try {
    const review = await respondToReview(session, reviewId, orgResponse);
    return jsonData(review);
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
