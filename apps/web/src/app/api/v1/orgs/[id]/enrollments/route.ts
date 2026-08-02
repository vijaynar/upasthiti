// GET/POST /api/v1/orgs/{id}/enrollments (Doc 07 §6)
import type { NextRequest } from 'next/server';
import { enrollStudent, listEnrollments, listEnrollmentsDetailed, findUserByEmail, type EnrollmentStatus } from '@abhyas/module-people';
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

  const input = { organizationId: id, branchId, status: status ?? undefined };
  // ?detailed=1 joins in student name/photo/dob + current batch (Students
  // page); the plain shape stays the default so scheduling/finance/
  // attendance's existing dropdown consumers of this route are unaffected.
  if (searchParams.get('detailed') === '1') {
    return jsonData(await listEnrollmentsDetailed(session, input));
  }
  return jsonData(await listEnrollments(session, input));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const branchId = typeof body?.branchId === 'string' ? body.branchId : '';
  const rawIdentifier = typeof body?.studentUserId === 'string' ? body.studentUserId.trim() : '';
  const startedOn = typeof body?.startedOn === 'string' ? body.startedOn : new Date().toISOString().slice(0, 10);
  const rollNumber = typeof body?.rollNumber === 'string' ? body.rollNumber : undefined;
  const profile = typeof body?.profile === 'object' && body?.profile !== null ? body.profile : undefined;

  if (!branchId || !rawIdentifier) {
    return jsonError('invalid_request', 'branchId and studentUserId (or email) are required.', 400);
  }

  // The Add Student modal accepts either a raw user ID or an email address —
  // an email is resolved to an existing account here, server-side, via the
  // same lookup lib/v2-session's callers already trust for RLS session
  // context (see module-people's findUserByEmail for why this needs a
  // SECURITY DEFINER function rather than a plain query).
  let studentUserId = rawIdentifier;
  if (rawIdentifier.includes('@')) {
    const found = await findUserByEmail(session, rawIdentifier);
    if (!found) {
      return jsonError(
        'user_not_found',
        'No account exists yet for that email. Ask the student to sign in once first, or enter their user ID instead.',
        404
      );
    }
    studentUserId = found.id;
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
