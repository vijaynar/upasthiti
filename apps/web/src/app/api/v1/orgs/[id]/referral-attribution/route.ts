// POST /api/v1/orgs/{id}/referral-attribution { code } — attributes a
// referral code to this (the caller's active) org. RLS requires the caller
// to hold org.settings.update in this org; the self/circular-referral
// trigger (migration 0013) independently rejects invalid attributions.
import type { NextRequest } from 'next/server';
import { attributeReferral, NotAuthorizedError } from '@abhyas/module-marketplace';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code) return jsonError('invalid_request', 'code is required.', 400);

  try {
    const referral = await attributeReferral(session, code, id);
    return jsonData(referral);
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    if (err instanceof Error && err.message.includes('referral_self_referral')) return jsonError('self_referral', 'You cannot refer your own organization.', 400);
    if (err instanceof Error && err.message.includes('referral_circular')) return jsonError('circular_referral', 'This would create a circular referral.', 400);
    throw err;
  }
}
