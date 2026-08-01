// PATCH /api/v1/orgs/{id}/announcements/{announcementId} — status
// transitions only (publish a draft now, archive, unarchive). RLS
// (org_announcements_update_staff) is the real gate.
import type { NextRequest } from 'next/server';
import { updateOrgAnnouncementStatus, NotAuthorizedError } from '@abhyas/module-notifications';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const VALID_STATUSES = ['published', 'archived', 'draft'] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; announcementId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { announcementId } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!VALID_STATUSES.includes(status)) {
    return jsonError('invalid_request', `status must be one of ${VALID_STATUSES.join(', ')}.`, 400);
  }

  try {
    await updateOrgAnnouncementStatus(session, { announcementId, status });
    return jsonData({ updated: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
