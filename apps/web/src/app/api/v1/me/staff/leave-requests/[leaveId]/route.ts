// DELETE /api/v1/me/staff/leave-requests/{leaveId} — cancel my own pending leave request
import type { NextRequest } from 'next/server';
import { cancelLeaveRequest, NotAuthorizedError } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ leaveId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { leaveId } = await params;
  try {
    await cancelLeaveRequest(session, leaveId);
    return jsonData({ deleted: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
