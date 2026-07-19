// GET/PATCH /api/v1/me (Doc 08 §7)
import type { NextRequest } from 'next/server';
import { getProfile, updateProfile } from '@abhyas/module-identity-auth';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const profile = await getProfile(session);
  if (!profile) return jsonError('not_found', 'Profile not found.', 404);
  return jsonData(profile);
}

export async function PATCH(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => ({}));
  await updateProfile(session, {
    displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
    dob: 'dob' in body ? body.dob : undefined,
    locale: typeof body.locale === 'string' ? body.locale : undefined,
    timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
  });
  return jsonData({ updated: true });
}
