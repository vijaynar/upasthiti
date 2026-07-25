// GET /api/v1/orgs/{id}/me/roles — the caller's own org role keys (used by
// /dashboard to pick which role dashboard to render) plus which one is
// currently ACTIVE (migration 0022) — the role has_perm()/has_perm_branch()
// actually check, and the one the nav/permissions follow.
import type { NextRequest } from 'next/server';
import { getMyOrgRoles } from '@abhyas/module-dashboard';
import { getMyActiveRole } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const [roleKeys, activeRoleKey] = await Promise.all([getMyOrgRoles(session, id), getMyActiveRole(session, id)]);
  return jsonData({ roleKeys, activeRoleKey });
}
