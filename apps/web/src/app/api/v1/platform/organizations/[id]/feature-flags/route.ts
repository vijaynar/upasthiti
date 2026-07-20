// GET/POST /api/v1/platform/organizations/{id}/feature-flags (Doc 07 §15 org_feature_flags)
import type { NextRequest } from 'next/server';
import { listOrgFeatureFlags, setOrgFeatureFlag, PlatformPermissionError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listOrgFeatureFlags(session, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const flagKey = typeof body?.flagKey === 'string' ? body.flagKey : '';
  const enabled = typeof body?.enabled === 'boolean' ? body.enabled : null;
  if (!flagKey || enabled === null) return jsonError('invalid_request', 'flagKey and enabled are required.', 400);

  try {
    await setOrgFeatureFlag(session, id, flagKey, enabled);
    return jsonData({ ok: true });
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
