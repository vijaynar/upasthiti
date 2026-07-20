// POST/DELETE /api/v1/me/push-subscriptions — not in Doc 08's literal route
// list, a necessary addition for the web-push (VAPID) channel to work at
// all (migration 0012's header point 3): the browser must hand its
// PushManager subscription to the server somewhere.
import type { NextRequest } from 'next/server';
import { subscribeToPush, unsubscribeFromPush } from '@abhyas/module-notifications';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth : '';
  if (!endpoint || !p256dh || !auth) return jsonError('invalid_request', 'endpoint and keys.{p256dh,auth} are required.', 400);

  await subscribeToPush(session, { endpoint, p256dh, auth, userAgent: req.headers.get('user-agent') ?? undefined });
  return jsonData({ subscribed: true });
}

export async function DELETE(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint) return jsonError('invalid_request', 'endpoint is required.', 400);

  await unsubscribeFromPush(session, endpoint);
  return jsonData({ unsubscribed: true });
}
