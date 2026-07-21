// GET /api/v1/me/platform-roles — the caller's own platform role keys (e.g.
// ["super_admin"]), empty for anyone who isn't platform staff. Used by the
// global app shell to show a role badge; no permission gate needed since
// platform_role_assignments_select_self (migration 0006) already limits
// this to the caller's own row.
import type { NextRequest } from 'next/server';
import { getMyPlatformRoles } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const roles = await getMyPlatformRoles(session.userId);
  return jsonData({ roles });
}
