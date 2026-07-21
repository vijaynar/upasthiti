// PATCH/DELETE /api/v1/orgs/{id}/staff/{staffId}/documents/{docId} — review / remove a document
import type { NextRequest } from 'next/server';
import { reviewStaffDocument, deleteStaffDocument, NotAuthorizedError } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { docId } = await params;
  const body = await req.json().catch(() => null);
  const decision = body?.decision === 'approved' || body?.decision === 'rejected' ? body.decision : null;
  if (!decision) return jsonError('invalid_request', "decision must be 'approved' or 'rejected'.", 400);

  try {
    await reviewStaffDocument(session, docId, decision, typeof body?.note === 'string' ? body.note : undefined);
    return jsonData({ updated: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}

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
