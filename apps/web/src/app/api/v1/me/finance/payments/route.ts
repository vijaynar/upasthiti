// GET/POST /api/v1/me/finance/payments
// GET: own payment history. POST: submit proof of a payment already made
// outside the app (bank transfer, UPI screenshot) — stays
// 'pending_verification' until staff approves/rejects it. `payerUserId` may
// be set to a ward's id by the guardian paying on their behalf (RLS still
// requires the ward's is_my_ward()-derived charge to exist for the guardian
// to see it; the payment row itself records who actually paid).
import type { NextRequest } from 'next/server';
import { listMyPayments, submitPaymentProof } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listMyPayments(session));
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : '';
  const amountMinor = typeof body?.amountMinor === 'number' ? body.amountMinor : undefined;
  const proofPath = typeof body?.proofPath === 'string' ? body.proofPath.trim() : '';

  if (!organizationId) return jsonError('invalid_request', 'organizationId is required.', 400);
  if (typeof amountMinor !== 'number' || amountMinor <= 0) return jsonError('invalid_request', 'amountMinor must be a positive number.', 400);
  if (!proofPath) return jsonError('invalid_request', 'proofPath is required.', 400);

  try {
    const payment = await submitPaymentProof(session, {
      organizationId,
      amountMinor,
      currency: typeof body?.currency === 'string' ? body.currency : undefined,
      proofPath,
    });
    return jsonData(payment, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to submit a payment here.', 403);
    throw err;
  }
}
