// POST /api/v1/orgs/{id}/finance/charges/{chargeId}/cancel — finance.charge.create
import type { NextRequest } from 'next/server';
import { cancelCharge, NotAuthorizedError } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ chargeId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { chargeId } = await params;
  try {
    await cancelCharge(session, chargeId);
    return jsonData({ ok: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
