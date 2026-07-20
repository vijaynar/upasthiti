// GET/POST /api/v1/orgs/{id}/invitations (Doc 02 §9 "I have an invite")
import type { NextRequest } from 'next/server';
import { listInvitations, createInvitation } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  try {
    return jsonData(await listInvitations(session, id));
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to view invitations for this organization.', 403);
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' && body.email.trim() ? body.email.trim() : undefined;
  const phone = typeof body?.phone === 'string' && body.phone.trim() ? body.phone.trim() : undefined;
  const branchId = typeof body?.branchId === 'string' ? body.branchId : undefined;
  const roleKeys = Array.isArray(body?.roleKeys) ? body.roleKeys.filter((k: unknown) => typeof k === 'string') : [];

  if (!email && !phone) return jsonError('invalid_request', 'email or phone is required.', 400);

  try {
    const result = await createInvitation(session, { organizationId: id, branchId, email, phone, roleKeys });
    return jsonData(result, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to invite to this organization.', 403);
    throw err;
  }
}
