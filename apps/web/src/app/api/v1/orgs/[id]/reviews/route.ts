// GET/POST /api/v1/orgs/{id}/reviews — GET: org-scoped read (staff + any
// member, RLS-gated); POST: self-service create (verified-student proof
// via enrollmentId, market_003's reviews_insert_self RLS policy).
import type { NextRequest } from 'next/server';
import { listOrgReviews, createReview } from '@abhyas/module-marketplace';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const reviews = await listOrgReviews(session, id);
  return jsonData(reviews);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const listingId = typeof body?.listingId === 'string' ? body.listingId : '';
  const enrollmentId = typeof body?.enrollmentId === 'string' ? body.enrollmentId : '';
  const rating = typeof body?.rating === 'number' ? body.rating : undefined;
  const reviewBody = typeof body?.body === 'string' ? body.body : undefined;

  if (!listingId || !enrollmentId) return jsonError('invalid_request', 'listingId and enrollmentId are required.', 400);
  if (!rating || rating < 1 || rating > 5) return jsonError('invalid_request', 'rating must be between 1 and 5.', 400);

  try {
    const review = await createReview(session, { organizationId: id, listingId, enrollmentId, rating, body: reviewBody });
    return jsonData(review, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You must be an enrolled student here to review this listing.', 403);
    throw err;
  }
}
