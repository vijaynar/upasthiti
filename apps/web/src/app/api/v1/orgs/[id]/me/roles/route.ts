// GET /api/v1/orgs/{id}/me/roles — the caller's own active org role keys, used
// by /dashboard to pick which role dashboard to render.
import type { NextRequest } from 'next/server';
import { getMyOrgRoles } from '@abhyas/module-dashboard';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData({ roleKeys: await getMyOrgRoles(session, id) });
}
