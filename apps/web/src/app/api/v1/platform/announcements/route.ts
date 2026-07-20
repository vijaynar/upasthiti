// GET/POST /api/v1/platform/announcements (Doc 07 §15, wireframe 4f)
import type { NextRequest } from 'next/server';
import { listAnnouncements, createAnnouncement, PlatformPermissionError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const AUDIENCES = ['all', 'org_admins', 'platform_staff'];

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listAnnouncements(session));
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const audience = body?.audience;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const bodyText = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!AUDIENCES.includes(audience)) return jsonError('invalid_request', `audience must be one of ${AUDIENCES.join(', ')}.`, 400);
  if (!title || !bodyText) return jsonError('invalid_request', 'title and body are required.', 400);

  try {
    const id = await createAnnouncement(session, { audience, title, body: bodyText });
    return jsonData({ id }, 201);
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
