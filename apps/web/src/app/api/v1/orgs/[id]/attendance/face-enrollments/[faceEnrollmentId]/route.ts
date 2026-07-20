// DELETE /api/v1/orgs/{id}/attendance/face-enrollments/{faceEnrollmentId}
// Revokes one sample (bad capture / re-enrollment). Distinct from the
// consent-withdrawal purge job, which is the compliance-driven path.
import type { NextRequest } from 'next/server';
import { deleteFaceEnrollment, NotAuthorizedError } from '@abhyas/module-attendance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ faceEnrollmentId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { faceEnrollmentId } = await params;
  try {
    await deleteFaceEnrollment(session, faceEnrollmentId);
    return jsonData({ deleted: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
