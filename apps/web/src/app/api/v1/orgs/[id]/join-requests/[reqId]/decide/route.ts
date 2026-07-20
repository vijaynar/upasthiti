// POST /api/v1/orgs/{id}/join-requests/{reqId}/decide (Doc 02 §9)
import type { NextRequest } from 'next/server';
import { decideJoinRequest, JoinRequestInvalidError } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; reqId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { reqId } = await params;
  const body = await req.json().catch(() => null);
  const decision = body?.decision;
  const note = typeof body?.note === 'string' ? body.note : undefined;

  if (decision !== 'approved' && decision !== 'rejected') {
    return jsonError('invalid_request', 'decision must be approved or rejected.', 400);
  }

  try {
    await decideJoinRequest(session, reqId, decision, note);
    return jsonData({ decided: true });
  } catch (err) {
    if (err instanceof JoinRequestInvalidError) return jsonError('join_request_invalid', err.message, 409);
    throw err;
  }
}
