// GET/POST /api/v1/orgs/{id}/announcements — org-scoped notice board.
// RLS is the real gate (org_announcements_select_staff / _insert_staff,
// migration 0008); this route only checks for a signed-in session.
import type { NextRequest } from 'next/server';
import { listOrgAnnouncements, createOrgAnnouncement } from '@abhyas/module-notifications';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listOrgAnnouncements(session, { organizationId: id }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const text = typeof body?.body === 'string' ? body.body.trim() : '';

  if (!title) return jsonError('invalid_request', 'title is required.', 400);
  if (!text) return jsonError('invalid_request', 'body is required.', 400);

  try {
    const announcement = await createOrgAnnouncement(session, { organizationId: id, title, body: text });
    return jsonData(announcement, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to publish announcements here.', 403);
    throw err;
  }
}
