// GET/POST /api/v1/orgs/{id}/finance/payments
// GET lists staff-visible payments; POST records a staff-attested cash/waiver
// payment, which settles instantly (no separate approval step) — see
// @abhyas/module-finance's recordManualPayment.
import type { NextRequest } from 'next/server';
import { listPayments, recordManualPayment, NotAuthorizedError, FeatureDisabledError, type PaymentStatus } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  return jsonData(await listPayments(session, { organizationId: id, status: (searchParams.get('status') as PaymentStatus | null) ?? undefined }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const payerUserId = typeof body?.payerUserId === 'string' ? body.payerUserId : '';
  const method = body?.method === 'cash' || body?.method === 'waiver' ? body.method : undefined;
  const amountMinor = typeof body?.amountMinor === 'number' ? body.amountMinor : undefined;
  const chargeIds = Array.isArray(body?.chargeIds) ? body.chargeIds.filter((c: unknown) => typeof c === 'string') : [];

  if (!payerUserId) return jsonError('invalid_request', 'payerUserId is required.', 400);
  if (!method) return jsonError('invalid_request', 'method must be "cash" or "waiver".', 400);
  if (typeof amountMinor !== 'number' || amountMinor <= 0) return jsonError('invalid_request', 'amountMinor must be a positive number.', 400);
  if (chargeIds.length === 0) return jsonError('invalid_request', 'chargeIds must be a non-empty array.', 400);

  try {
    const payment = await recordManualPayment(session, {
      organizationId: id,
      payerUserId,
      method,
      amountMinor,
      currency: typeof body?.currency === 'string' ? body.currency : undefined,
      chargeIds,
      createdAt: typeof body?.createdAt === 'string' ? body.createdAt : undefined,
    });
    return jsonData(payment, 201);
  } catch (err) {
    if (err instanceof FeatureDisabledError) return jsonError('feature_disabled', err.message, 403);
    if (err instanceof NotAuthorizedError || isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to record a payment here.', 403);
    throw err;
  }
}
