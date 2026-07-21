// GET/POST /api/v1/orgs/{id}/staff (Doc 07 §12) — list staff profiles / onboard a member into HR
import type { NextRequest } from 'next/server';
import { listStaffProfiles, onboardStaff, StaffStateError } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listStaffProfiles(session, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const membershipId = typeof body?.membershipId === 'string' ? body.membershipId : '';
  if (!membershipId) return jsonError('invalid_request', 'membershipId is required.', 400);

  try {
    const profile = await onboardStaff(session, {
      organizationId: id,
      membershipId,
      designation: typeof body?.designation === 'string' ? body.designation : undefined,
      employmentType: typeof body?.employmentType === 'string' ? body.employmentType : undefined,
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
    });
    return jsonData(profile, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to onboard staff here.', 403);
    if (err instanceof StaffStateError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
