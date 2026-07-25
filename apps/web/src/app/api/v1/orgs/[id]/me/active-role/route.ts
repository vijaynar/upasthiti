// POST /api/v1/orgs/{id}/me/active-role — switch which of the caller's own
// held roles is active in this org (migration 0022). Body: { roleKey }.
import type { NextRequest } from 'next/server';
import { switchActiveRole, NotAuthorizedError } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const roleKey = typeof body?.roleKey === 'string' ? body.roleKey : null;
  if (!roleKey) return jsonError('invalid_input', 'roleKey is required.', 400);

  try {
    await switchActiveRole(session, id, roleKey);
    return jsonData({ activeRoleKey: roleKey });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to switch roles here.', 403);
    throw err;
  }
}
