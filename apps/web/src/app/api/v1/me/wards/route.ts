// GET/POST /api/v1/me/wards (Doc 02 §9 "I'm a parent/student", Doc 04 §7)
import type { NextRequest } from 'next/server';
import { addWard, listWards } from '@abhyas/module-identity-auth';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const VALID_RELATIONSHIPS = ['father', 'mother', 'guardian'];

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listWards(session));
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const relationship = body?.relationship;
  const dob = typeof body?.dob === 'string' ? body.dob : undefined;
  const consentAuthority = typeof body?.consentAuthority === 'boolean' ? body.consentAuthority : undefined;

  if (!displayName) return jsonError('invalid_request', 'displayName is required.', 400);
  if (!VALID_RELATIONSHIPS.includes(relationship)) {
    return jsonError('invalid_relationship', `relationship must be one of ${VALID_RELATIONSHIPS.join(', ')}.`, 400);
  }

  const ward = await addWard(session, { displayName, dob, relationship, consentAuthority });
  return jsonData(ward, 201);
}
