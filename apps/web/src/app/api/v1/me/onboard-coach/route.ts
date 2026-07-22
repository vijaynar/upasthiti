// POST /api/v1/me/onboard-coach (Doc 04 §8 unification) — the coach-profile
// wizard's "self" mode submit: creates the caller's own staff_profiles row
// (if missing) and upserts coach_profiles on top of it, in their active org.
import type { NextRequest } from 'next/server';
import { selfOnboardAsCoach, StaffStateError } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);
  if (!session.orgId) return jsonError('no_workspace', 'Select an active workspace first.', 400);

  const body = await req.json().catch(() => ({}));
  try {
    const profile = await selfOnboardAsCoach(session, {
      organizationId: session.orgId,
      bio: typeof body?.bio === 'string' ? body.bio : undefined,
      experienceYears: typeof body?.experienceYears === 'number' ? body.experienceYears : undefined,
      qualification: typeof body?.qualification === 'string' ? body.qualification : undefined,
      languagesKnown: Array.isArray(body?.languagesKnown) ? body.languagesKnown : undefined,
      sportKeys: Array.isArray(body?.sportKeys) ? body.sportKeys : undefined,
      ageGroups: Array.isArray(body?.ageGroups) ? body.ageGroups : undefined,
      skillLevels: Array.isArray(body?.skillLevels) ? body.skillLevels : undefined,
      serviceTypes: Array.isArray(body?.serviceTypes) ? body.serviceTypes : undefined,
      classTypes: Array.isArray(body?.classTypes) ? body.classTypes : undefined,
    });
    return jsonData(profile, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to onboard here.', 403);
    if (err instanceof StaffStateError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
