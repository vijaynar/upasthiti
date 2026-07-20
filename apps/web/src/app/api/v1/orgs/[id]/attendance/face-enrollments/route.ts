// GET/POST /api/v1/orgs/{id}/attendance/face-enrollments
// Face samples are per-student (enrollmentId) or per-staff (membershipId),
// not per-batch — Doc 07 §8 + §21.2.
import type { NextRequest } from 'next/server';
import { enrollFace, listFaceEnrollments, FACE_EMBEDDING_DIMENSIONS } from '@abhyas/module-attendance';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { searchParams } = new URL(req.url);
  const enrollmentId = searchParams.get('enrollmentId') ?? undefined;
  const membershipId = searchParams.get('membershipId') ?? undefined;
  if (!enrollmentId && !membershipId) return jsonError('invalid_request', 'enrollmentId or membershipId query param is required.', 400);

  return jsonData(await listFaceEnrollments(session, { enrollmentId, membershipId }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const enrollmentId = typeof body?.enrollmentId === 'string' ? body.enrollmentId : undefined;
  const membershipId = typeof body?.membershipId === 'string' ? body.membershipId : undefined;
  const consentId = typeof body?.consentId === 'string' ? body.consentId : '';
  const embedding = body?.embedding;
  const qualityScore = typeof body?.qualityScore === 'number' ? body.qualityScore : undefined;
  const sourcePath = typeof body?.sourcePath === 'string' ? body.sourcePath : undefined;

  if (!consentId) return jsonError('invalid_request', 'consentId is required.', 400);
  if (Boolean(enrollmentId) === Boolean(membershipId)) return jsonError('invalid_request', 'exactly one of enrollmentId or membershipId is required.', 400);
  if (!Array.isArray(embedding) || embedding.length !== FACE_EMBEDDING_DIMENSIONS || embedding.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    return jsonError('invalid_request', `embedding must be an array of ${FACE_EMBEDDING_DIMENSIONS} finite numbers.`, 400);
  }

  try {
    const enrollment = await enrollFace(session, { organizationId: id, enrollmentId, membershipId, consentId, embedding, qualityScore, sourcePath });
    return jsonData(enrollment, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to enroll a face here.', 403);
    throw err;
  }
}
