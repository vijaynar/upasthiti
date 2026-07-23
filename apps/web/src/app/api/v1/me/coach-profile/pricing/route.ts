// GET/PUT /api/v1/me/coach-profile/pricing — the caller's own student-facing
// pricing (Doc 04 §8, migration 0018). Mirrors coach-profile/route.ts's
// self-resolution pattern: coachProfileId comes from getMyCoachProfile, not
// the client, so a caller can only ever touch their own pricing rows.
import type { NextRequest } from 'next/server';
import { getMyCoachProfile, getCoachPricing, upsertCoachPricing } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const profile = await getMyCoachProfile(session);
  if (!profile) return jsonData([]);
  return jsonData(await getCoachPricing(session, profile.id));
}

export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const profile = await getMyCoachProfile(session);
  if (!profile) return jsonError('no_coach_profile', 'Complete your coach profile before setting pricing.', 404);

  const body = await req.json().catch(() => ({}));
  const policies = Array.isArray(body?.policies) ? body.policies : [];
  try {
    return jsonData(await upsertCoachPricing(session, { coachProfileId: profile.id, policies }));
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to set pricing.', 403);
    throw err;
  }
}
