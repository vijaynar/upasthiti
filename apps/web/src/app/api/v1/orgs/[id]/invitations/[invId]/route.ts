// DELETE /api/v1/orgs/{id}/invitations/{invId} (revoke, Doc 02 §9)
import type { NextRequest } from 'next/server';
import { revokeInvitation, NotAuthorizedError } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; invId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { invId } = await params;
  try {
    await revokeInvitation(session, invId);
    return jsonData({ revoked: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
