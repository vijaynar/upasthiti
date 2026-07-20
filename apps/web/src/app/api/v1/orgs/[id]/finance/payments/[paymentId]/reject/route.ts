// POST /api/v1/orgs/{id}/finance/payments/{paymentId}/reject — finance.proof.approve
import type { NextRequest } from 'next/server';
import { rejectPayment, NotAuthorizedError } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { paymentId } = await params;
  const body = await req.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return jsonError('invalid_request', 'reason is required.', 400);

  try {
    await rejectPayment(session, paymentId, reason);
    return jsonData({ ok: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
