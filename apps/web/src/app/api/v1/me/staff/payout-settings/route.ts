// GET /api/v1/me/staff/payout-settings — my own pay configuration, read-only
import type { NextRequest } from 'next/server';
import { getMyPayoutSettings } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await getMyPayoutSettings(session));
}
