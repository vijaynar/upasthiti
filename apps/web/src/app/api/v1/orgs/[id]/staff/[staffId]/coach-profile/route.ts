// GET/PUT /api/v1/orgs/{id}/staff/{staffId}/coach-profile — an HR admin
// filling out (or viewing) a member's coach professional profile on their
// behalf (Doc 04 §8 path: org-added coach). Same upsertCoachProfile the
// self-serve wizard uses; RLS (hr.staff.onboard) is what makes this an
// admin-only write path here, not app-layer role checks.
import type { NextRequest } from 'next/server';
import { getCoachProfile, upsertCoachProfile, StaffStateError } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId } = await params;
  return jsonData(await getCoachProfile(session, staffId));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const profile = await upsertCoachProfile(session, {
      staffProfileId: staffId,
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
    return jsonData(profile);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to edit this coach profile.', 403);
    if (err instanceof StaffStateError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
