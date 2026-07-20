// POST /api/v1/orgs/{id}/listing/publish — market.listing.manage
// -> 'live' if the org is already verified, else 'pending_verification'
// (Doc 02 §9 / PRD US-1 AC5).
import type { NextRequest } from 'next/server';
import { publishListing, NotAuthorizedError } from '@abhyas/module-marketplace';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  try {
    const listing = await publishListing(session, id);
    return jsonData(listing);
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
