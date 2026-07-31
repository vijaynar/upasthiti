// GET/DELETE /api/v1/platform/organizations/{id} (wireframe 4b org 360 view;
// DELETE permanently removes an unverified org — see archive/route.ts for
// the verified-org path)
import type { NextRequest } from 'next/server';
import { getOrganizationDetail, deleteOrganization, PlatformPermissionError, OrganizationStateError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  try {
    const org = await getOrganizationDetail(session, id);
    if (!org) return jsonError('not_found', 'Organization not found.', 404);
    return jsonData(org);
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason : undefined;
  try {
    await deleteOrganization(session, id, reason);
    return jsonData({ ok: true });
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    if (err instanceof OrganizationStateError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
