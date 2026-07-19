// DELETE /api/v1/me/auth-methods/{id} (Doc 08 §7, Doc 05 §5 — unlink)
import type { NextRequest } from 'next/server';
import { unlinkAuthMethod } from '@abhyas/module-identity-auth';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  try {
    await unlinkAuthMethod(session, id);
    return jsonData({ unlinked: true });
  } catch (err) {
    // The >=1-verified-method deferred trigger (migration 0003) rejects
    // this at COMMIT — surface it as a normal domain error, not a 500.
    return jsonError('last_auth_method', err instanceof Error ? err.message : 'Cannot unlink.', 422);
  }
}
