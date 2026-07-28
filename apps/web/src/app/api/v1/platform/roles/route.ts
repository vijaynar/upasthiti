// GET/POST /api/v1/platform/roles (Doc 04 §3 platform role catalogue)
import type { NextRequest } from 'next/server';
import { listPlatformRoleAssignments, listAllSystemRoles, grantPlatformRole, PlatformPermissionError, UnknownPlatformRoleError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  try {
    const assignments = await listPlatformRoleAssignments(session);
    const systemRoles = await listAllSystemRoles(session);
    return jsonData({ assignments, systemRoles });
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const roleKey = typeof body?.roleKey === 'string' ? body.roleKey : '';
  if (!userId || !roleKey) return jsonError('invalid_request', 'userId and roleKey are required.', 400);

  try {
    await grantPlatformRole(session, userId, roleKey);
    return jsonData({ granted: true }, 201);
  } catch (err) {
    if (err instanceof UnknownPlatformRoleError) return jsonError('unknown_role', err.message, 400);
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
