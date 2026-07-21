// GET/PUT /api/v1/orgs/{id}/staff/{staffId}/payout-settings — view / set a staff member's pay config
import type { NextRequest } from 'next/server';
import { getPayoutSettings, setPayoutSettings, StaffStateError, type PayType } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const PAY_TYPES: PayType[] = ['salary', 'commission', 'hourly'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId } = await params;
  return jsonData(await getPayoutSettings(session, staffId));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId } = await params;
  const body = await req.json().catch(() => null);
  const payType = PAY_TYPES.includes(body?.payType) ? (body.payType as PayType) : null;
  if (!payType) return jsonError('invalid_request', 'A valid payType is required.', 400);

  try {
    const settings = await setPayoutSettings(session, {
      staffProfileId: staffId,
      payType,
      amountMinor: typeof body?.amountMinor === 'number' ? body.amountMinor : undefined,
      currency: typeof body?.currency === 'string' ? body.currency : undefined,
      commissionPct: typeof body?.commissionPct === 'number' ? body.commissionPct : undefined,
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
    });
    return jsonData(settings);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to manage pay settings here.', 403);
    if (err instanceof StaffStateError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
