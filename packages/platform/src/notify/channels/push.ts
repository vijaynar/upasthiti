import webpush from 'web-push';
import type { SendResult } from '../index';

// Real v1 channel (2026-07-19 locked scope decision), Web Push (VAPID)
// rather than the FCM/APNs vendor pairing Doc 14 §7's adapter table names —
// FCM/APNs both require a paid vendor project (same "designed, not
// configured" category as WhatsApp BSP/SMS DLT/Razorpay: no credentials
// exist in this environment). VAPID needs no vendor account at all — just a
// self-generated keypair (`npm run keys:generate:vapid`, same shape as this
// repo's own JWT RS256 keypair script) — so it's the one push transport that
// can actually be real and verifiable here rather than another
// `not_configured` stub, matching this project's existing bias toward
// self-hosted/portable infra over vendor lock-in (Doc 02 §11).
//
// Browser-side: apps/web/public/sw.js handles the `push` event: a
// subscription is a { endpoint, keys: { p256dh, auth } } object the browser
// hands back from `PushManager.subscribe()`, persisted in
// push_subscriptions (migration 0012) and passed back here unchanged.

export interface PushSubscriptionKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:support@abhyas.local';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export async function sendPush(target: { subscription: PushSubscriptionKeys; title: string; body: string }): Promise<SendResult> {
  if (!ensureConfigured()) {
    return { status: 'not_configured', error: 'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — run npm run keys:generate:vapid' };
  }
  try {
    await webpush.sendNotification(
      target.subscription,
      JSON.stringify({ title: target.title, body: target.body })
    );
    return { status: 'sent' };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}
