// GET/POST /api/v1/orgs/{id}/attendance/face-enrollments
// Face samples are per-student (enrollmentId) or per-staff (membershipId),
// not per-batch — Doc 07 §8 + §21.2.
import type { NextRequest } from 'next/server';
import { db } from '@abhyas/platform';
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

  if (!consentId) {
    // SkipConsentID (migration 0016) — on by default, so consentId is
    // optional out of the box. An org can turn this off to require it again.
    const consentSkippable = await db.isOrgFeatureEnabled(id, 'SkipConsentID');
    if (!consentSkippable) return jsonError('invalid_request', 'consentId is required.', 400);
  }
  if (Boolean(enrollmentId) === Boolean(membershipId)) return jsonError('invalid_request', 'exactly one of enrollmentId or membershipId is required.', 400);
  if (!Array.isArray(embedding) || embedding.length !== FACE_EMBEDDING_DIMENSIONS || embedding.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    return jsonError('invalid_request', `embedding must be an array of ${FACE_EMBEDDING_DIMENSIONS} finite numbers.`, 400);
  }

  try {
    const enrollment = await enrollFace(session, { organizationId: id, enrollmentId, membershipId, consentId: consentId || undefined, embedding, qualityScore, sourcePath });
    return jsonData(enrollment, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to enroll a face here.', 403);
    // consentId is caller-supplied free text (staff paste it in from what a
    // guardian/student read out to them, Doc 07 §8) — these two failure
    // modes are expected user error, not server bugs, and used to reach the
    // browser as an uncaught 500 with no JSON body (res.json() on the client
    // then failing with a useless "Unexpected end of JSON input").
    const pgErr = err as { code?: string; message?: string };
    if (pgErr?.code === '22P02') {
      return jsonError('invalid_request', 'That consent ID isn’t a valid ID — double-check for typos.', 400);
    }
    if (pgErr?.code === '23503' || (pgErr?.code === 'P0001' && pgErr.message?.includes('biometric_face consent'))) {
      return jsonError(
        'consent_not_found',
        'No active biometric consent found for this student with that ID. The student (if 18 or older) or their guardian needs to grant consent first — from Family → "Grant biometric consent" — then share the resulting ID with you.',
        400
      );
    }
    throw err;
  }
}
