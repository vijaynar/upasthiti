// GET /api/v1/platform/dashboard — cross-org roll-up for the Super Admin home
// screen. Gated by platform.org.lifecycle inside getPlatformDashboard (returns
// 403 → the page shows an access-denied state for non-platform users).
import type { NextRequest } from 'next/server';
import { getPlatformDashboard } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  try {
    return jsonData(await getPlatformDashboard(session));
  } catch {
    return jsonError('forbidden', 'You do not have access to the platform dashboard.', 403);
  }
}
