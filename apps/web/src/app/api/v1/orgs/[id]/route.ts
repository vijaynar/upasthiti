// GET /api/v1/orgs/{id} (Doc 02 §3 — organization detail)
import type { NextRequest } from 'next/server';
import { getOrganization } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const org = await getOrganization(session, id);
  if (!org) return jsonError('not_found', 'Organization not found.', 404);
  return jsonData(org);
}
