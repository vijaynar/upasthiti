// POST /api/v1/platform/referrals/{id}/approve-reward { amountMinor } —
// platform.referral.manage (Doc 08 §7). See marketplace/src/service.ts's
// header: no real subscription-billing event exists to derive the amount
// from, so staff enters it manually.
import type { NextRequest } from 'next/server';
import { approveReferralReward, PlatformPermissionError, NotAuthorizedError } from '@abhyas/module-marketplace';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const amountMinor = typeof body?.amountMinor === 'number' ? body.amountMinor : undefined;
  if (!amountMinor || amountMinor <= 0) return jsonError('invalid_request', 'amountMinor must be a positive number.', 400);

  try {
    const referral = await approveReferralReward(session, id, amountMinor);
    return jsonData(referral);
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    if (err instanceof NotAuthorizedError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
