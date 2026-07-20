// POST /api/v1/invitations/accept (Doc 02 §9 "I have an invite")
import type { NextRequest } from 'next/server';
import { acceptInvitation, InvitationInvalidError } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!token) return jsonError('invalid_request', 'token is required.', 400);

  try {
    const result = await acceptInvitation(session, token);
    return jsonData(result);
  } catch (err) {
    if (err instanceof InvitationInvalidError) return jsonError('invitation_invalid', err.message, 409);
    throw err;
  }
}
