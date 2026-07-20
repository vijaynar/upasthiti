// GET/PUT /api/v1/me/notification-preferences (Doc 08 §7). PUT sets ONE
// {channel, kind, enabled} row per call — the resource's primary key is
// composite (user_id, channel, kind), so there's no single "the whole set"
// to PUT; the client calls this once per toggle change.
import type { NextRequest } from 'next/server';
import { getMyPreferences, setMyPreference, type NotificationChannel } from '@abhyas/module-notifications';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const VALID_CHANNELS: NotificationChannel[] = ['whatsapp', 'sms', 'email', 'push'];

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await getMyPreferences(session));
}

export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const channel = body?.channel;
  const kind = typeof body?.kind === 'string' ? body.kind : '';
  const enabled = body?.enabled;

  if (!VALID_CHANNELS.includes(channel)) return jsonError('invalid_request', `channel must be one of ${VALID_CHANNELS.join(', ')}.`, 400);
  if (!kind) return jsonError('invalid_request', 'kind is required.', 400);
  if (typeof enabled !== 'boolean') return jsonError('invalid_request', 'enabled must be a boolean.', 400);

  await setMyPreference(session, { channel, kind, enabled });
  return jsonData({ updated: true });
}
