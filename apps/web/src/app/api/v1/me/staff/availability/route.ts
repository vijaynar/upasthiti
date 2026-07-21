// GET/PUT /api/v1/me/staff/availability — view / set my own weekly availability
import type { NextRequest } from 'next/server';
import { getMyStaffProfile, listAvailability, setAvailability } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const profile = await getMyStaffProfile(session);
  if (!profile) return jsonData([]);
  return jsonData(await listAvailability(session, profile.id));
}

export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const profile = await getMyStaffProfile(session);
  if (!profile) return jsonError('no_staff_profile', 'You do not have an HR profile in this organization.', 404);

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.slots)) return jsonError('invalid_request', 'slots array is required.', 400);
  for (const slot of body.slots) {
    if (
      typeof slot?.dayOfWeek !== 'number' ||
      slot.dayOfWeek < 1 ||
      slot.dayOfWeek > 7 ||
      typeof slot?.startTime !== 'string' ||
      typeof slot?.endTime !== 'string' ||
      slot.startTime >= slot.endTime
    ) {
      return jsonError('invalid_request', 'Each slot needs dayOfWeek (1-7), startTime, and endTime, with endTime after startTime.', 400);
    }
  }

  const slots = await setAvailability(session, { staffProfileId: profile.id, slots: body.slots });
  return jsonData(slots);
}
