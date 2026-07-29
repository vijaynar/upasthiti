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
import { PageHeader } from '@/components/PageHeader';

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
        <PageHeader badge="Notifications" badgeIcon={Bell} title="Notification settings" description="Choose which alerts reach you, and on which device." />

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">{notice}</div>}

        <section className="glass-panel rounded-xl p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Smartphone className="h-4 w-4 text-indigo-400" /> Push on this device
          </h2>
          {pushEnabled === null ? (
            <p className="text-sm text-slate-400">Checking…</p>
          ) : pushEnabled ? (
            <button onClick={disablePush} className="btn-secondary rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10">
              Disable push here
            </button>
          ) : (
            <button onClick={enablePush} className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold">
              Enable push here
            </button>
          )}
        </section>

        <section className="glass-panel rounded-xl overflow-hidden">
          <div className="border-b border-white/10 px-5 py-3">
            <h2 className="text-sm font-semibold text-white">Alert types</h2>
          </div>
          <ul className="divide-y divide-white/10">
            {KNOWN_KINDS.map(({ kind, label }) => (
              <li key={kind} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-slate-200">{label}</span>
                <div className="flex gap-3">
                  {KNOWN_CHANNELS.map(({ channel, label: chLabel }) => {
                    const enabled = isEnabled(channel, kind);
                    return (
                      <button
                        key={channel}
                        onClick={() => toggle(channel, kind)}
                        className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition ${
                          enabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-400 border border-white/10'
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
