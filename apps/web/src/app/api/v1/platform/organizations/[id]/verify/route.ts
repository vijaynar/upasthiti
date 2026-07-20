// POST /api/v1/platform/organizations/{id}/verify (Doc 04 US-1 AC5 — pending -> active/rejected)
import type { NextRequest } from 'next/server';
import { decideOrganizationVerification, PlatformPermissionError, OrganizationStateError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const decision = body?.decision;
  const note = typeof body?.note === 'string' ? body.note : undefined;
  if (decision !== 'approved' && decision !== 'rejected') {
    return jsonError('invalid_request', 'decision must be "approved" or "rejected".', 400);
  }

  try {
    await decideOrganizationVerification(session, id, decision, note);
    return jsonData({ decided: true });
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    if (err instanceof OrganizationStateError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
