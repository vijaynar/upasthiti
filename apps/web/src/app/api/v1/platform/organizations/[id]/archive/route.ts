// POST /api/v1/platform/organizations/{id}/archive — soft-delete for a
// verified org (status -> 'archived'); unverified orgs use DELETE on the
// sibling [id]/route.ts instead.
import type { NextRequest } from 'next/server';
import { archiveOrganization, PlatformPermissionError, OrganizationStateError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason : undefined;
  try {
    await archiveOrganization(session, id, reason);
    return jsonData({ ok: true });
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    if (err instanceof OrganizationStateError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
