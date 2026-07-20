// DELETE /api/v1/platform/support-access/{id} (Doc 04 §9 revoke)
import type { NextRequest } from 'next/server';
import { revokeSupportAccessGrant, PlatformPermissionError, SupportGrantInvalidError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  try {
    await revokeSupportAccessGrant(session, id);
    return jsonData({ revoked: true });
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    if (err instanceof SupportGrantInvalidError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
