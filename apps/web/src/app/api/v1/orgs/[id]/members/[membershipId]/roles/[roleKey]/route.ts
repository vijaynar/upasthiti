// DELETE /api/v1/orgs/{id}/members/{membershipId}/roles/{roleKey} (Doc 04 §8 revoke)
import type { NextRequest } from 'next/server';
import { revokeRole, RoleGrantNotAllowedError, UnknownRoleError, NotAuthorizedError } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; membershipId: string; roleKey: string }> }
) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id, membershipId, roleKey } = await params;
  try {
    await revokeRole(session, id, membershipId, roleKey);
    return jsonData({ revoked: true });
  } catch (err) {
    if (err instanceof UnknownRoleError) return jsonError('unknown_role', err.message, 400);
    if (err instanceof RoleGrantNotAllowedError) return jsonError('forbidden', err.message, 403);
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to revoke roles here.', 403);
    throw err;
  }
}
