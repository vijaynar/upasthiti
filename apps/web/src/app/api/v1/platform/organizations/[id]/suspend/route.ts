// POST /api/v1/platform/organizations/{id}/suspend (wireframe 4b Suspend/reinstate)
import type { NextRequest } from 'next/server';
import { setOrganizationSuspension, PlatformPermissionError, OrganizationStateError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const reason = typeof body?.reason === 'string' ? body.reason : undefined;
  if (action !== 'suspend' && action !== 'reinstate') {
    return jsonError('invalid_request', 'action must be "suspend" or "reinstate".', 400);
  }

  try {
    await setOrganizationSuspension(session, id, action, reason);
    return jsonData({ ok: true });
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    if (err instanceof OrganizationStateError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
