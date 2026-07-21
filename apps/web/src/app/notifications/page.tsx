'use client';

// Notifications console (Doc 07 §10, Doc 04 §5 "Notifications
// (manual/templates)" row) — staff view for the active workspace:
// templates, manual send, and the delivery log. Mirrors /scheduling,
// /attendance, /finance's plain-fetch client component style.

import { useEffect, useState } from 'react';
import { Bell, Send, ScrollText, FileText } from 'lucide-react';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

type Channel = 'whatsapp' | 'sms' | 'email' | 'push';
type Language = 'en' | 'hi' | 'te';
type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'fallback';

interface Template {
  id: string;
  organizationId: string | null;
  key: string;
  channel: Channel;
  language: Language;
  body: string;
}

interface Delivery {
  id: string;
  recipientUserId: string;
  templateKey: string;
  channel: Channel;
  status: DeliveryStatus;
  error: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<DeliveryStatus, string> = {
  queued: 'bg-amber-100 text-amber-700',
  sent: 'bg-emerald-100 text-emerald-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  fallback: 'bg-blue-100 text-blue-700',
};

export default function NotificationsPage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace').then((w) => setOrgId(w.activeOrgId));
  }, []);

  function reloadAll() {
    if (!orgId) return;
    api<Template[]>(`/api/v1/orgs/${orgId}/notifications/templates`).then(setTemplates).catch((err) => setError(err.message));
    api<Delivery[]>(`/api/v1/orgs/${orgId}/notifications/log`).then(setDeliveries).catch((err) => setError(err.message));
  }

  useEffect(reloadAll, [orgId]);

  async function run(action: () => Promise<unknown>, successMsg?: string) {
    setError(null);
    try {
      await action();
      if (successMsg) setNotice(successMsg);
      reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  if (orgId === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  if (orgId === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-sm space-y-2 rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <Bell className="mx-auto h-8 w-8 text-neutral-300" />
          <h1 className="text-lg font-semibold text-neutral-900">Notifications</h1>
          <p className="text-sm text-neutral-500">Pick an active workspace first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold text-neutral-900">
            <Bell className="h-5 w-5 text-neutral-500" /> Notifications
          </h1>
          <p className="text-sm text-neutral-500">Templates, manual sends, and the delivery log for the active workspace.</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

        <TemplatesSection orgId={orgId} templates={templates} run={run} />
        <SendSection orgId={orgId} templates={templates} run={run} />
        <LogSection deliveries={deliveries} />
      </div>
    </div>
  );
}

function TemplatesSection({
  orgId,
  templates,
  run,
}: {
  orgId: string;
  templates: Template[];
  run: (action: () => Promise<unknown>, successMsg?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [channel, setChannel] = useState<Channel>('email');
  const [language, setLanguage] = useState<Language>('en');
  const [body, setBody] = useState('');

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <FileText className="h-4 w-4 text-neutral-400" /> Templates
        </h2>
        <button onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-neutral-600 hover:text-neutral-900">
          {open ? 'Cancel' : '+ New / edit'}
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-b border-neutral-100 px-5 py-3">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Key, e.g. finance.payment_reminder" className="w-full rounded border border-neutral-200 px-2 py-1 text-sm" />
          <div className="flex gap-2">
            <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="rounded border border-neutral-200 px-2 py-1 text-sm">
              <option value="email">Email</option>
              <option value="push">Push</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
            <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="rounded border border-neutral-200 px-2 py-1 text-sm">
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="te">Telugu</option>
            </select>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Body — use {{variableName}} placeholders"
            rows={2}
            className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
          />
          <button
            onClick={() =>
              run(() => api(`/api/v1/orgs/${orgId}/notifications/templates`, { method: 'POST', body: JSON.stringify({ key, channel, language, body }) }), 'Template saved.')
            }
            className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
          >
            Save template
          </button>
        </div>
      )}

      <ul className="divide-y divide-neutral-100">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center justify-between px-5 py-2 text-sm">
            <div>
              <span className="font-medium text-neutral-900">{t.key}</span>
              <span className="ml-2 text-xs text-neutral-500">
                {t.channel} · {t.language} {t.organizationId === null && '· platform library'}
              </span>
            </div>
            <span className="max-w-xs truncate text-xs text-neutral-400">{t.body}</span>
          </li>
        ))}
        {templates.length === 0 && <li className="px-5 py-3 text-sm text-neutral-400">No templates yet.</li>}
      </ul>
    </section>
  );
}

function SendSection({
  orgId,
  templates,
  run,
}: {
  orgId: string;
  templates: Template[];
  run: (action: () => Promise<unknown>, successMsg?: string) => Promise<void>;
}) {
  const [recipients, setRecipients] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [channel, setChannel] = useState<Channel>('email');
  const [language, setLanguage] = useState<Language>('en');
  const [variables, setVariables] = useState('{}');

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <Send className="h-4 w-4 text-neutral-400" /> Send manually
        </h2>
      </div>
      <div className="space-y-2 px-5 py-3">
        <input
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          placeholder="Recipient user IDs, comma-separated"
          className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value)}
            placeholder="Template key"
            className="flex-1 rounded border border-neutral-200 px-2 py-1 text-sm"
          />
          <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="rounded border border-neutral-200 px-2 py-1 text-sm">
            <option value="email">Email</option>
            <option value="push">Push</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
          </select>
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="rounded border border-neutral-200 px-2 py-1 text-sm">
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="te">Telugu</option>
          </select>
        </div>
        <textarea
          value={variables}
          onChange={(e) => setVariables(e.target.value)}
          rows={2}
          placeholder='Variables JSON, e.g. {"studentName": "Asha"}'
          className="w-full rounded border border-neutral-200 px-2 py-1 font-mono text-xs"
        />
        <button
          onClick={() =>
            run(async () => {
              let parsedVariables: Record<string, unknown> = {};
              try {
                parsedVariables = JSON.parse(variables || '{}');
              } catch {
                throw new Error('Variables must be valid JSON.');
              }
              return api(`/api/v1/orgs/${orgId}/notifications/send`, {
                method: 'POST',
                body: JSON.stringify({
                  recipientUserIds: recipients.split(',').map((r) => r.trim()).filter(Boolean),
                  templateKey,
                  channel,
                  language,
                  variables: parsedVariables,
                }),
              });
            }, 'Notification queued for delivery.')
          }
          className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
        >
          Send
        </button>
        {templates.length > 0 && <p className="text-xs text-neutral-400">Known keys: {templates.map((t) => t.key).join(', ')}</p>}
      </div>
    </section>
  );
}

function LogSection({ deliveries }: { deliveries: Delivery[] }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <ScrollText className="h-4 w-4 text-neutral-400" /> Delivery log
        </h2>
      </div>
      <ul className="divide-y divide-neutral-100">
        {deliveries.map((d) => (
          <li key={d.id} className="flex items-center justify-between px-5 py-2 text-sm">
            <div>
              <span className="font-medium text-neutral-900">{d.templateKey}</span>
              <span className="ml-2 text-xs text-neutral-500">{d.channel} → {d.recipientUserId}</span>
              {d.error && <p className="text-xs text-red-500">{d.error}</p>}
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[d.status]}`}>{d.status}</span>
          </li>
        ))}
        {deliveries.length === 0 && <li className="px-5 py-3 text-sm text-neutral-400">No deliveries yet.</li>}
      </ul>
    </section>
  );
}
