// GET/POST /api/v1/orgs/{id}/attendance/staff-check-in (Doc 07 §21.2)
// Staff self check-in/out — a separate table from student attendance
// (payroll, not fees). GET requires membershipId (self or, for staff with
// attendance.read, any membership at their branch scope).
import type { NextRequest } from 'next/server';
import { recordStaffAttendance, listStaffAttendance, type StaffAttendanceKind, type StaffAttendanceMethod } from '@abhyas/module-attendance';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const VALID_KINDS: StaffAttendanceKind[] = ['check_in', 'check_out'];
const VALID_METHODS: StaffAttendanceMethod[] = ['selfie_face', 'manual', 'admin_override'];

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { searchParams } = new URL(req.url);
  const membershipId = searchParams.get('membershipId') ?? '';
  if (!membershipId) return jsonError('invalid_request', 'membershipId query param is required.', 400);

  return jsonData(await listStaffAttendance(session, membershipId));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const branchId = typeof body?.branchId === 'string' ? body.branchId : '';
  const membershipId = typeof body?.membershipId === 'string' ? body.membershipId : '';
  const kind = body?.kind;
  const method = body?.method;
  const confidence = typeof body?.confidence === 'number' ? body.confidence : undefined;

  if (!branchId || !membershipId) return jsonError('invalid_request', 'branchId and membershipId are required.', 400);
  if (!VALID_KINDS.includes(kind)) return jsonError('invalid_request', `kind must be one of ${VALID_KINDS.join(', ')}.`, 400);
  if (!VALID_METHODS.includes(method)) return jsonError('invalid_request', `method must be one of ${VALID_METHODS.join(', ')}.`, 400);

  try {
    const event = await recordStaffAttendance(session, { organizationId: id, branchId, membershipId, kind, method, confidence });
    return jsonData(event, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to record this check-in.', 403);
    throw err;
  }
}
