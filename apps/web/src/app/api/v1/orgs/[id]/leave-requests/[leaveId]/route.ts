// PATCH /api/v1/orgs/{id}/leave-requests/{leaveId} — approve or reject a leave request
import type { NextRequest } from 'next/server';
import { decideLeaveRequest, NotAuthorizedError, StaffStateError } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ leaveId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { leaveId } = await params;
  const body = await req.json().catch(() => null);
  const decision = body?.decision === 'approved' || body?.decision === 'rejected' ? body.decision : null;
  if (!decision) return jsonError('invalid_request', "decision must be 'approved' or 'rejected'.", 400);

  try {
    await decideLeaveRequest(session, leaveId, decision, typeof body?.note === 'string' ? body.note : undefined);
    return jsonData({ updated: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    if (err instanceof StaffStateError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
