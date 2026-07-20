// GET /api/v1/platform/referrals — platform.referral.manage
import type { NextRequest } from 'next/server';
import { listPlatformReferrals, PlatformPermissionError } from '@abhyas/module-marketplace';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  try {
    const referrals = await listPlatformReferrals(session);
    return jsonData(referrals);
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
