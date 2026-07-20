// PATCH /api/v1/orgs/{id}/finance/fee-policies/{feePolicyId}
import type { NextRequest } from 'next/server';
import { updateFeePolicy, NotAuthorizedError } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ feePolicyId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { feePolicyId } = await params;
  const body = await req.json().catch(() => null);

  try {
    await updateFeePolicy(session, feePolicyId, {
      name: typeof body?.name === 'string' ? body.name : undefined,
      amountMinor: typeof body?.amountMinor === 'number' ? body.amountMinor : undefined,
      finePolicy: body?.finePolicy ?? undefined,
      status: body?.status === 'active' || body?.status === 'archived' ? body.status : undefined,
    });
    return jsonData({ ok: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
