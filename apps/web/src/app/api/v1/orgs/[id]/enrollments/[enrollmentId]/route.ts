// GET/PATCH /api/v1/orgs/{id}/enrollments/{enrollmentId} (Doc 07 §6)
import type { NextRequest } from 'next/server';
import { getEnrollment, getEnrollmentDetailed, updateEnrollment, NotAuthorizedError, type EnrollmentStatus } from '@abhyas/module-people';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const VALID_STATUSES: EnrollmentStatus[] = ['active', 'paused', 'completed', 'cancelled'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; enrollmentId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { enrollmentId } = await params;
  const { searchParams } = new URL(req.url);
  // ?detailed=1 joins in student name/photo (Students page "Register Face
  // Key" page needs it on a fresh load) — same opt-in shape as the list route.
  const enrollment = searchParams.get('detailed') === '1' ? await getEnrollmentDetailed(session, enrollmentId) : await getEnrollment(session, enrollmentId);
  if (!enrollment) return jsonError('not_found', 'Enrollment not found.', 404);
  return jsonData(enrollment);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; enrollmentId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { enrollmentId } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return jsonError('invalid_request', `status must be one of ${VALID_STATUSES.join(', ')}.`, 400);
  }

  try {
    await updateEnrollment(session, enrollmentId, {
      status,
      rollNumber: typeof body?.rollNumber === 'string' ? body.rollNumber : undefined,
      profile: typeof body?.profile === 'object' && body?.profile !== null ? body.profile : undefined,
      endedOn: typeof body?.endedOn === 'string' ? body.endedOn : undefined,
    });
    return jsonData({ updated: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
