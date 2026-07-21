// GET/POST /api/v1/me/staff/leave-requests — list / submit my own leave requests
import type { NextRequest } from 'next/server';
import { getMyStaffProfile, listMyLeaveRequests, requestLeave, type LeaveKind } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const LEAVE_KINDS: LeaveKind[] = ['sick', 'casual', 'earned', 'unpaid', 'other'];

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listMyLeaveRequests(session));
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const profile = await getMyStaffProfile(session);
  if (!profile) return jsonError('no_staff_profile', 'You do not have an HR profile in this organization.', 404);

  const body = await req.json().catch(() => null);
  const kind = LEAVE_KINDS.includes(body?.kind) ? (body.kind as LeaveKind) : null;
  const startsOn = typeof body?.startsOn === 'string' ? body.startsOn : '';
  const endsOn = typeof body?.endsOn === 'string' ? body.endsOn : '';
  if (!kind || !startsOn || !endsOn) return jsonError('invalid_request', 'kind, startsOn, and endsOn are required.', 400);

  const leave = await requestLeave(session, {
    staffProfileId: profile.id,
    kind,
    startsOn,
    endsOn,
    reason: typeof body?.reason === 'string' ? body.reason : undefined,
  });
  return jsonData(leave, 201);
}
