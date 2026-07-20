// POST /api/v1/orgs/{id}/batches/{batchId}/sessions/{sessionId}/attendance/override
// Appends a correction row and supersedes whatever was live before it
// (Doc 07 §8: "corrections append, never edit") — requires attendance.override.
import type { NextRequest } from 'next/server';
import { overrideAttendance, NotAuthorizedError, type AttendanceStatus } from '@abhyas/module-attendance';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const VALID_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { sessionId } = await params;
  const body = await req.json().catch(() => null);
  const enrollmentId = typeof body?.enrollmentId === 'string' ? body.enrollmentId : '';
  const status = body?.status;

  if (!enrollmentId) return jsonError('invalid_request', 'enrollmentId is required.', 400);
  if (!VALID_STATUSES.includes(status)) return jsonError('invalid_request', `status must be one of ${VALID_STATUSES.join(', ')}.`, 400);

  try {
    const event = await overrideAttendance(session, { classSessionId: sessionId, enrollmentId, status });
    return jsonData(event, 201);
  } catch (err) {
    if (err instanceof NotAuthorizedError || isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to override attendance here.', 403);
    throw err;
  }
}
