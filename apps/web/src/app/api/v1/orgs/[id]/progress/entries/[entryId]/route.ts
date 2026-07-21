// DELETE /api/v1/orgs/{id}/progress/entries/{entryId} — remove a mis-logged progress entry
import type { NextRequest } from 'next/server';
import { deleteProgressEntry, NotAuthorizedError } from '@abhyas/module-progress';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { entryId } = await params;
  try {
    await deleteProgressEntry(session, entryId);
    return jsonData({ deleted: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
