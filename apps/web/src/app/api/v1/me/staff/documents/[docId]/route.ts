// DELETE /api/v1/me/staff/documents/{docId} — withdraw my own pending document
import type { NextRequest } from 'next/server';
import { deleteStaffDocument, NotAuthorizedError } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { docId } = await params;
  try {
    await deleteStaffDocument(session, docId);
    return jsonData({ deleted: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
