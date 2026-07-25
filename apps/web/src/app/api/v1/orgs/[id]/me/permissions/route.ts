// GET /api/v1/orgs/{id}/me/permissions — permission keys of the caller's
// currently ACTIVE role only (migration 0022), not every role they hold.
// Used to show/hide nav by what the active role can actually do.
import type { NextRequest } from 'next/server';
import { getMyActivePermissions } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData({ permissionKeys: await getMyActivePermissions(session, id) });
}
