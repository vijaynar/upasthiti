// POST /api/v1/orgs/{id}/notifications/send (Doc 08 §21, "scope-checked").
import type { NextRequest } from 'next/server';
import { sendManualNotification, type NotificationChannel } from '@abhyas/module-notifications';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const VALID_CHANNELS: NotificationChannel[] = ['whatsapp', 'sms', 'email', 'push'];
const VALID_LANGUAGES = ['en', 'hi', 'te'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const recipientUserIds = Array.isArray(body?.recipientUserIds) ? body.recipientUserIds.filter((v: unknown) => typeof v === 'string') : [];
  const templateKey = typeof body?.templateKey === 'string' ? body.templateKey.trim() : '';
  const channel = body?.channel;
  const language = body?.language ?? 'en';
  const variables = body?.variables && typeof body.variables === 'object' ? body.variables : {};

  if (recipientUserIds.length === 0) return jsonError('invalid_request', 'recipientUserIds must be a non-empty array.', 400);
  if (!templateKey) return jsonError('invalid_request', 'templateKey is required.', 400);
  if (!VALID_CHANNELS.includes(channel)) return jsonError('invalid_request', `channel must be one of ${VALID_CHANNELS.join(', ')}.`, 400);
  if (!VALID_LANGUAGES.includes(language)) return jsonError('invalid_request', `language must be one of ${VALID_LANGUAGES.join(', ')}.`, 400);

  try {
    const result = await sendManualNotification(session, {
      organizationId: id,
      recipientUserIds,
      templateKey,
      channel,
      language,
      variables,
      refType: typeof body?.refType === 'string' ? body.refType : undefined,
      refId: typeof body?.refId === 'string' ? body.refId : undefined,
    });
    return jsonData(result, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to send notifications here.', 403);
    throw err;
  }
}
