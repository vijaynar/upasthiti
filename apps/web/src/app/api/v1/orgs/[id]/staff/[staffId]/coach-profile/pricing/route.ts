// GET/PUT /api/v1/orgs/{id}/staff/{staffId}/coach-profile/pricing — an HR
// admin viewing/setting a member's student-facing pricing on their behalf.
// Same coach_pricing_policies RLS (self OR hr.staff.onboard) as
// coach-profile/route.ts's admin path.
import type { NextRequest } from 'next/server';
import { getCoachProfile, getCoachPricing, upsertCoachPricing, StaffStateError } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId } = await params;
  const profile = await getCoachProfile(session, staffId);
  if (!profile) return jsonData([]);
  return jsonData(await getCoachPricing(session, profile.id));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId } = await params;
  const profile = await getCoachProfile(session, staffId);
  if (!profile) return jsonError('not_found', 'This member has no coach profile yet.', 404);

  const body = await req.json().catch(() => ({}));
  const policies = Array.isArray(body?.policies) ? body.policies : [];
  try {
    return jsonData(await upsertCoachPricing(session, { coachProfileId: profile.id, policies }));
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to set pricing for this member.', 403);
    if (err instanceof StaffStateError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
