// DELETE /api/v1/me/sessions/{id} (Doc 08 §7, Doc 05 §10)
import type { NextRequest } from 'next/server';
import { revokeSession } from '@abhyas/module-identity-auth';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  await revokeSession(session, id);
  return jsonData({ revoked: true });
}
