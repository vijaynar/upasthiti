// POST /api/v1/orgs/{id}/leave (Doc 02 §9 — coach leaving an org they don't own)
import type { NextRequest } from 'next/server';
import { leaveOrganization, NotAuthorizedError, OrganizationLifecycleError } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  try {
    await leaveOrganization(session, id);
    return jsonData({ ok: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    if (err instanceof OrganizationLifecycleError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
