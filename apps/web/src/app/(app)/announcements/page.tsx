'use client';

// Announcements console — per-workspace notice board (Manage → Announcements).
// Mirrors /notifications's plain-fetch client component style. Publishing is
// RLS-gated on notify.announcement.manage (migration 0008); callers without
// it still see the feed (notify.announcement.read) but the "+ New" form
// surfaces a 403 from the API if they try to post.

import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  createdAt: string;
}

export default function AnnouncementsPage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace').then((w) => setOrgId(w.activeOrgId));
  }, []);

  function reload() {
    if (!orgId) return;
    api<Announcement[]>(`/api/v1/orgs/${orgId}/announcements`).then(setAnnouncements).catch((err) => setError(err.message));
  }

  useEffect(reload, [orgId]);

  async function publish() {
    if (!orgId || !title.trim() || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/announcements`, { method: 'POST', body: JSON.stringify({ title: title.trim(), body: body.trim() }) });
      setTitle('');
      setBody('');
      setOpen(false);
      setNotice('Announcement published.');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (orgId === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (orgId === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="glass-panel max-w-sm space-y-2 rounded-xl p-8 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-indigo-400" />
          <h1 className="text-lg font-semibold text-white">Announcements</h1>
          <p className="text-sm text-slate-400">Pick an active workspace first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          badge="Announcements"
          badgeIcon={Megaphone}
          title="Announcements"
          description="Notices for everyone in the active workspace."
        />

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">{notice}</div>}

        <section className="glass-panel rounded-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Megaphone className="h-4 w-4 text-indigo-400" /> Notice board
            </h2>
            <button onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-slate-400 hover:text-white hover:underline">
              {open ? 'Cancel' : '+ New'}
            </button>
          </div>

          {open && (
            <div className="space-y-2 border-b border-white/10 px-5 py-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="glass-input w-full rounded px-2 py-1 text-sm"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Message"
                rows={3}
                className="glass-input w-full rounded px-2 py-1 text-sm"
              />
              <button
                disabled={busy || !title.trim() || !body.trim()}
                onClick={publish}
                className="btn-premium rounded px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                Publish
              </button>
            </div>
          )}

          <ul className="divide-y divide-white/10">
            {announcements.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-slate-100">{a.title}</span>
                  <span className="shrink-0 text-xs text-slate-400">{new Date(a.publishedAt).toLocaleDateString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-300">{a.body}</p>
              </li>
            ))}
            {announcements.length === 0 && <li className="px-5 py-3 text-sm text-slate-400">No announcements yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
