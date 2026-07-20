// POST /api/v1/orgs/{id}/members/{membershipId}/roles (Doc 04 §8 grant)
import type { NextRequest } from 'next/server';
import { grantRole, RoleGrantNotAllowedError, UnknownRoleError, NotAuthorizedError } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; membershipId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id, membershipId } = await params;
  const body = await req.json().catch(() => null);
  const roleKey = typeof body?.roleKey === 'string' ? body.roleKey : '';
  if (!roleKey) return jsonError('invalid_request', 'roleKey is required.', 400);

  try {
    await grantRole(session, id, membershipId, roleKey);
    return jsonData({ granted: true }, 201);
  } catch (err) {
    if (err instanceof UnknownRoleError) return jsonError('unknown_role', err.message, 400);
    if (err instanceof RoleGrantNotAllowedError) return jsonError('forbidden', err.message, 403);
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to grant roles here.', 403);
    throw err;
  }
}
