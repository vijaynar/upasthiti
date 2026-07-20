// GET/POST /api/v1/platform/feature-flags (Doc 07 §15, wireframe 4j)
import type { NextRequest } from 'next/server';
import { listFeatureFlags, upsertFeatureFlag, PlatformPermissionError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listFeatureFlags(session));
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const defaultOn = typeof body?.defaultOn === 'boolean' ? body.defaultOn : false;
  const description = typeof body?.description === 'string' ? body.description : undefined;
  if (!key) return jsonError('invalid_request', 'key is required.', 400);

  try {
    await upsertFeatureFlag(session, key, defaultOn, description);
    return jsonData({ ok: true }, 201);
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
