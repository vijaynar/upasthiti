// GET/POST /api/v1/platform/support-access (Doc 04 §9 time-boxed org access)
import type { NextRequest } from 'next/server';
import { listSupportAccessGrants, requestSupportAccess, PlatformPermissionError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('orgId') ?? undefined;
  return jsonData(await listSupportAccessGrants(session, organizationId));
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  const durationHours = typeof body?.durationHours === 'number' ? body.durationHours : 4;
  if (!organizationId || !reason) return jsonError('invalid_request', 'organizationId and reason are required.', 400);

  try {
    const grant = await requestSupportAccess(session, organizationId, reason, durationHours);
    return jsonData(grant, 201);
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
