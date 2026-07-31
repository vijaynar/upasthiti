// GET/DELETE /api/v1/orgs/{id} (Doc 02 §3 — organization detail; DELETE is
// the self-service cleanup for an abandoned/rejected signup)
import type { NextRequest } from 'next/server';
import { getOrganization, deleteOrganization, NotAuthorizedError, OrganizationLifecycleError } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const org = await getOrganization(session, id);
  if (!org) return jsonError('not_found', 'Organization not found.', 404);
  return jsonData(org);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  try {
    await deleteOrganization(session, id);
    return jsonData({ ok: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    if (err instanceof OrganizationLifecycleError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
