// POST /api/v1/orgs/{id}/finance/payments/{paymentId}/approve — finance.proof.approve
// body: { chargeIds: string[] } — the charges this payment settles.
import type { NextRequest } from 'next/server';
import { approvePayment, NotAuthorizedError } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { paymentId } = await params;
  const body = await req.json().catch(() => null);
  const chargeIds = Array.isArray(body?.chargeIds) ? body.chargeIds.filter((c: unknown) => typeof c === 'string') : [];
  if (chargeIds.length === 0) return jsonError('invalid_request', 'chargeIds must be a non-empty array.', 400);

  try {
    await approvePayment(session, { paymentId, chargeIds });
    return jsonData({ ok: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
