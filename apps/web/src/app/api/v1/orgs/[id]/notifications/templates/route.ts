// GET/POST /api/v1/orgs/{id}/notifications/templates (Doc 08 §21). POST
// upserts by (organizationId, key, channel, language) — matches
// migration 0012's partial unique index, no separate PATCH-by-id route.
import type { NextRequest } from 'next/server';
import { listTemplates, upsertTemplate, type NotificationChannel } from '@abhyas/module-notifications';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const VALID_CHANNELS: NotificationChannel[] = ['whatsapp', 'sms', 'email', 'push'];
const VALID_LANGUAGES = ['en', 'hi', 'te'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listTemplates(session, { organizationId: id }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const channel = body?.channel;
  const language = body?.language;
  const bodyText = typeof body?.body === 'string' ? body.body : '';
  const variables = Array.isArray(body?.variables) ? body.variables.filter((v: unknown) => typeof v === 'string') : undefined;

  if (!key) return jsonError('invalid_request', 'key is required.', 400);
  if (!VALID_CHANNELS.includes(channel)) return jsonError('invalid_request', `channel must be one of ${VALID_CHANNELS.join(', ')}.`, 400);
  if (!VALID_LANGUAGES.includes(language)) return jsonError('invalid_request', `language must be one of ${VALID_LANGUAGES.join(', ')}.`, 400);
  if (!bodyText) return jsonError('invalid_request', 'body is required.', 400);

  try {
    const template = await upsertTemplate(session, { organizationId: id, key, channel, language, body: bodyText, variables });
    return jsonData(template, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to manage notification templates here.', 403);
    throw err;
  }
}
