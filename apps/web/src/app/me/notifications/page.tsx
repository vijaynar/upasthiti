'use client';

// Self-service notification preferences + push subscribe (Doc 08 §7
// `GET/PUT /me/notification-preferences`) — available to any signed-in
// user regardless of role (Doc 04 §4: "own notification prefs" is an
// identity right, not a permission), unlike /notifications which is the
// org-scoped staff console. Standalone from /family for the same reason
// /workspace is standalone from /onboarding: this is a settings page a
// user revisits, not part of a one-time flow.

import { useEffect, useState } from 'react';
import { Bell, BellOff, Smartphone } from 'lucide-react';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

type Channel = 'whatsapp' | 'sms' | 'email' | 'push';

interface Preference {
  channel: Channel;
  kind: string;
  enabled: boolean;
}

// Known kinds this v1 build actually dispatches — a real "discover every
// kind that's ever fired" view would need a distinct-kinds endpoint this
// phase doesn't build; same "service+routes real, UI polish later"
// precedent every prior phase has used for an interim list.
const KNOWN_KINDS: { kind: string; label: string }[] = [{ kind: 'attendance.absence_confirmed', label: 'Absence alerts' }];
const KNOWN_CHANNELS: { channel: Channel; label: string }[] = [
  { channel: 'email', label: 'Email' },
  { channel: 'push', label: 'Push' },
];

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const array = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) array[i] = rawData.charCodeAt(i);
  return array;
}

export default function MyNotificationsPage() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<Preference[]>('/api/v1/me/notification-preferences').then(setPreferences).catch((err) => setError(err.message));
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => setPushEnabled(!!sub))
        .catch(() => setPushEnabled(false));
    } else {
      setPushEnabled(false);
    }
  }, []);

  function isEnabled(channel: Channel, kind: string): boolean {
    const pref = preferences.find((p) => p.channel === channel && p.kind === kind);
    return pref?.enabled ?? true; // opt-out model: no row = enabled
  }

  async function toggle(channel: Channel, kind: string) {
    setError(null);
    const next = !isEnabled(channel, kind);
    try {
      await api('/api/v1/me/notification-preferences', { method: 'PUT', body: JSON.stringify({ channel, kind, enabled: next }) });
      setPreferences((prev) => {
        const rest = prev.filter((p) => !(p.channel === channel && p.kind === kind));
        return [...rest, { channel, kind, enabled: next }];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function enablePush() {
    setError(null);
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error('Push notifications are not configured on this server yet.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = subscription.toJSON();
      await api('/api/v1/me/push-subscriptions', {
        method: 'POST',
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setPushEnabled(true);
      setNotice('Push notifications enabled on this device.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable push notifications.');
    }
  }

  async function disablePush() {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api('/api/v1/me/push-subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setPushEnabled(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable push notifications.');
    }
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold text-neutral-900">
            <Bell className="h-5 w-5 text-neutral-500" /> Notification settings
          </h1>
          <p className="text-sm text-neutral-500">Choose which alerts reach you, and on which device.</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <Smartphone className="h-4 w-4 text-neutral-400" /> Push on this device
          </h2>
          {pushEnabled === null ? (
            <p className="text-sm text-neutral-400">Checking…</p>
          ) : pushEnabled ? (
            <button onClick={disablePush} className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200">
              Disable push here
            </button>
          ) : (
            <button onClick={enablePush} className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700">
              Enable push here
            </button>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">Alert types</h2>
          </div>
          <ul className="divide-y divide-neutral-100">
            {KNOWN_KINDS.map(({ kind, label }) => (
              <li key={kind} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-neutral-800">{label}</span>
                <div className="flex gap-3">
                  {KNOWN_CHANNELS.map(({ channel, label: chLabel }) => {
                    const enabled = isEnabled(channel, kind);
                    return (
                      <button
                        key={channel}
                        onClick={() => toggle(channel, kind)}
                        className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                          enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-400'
                        }`}
                      >
                        {enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />} {chLabel}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
