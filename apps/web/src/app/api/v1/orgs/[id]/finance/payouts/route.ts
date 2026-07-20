// GET/POST /api/v1/orgs/{id}/finance/payouts — finance.payout.read / finance.payout.manage
import type { NextRequest } from 'next/server';
import { listPayouts, requestPayout, NotAuthorizedError } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listPayouts(session, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const amountMinor = typeof body?.amountMinor === 'number' ? body.amountMinor : undefined;
  if (typeof amountMinor !== 'number' || amountMinor <= 0) return jsonError('invalid_request', 'amountMinor must be a positive number.', 400);

  try {
    const payout = await requestPayout(session, {
      organizationId: id,
      amountMinor,
      currency: typeof body?.currency === 'string' ? body.currency : undefined,
      bankAccountId: typeof body?.bankAccountId === 'string' ? body.bankAccountId : undefined,
      periodStart: typeof body?.periodStart === 'string' ? body.periodStart : undefined,
      periodEnd: typeof body?.periodEnd === 'string' ? body.periodEnd : undefined,
    });
    return jsonData(payout, 201);
  } catch (err) {
    if (err instanceof NotAuthorizedError || isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to request a payout here.', 403);
    throw err;
  }
}
