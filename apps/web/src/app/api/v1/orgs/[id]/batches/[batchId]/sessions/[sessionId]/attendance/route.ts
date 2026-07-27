// GET/POST /api/v1/orgs/{id}/batches/{batchId}/sessions/{sessionId}/attendance
// GET lists the live (non-superseded) attendance_events for this session.
// POST records a first-time check-in (manual/qr/geofence — face check-in has
// its own face-check-in route since it needs the embedding + match flow).
import type { NextRequest } from 'next/server';
import { listAttendanceEvents, recordAttendance, NotAuthorizedError, FeatureDisabledError, type AttendanceStatus, type AttendanceMethod } from '@abhyas/module-attendance';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const VALID_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];
const VALID_METHODS: Exclude<AttendanceMethod, 'override'>[] = ['face', 'qr', 'manual', 'geofence'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { sessionId } = await params;
  return jsonData(await listAttendanceEvents(session, sessionId));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { sessionId } = await params;
  const body = await req.json().catch(() => null);
  const enrollmentId = typeof body?.enrollmentId === 'string' ? body.enrollmentId : '';
  const status = body?.status;
  const method = body?.method;
  const recordedAt = typeof body?.recordedAt === 'string' ? body.recordedAt : undefined;

  if (!enrollmentId) return jsonError('invalid_request', 'enrollmentId is required.', 400);
  if (!VALID_STATUSES.includes(status)) return jsonError('invalid_request', `status must be one of ${VALID_STATUSES.join(', ')}.`, 400);
  if (!VALID_METHODS.includes(method)) return jsonError('invalid_request', `method must be one of ${VALID_METHODS.join(', ')}.`, 400);

  try {
    const event = await recordAttendance(session, { classSessionId: sessionId, enrollmentId, status, method, recordedAt });
    return jsonData(event, 201);
  } catch (err) {
    if (err instanceof FeatureDisabledError) return jsonError('feature_disabled', err.message, 403);
    if (err instanceof NotAuthorizedError || isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to record attendance here.', 403);
    throw err;
  }
}
