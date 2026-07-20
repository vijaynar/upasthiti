// GET/POST /api/v1/orgs/{id}/enrollments (Doc 07 §6)
import type { NextRequest } from 'next/server';
import { enrollStudent, listEnrollments, type EnrollmentStatus } from '@abhyas/module-people';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const VALID_STATUSES: EnrollmentStatus[] = ['active', 'paused', 'completed', 'cancelled'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get('branchId') ?? undefined;
  const status = searchParams.get('status') as EnrollmentStatus | null;
  if (status && !VALID_STATUSES.includes(status)) {
    return jsonError('invalid_request', `status must be one of ${VALID_STATUSES.join(', ')}.`, 400);
  }

  return jsonData(await listEnrollments(session, { organizationId: id, branchId, status: status ?? undefined }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const branchId = typeof body?.branchId === 'string' ? body.branchId : '';
  const studentUserId = typeof body?.studentUserId === 'string' ? body.studentUserId : '';
  const startedOn = typeof body?.startedOn === 'string' ? body.startedOn : new Date().toISOString().slice(0, 10);
  const rollNumber = typeof body?.rollNumber === 'string' ? body.rollNumber : undefined;
  const profile = typeof body?.profile === 'object' && body?.profile !== null ? body.profile : undefined;

  if (!branchId || !studentUserId) {
    return jsonError('invalid_request', 'branchId and studentUserId are required.', 400);
  }

  try {
    const enrollment = await enrollStudent(session, {
      organizationId: id,
      branchId,
      studentUserId,
      startedOn,
      rollNumber,
      profile,
    });
    return jsonData(enrollment, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to enroll a student here.', 403);
    throw err;
  }
}
