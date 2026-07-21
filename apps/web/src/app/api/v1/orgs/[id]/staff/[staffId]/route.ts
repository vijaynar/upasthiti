// PATCH /api/v1/orgs/{id}/staff/{staffId} — update a staff profile (designation, status, notes)
import type { NextRequest } from 'next/server';
import { updateStaffProfile, NotAuthorizedError } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId } = await params;
  const body = await req.json().catch(() => null);

  try {
    await updateStaffProfile(session, staffId, {
      designation: typeof body?.designation === 'string' ? body.designation : undefined,
      employmentType: typeof body?.employmentType === 'string' ? body.employmentType : undefined,
      status: typeof body?.status === 'string' ? body.status : undefined,
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
    });
    return jsonData({ updated: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
