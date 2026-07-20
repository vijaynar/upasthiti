// GET /api/v1/platform/organizations (Doc 04 US-1 AC5, wireframe 4a/4b)
import type { NextRequest } from 'next/server';
import { listOrganizations, PlatformPermissionError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;

  try {
    return jsonData(await listOrganizations(session, { status, search }));
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
