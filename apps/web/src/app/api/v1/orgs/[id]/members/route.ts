// GET /api/v1/orgs/{id}/members (Doc 04 §5 "Members & roles")
import type { NextRequest } from 'next/server';
import { listMembers } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listMembers(session, id));
}
