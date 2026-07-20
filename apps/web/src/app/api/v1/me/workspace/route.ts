// POST /api/v1/me/workspace (Doc 05 §7 — workspace switcher)
import { NextRequest, NextResponse } from 'next/server';
import { switchActiveOrg } from '@abhyas/module-identity-auth';
import { isActiveMember } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, setAccessTokenCookie, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData({ activeOrgId: session.orgId });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const orgId = body?.orgId === null ? null : typeof body?.orgId === 'string' ? body.orgId : undefined;
  if (orgId === undefined) return jsonError('invalid_request', 'orgId must be a string or null.', 400);

  if (orgId !== null) {
    const member = await isActiveMember(session, orgId);
    if (!member) return jsonError('not_a_member', 'You are not an active member of that organization.', 403);
  }

  const { accessToken } = await switchActiveOrg(session, orgId);
  return setAccessTokenCookie(NextResponse.json({ data: { switched: true } }), accessToken);
}
