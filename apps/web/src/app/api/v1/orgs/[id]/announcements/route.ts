// GET/POST /api/v1/orgs/{id}/announcements — org-scoped notice board.
// RLS is the real gate (org_announcements_select_staff / _insert_staff,
// migrations 0008 + 0009); this route only checks for a signed-in session.
import type { NextRequest } from 'next/server';
import {
  listOrgAnnouncements,
  createOrgAnnouncement,
  type OrgAnnouncementTag,
  type OrgAnnouncementAudience,
} from '@abhyas/module-notifications';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const VALID_TAGS: OrgAnnouncementTag[] = ['general', 'event', 'urgent', 'holiday', 'academic'];
const VALID_AUDIENCES: OrgAnnouncementAudience[] = ['all', 'batches'];
const VALID_STATUSES = ['draft', 'scheduled', 'published'] as const;

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
  const tag = typeof body?.tag === 'string' && VALID_TAGS.includes(body.tag) ? (body.tag as OrgAnnouncementTag) : undefined;
  const status =
    typeof body?.status === 'string' && VALID_STATUSES.includes(body.status) ? (body.status as (typeof VALID_STATUSES)[number]) : undefined;
  const audienceType =
    typeof body?.audienceType === 'string' && VALID_AUDIENCES.includes(body.audienceType)
      ? (body.audienceType as OrgAnnouncementAudience)
      : undefined;
  const batchIds = Array.isArray(body?.batchIds) ? body.batchIds.filter((b: unknown) => typeof b === 'string') : undefined;
  const scheduledAt = typeof body?.scheduledAt === 'string' ? body.scheduledAt : undefined;

  if (!title) return jsonError('invalid_request', 'title is required.', 400);
  if (!text) return jsonError('invalid_request', 'body is required.', 400);
  if (audienceType === 'batches' && (!batchIds || batchIds.length === 0)) {
    return jsonError('invalid_request', 'batchIds is required when audienceType is "batches".', 400);
  }
  if (status === 'scheduled' && (!scheduledAt || Number.isNaN(Date.parse(scheduledAt)) || Date.parse(scheduledAt) <= Date.now())) {
    return jsonError('invalid_request', 'scheduledAt must be a valid future timestamp when status is "scheduled".', 400);
  }

  try {
    const announcement = await createOrgAnnouncement(session, {
      organizationId: id,
      title,
      body: text,
      tag,
      status,
      audienceType,
      batchIds,
      scheduledAt,
    });
    return jsonData(announcement, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to publish announcements here.', 403);
    throw err;
  }
}
