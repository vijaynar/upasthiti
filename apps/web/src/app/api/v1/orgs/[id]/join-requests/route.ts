// GET/POST /api/v1/orgs/{id}/join-requests (Doc 02 §9 "I'm a parent/student")
import type { NextRequest } from 'next/server';
import { listJoinRequests, createJoinRequest, REQUESTED_ROLES, type RequestedRole } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listJoinRequests(session, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const requestedRole = body?.requestedRole ?? 'student';
  const branchId = typeof body?.branchId === 'string' ? body.branchId : undefined;
  // Guardian requesting on behalf of a ward (Doc 02 §9) — RLS
  // (join_requests_insert_self_or_ward, migration 0008) is the real gate.
  const subjectUserId = typeof body?.subjectUserId === 'string' ? body.subjectUserId : undefined;

  if (!REQUESTED_ROLES.includes(requestedRole)) {
    return jsonError('invalid_role', `requestedRole must be one of ${REQUESTED_ROLES.join(', ')}.`, 400);
  }

  try {
    const joinRequestId = await createJoinRequest(session, {
      organizationId: id,
      branchId,
      requestedRole: requestedRole as RequestedRole,
      subjectUserId,
    });
    return jsonData({ joinRequestId }, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'Could not create a join request.', 403);
    throw err;
  }
}
