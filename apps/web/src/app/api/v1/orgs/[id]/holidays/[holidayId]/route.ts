// DELETE /api/v1/orgs/{id}/holidays/{holidayId}
import type { NextRequest } from 'next/server';
import { deleteHoliday, NotAuthorizedError } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; holidayId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { holidayId } = await params;
  try {
    await deleteHoliday(session, holidayId);
    return jsonData({ deleted: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
