// GET/POST /api/v1/orgs/{id}/progress/entries — list a student's entries (?enrollmentId=&metricKey=) / log a value
import type { NextRequest } from 'next/server';
import { listProgressForEnrollment, logProgress, EnrollmentNotVisibleError } from '@abhyas/module-progress';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { searchParams } = new URL(req.url);
  const enrollmentId = searchParams.get('enrollmentId');
  if (!enrollmentId) return jsonError('invalid_request', 'enrollmentId is required.', 400);
  const metricKey = searchParams.get('metricKey') ?? undefined;
  return jsonData(await listProgressForEnrollment(session, enrollmentId, metricKey));
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const enrollmentId = typeof body?.enrollmentId === 'string' ? body.enrollmentId : '';
  const metricKey = typeof body?.metricKey === 'string' ? body.metricKey : '';
  const value = typeof body?.value === 'number' ? body.value : Number(body?.value);
  const recordedOn = typeof body?.recordedOn === 'string' ? body.recordedOn : '';
  if (!enrollmentId || !metricKey || !recordedOn || Number.isNaN(value)) {
    return jsonError('invalid_request', 'enrollmentId, metricKey, numeric value, and recordedOn are required.', 400);
  }

  try {
    const entry = await logProgress(session, {
      enrollmentId,
      metricKey,
      value,
      note: typeof body?.note === 'string' ? body.note : undefined,
      recordedOn,
    });
    return jsonData(entry, 201);
  } catch (err) {
    if (err instanceof EnrollmentNotVisibleError) return jsonError('not_found', err.message, 404);
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to log progress for this student.', 403);
    throw err;
  }
}
