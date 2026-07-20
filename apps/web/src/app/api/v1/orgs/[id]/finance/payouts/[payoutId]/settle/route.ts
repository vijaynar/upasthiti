// POST /api/v1/orgs/{id}/finance/payouts/{payoutId}/settle — finance.payout.manage
// No gateway is configured (see migration 0011's header) — this records that
// staff moved the money outside the app and posts the ledger legs.
import type { NextRequest } from 'next/server';
import { settlePayout, NotAuthorizedError } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ payoutId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { payoutId } = await params;
  try {
    await settlePayout(session, payoutId);
    return jsonData({ ok: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
