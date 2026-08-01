'use client';

// Announcements console — per-workspace notice board (Manage → Announcements).
// Coach self-service (migration 0009): a coach can draft, publish now, or
// schedule an announcement for later, targeting either every student in the
// org or just the batches they coach. RLS (notify.announcement.manage) is
// the real gate; the API surfaces a 403 for callers without it.

import { useEffect, useMemo, useState } from 'react';
import { Megaphone, CheckCircle2, Clock, Archive, Bell, Send } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard, EmptyRow } from '@/components/DashboardKit';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'archived';
type AnnouncementTag = 'general' | 'event' | 'urgent' | 'holiday' | 'academic';

interface Announcement {
  id: string;
  title: string;
  body: string;
  status: AnnouncementStatus;
  tag: AnnouncementTag;
  audienceType: 'all' | 'batches';
  batchIds: string[];
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface Batch {
  id: string;
  name: string;
}

const TAG_OPTIONS: { value: AnnouncementTag; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'event', label: 'Event' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'academic', label: 'Academic' },
];

const TABS: { key: 'all' | AnnouncementStatus; label: string }[] = [
  { key: 'all', label: 'All Announcements' },
  { key: 'published', label: 'Published' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'archived', label: 'Archived' },
];

const STATUS_TONE: Record<AnnouncementStatus, { color: string; bg: string; label: string }> = {
  draft: { color: 'var(--foreground-muted)', bg: 'var(--overlay-sm)', label: 'Draft' },
  scheduled: { color: 'var(--warning)', bg: 'var(--warning-glow)', label: 'Scheduled' },
  published: { color: 'var(--success)', bg: 'var(--success-glow)', label: 'Published' },
  archived: { color: 'var(--danger)', bg: 'var(--danger-glow)', label: 'Archived' },
};

function StatusBadge({ status }: { status: AnnouncementStatus }) {
  const t = STATUS_TONE[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: t.color, backgroundColor: t.bg }}
    >
      {t.label}
    </span>
  );
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export default function AnnouncementsPage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [tag, setTag] = useState<AnnouncementTag>('general');
  const [audienceType, setAudienceType] = useState<'all' | 'batches'>('all');
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace').then((w) => setOrgId(w.activeOrgId));
  }, []);

  function reload() {
    if (!orgId) return;
    api<Announcement[]>(`/api/v1/orgs/${orgId}/announcements`).then(setAnnouncements).catch((err) => setError(err.message));
  }

  useEffect(reload, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    api<Batch[]>(`/api/v1/orgs/${orgId}/batches?mine=true`).then(setBatches).catch(() => setBatches([]));
  }, [orgId]);

  const filtered = useMemo(() => (tab === 'all' ? announcements : announcements.filter((a) => a.status === tab)), [announcements, tab]);

  const counts = useMemo(
    () => ({
      total: announcements.length,
      published: announcements.filter((a) => a.status === 'published').length,
      scheduled: announcements.filter((a) => a.status === 'scheduled').length,
      archived: announcements.filter((a) => a.status === 'archived').length,
    }),
    [announcements]
  );

  function resetForm() {
    setTitle('');
    setMessage('');
    setTag('general');
    setAudienceType('all');
    setSelectedBatchIds([]);
    setSchedule('now');
    setScheduledAt('');
  }

  function toggleBatch(id: string) {
    setSelectedBatchIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  const canSubmit =
    !!orgId && title.trim().length > 0 && message.trim().length > 0 && (audienceType === 'all' || selectedBatchIds.length > 0) && !busy;

  async function submit(status: 'draft' | 'scheduled' | 'published') {
    if (!orgId || !title.trim() || !message.trim()) return;
    if (status === 'scheduled' && !scheduledAt) {
      setError('Pick a date and time to schedule this announcement.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/announcements`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          body: message.trim(),
          tag,
          audienceType,
          batchIds: audienceType === 'batches' ? selectedBatchIds : undefined,
          status,
          scheduledAt: status === 'scheduled' ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      resetForm();
      setNotice(status === 'draft' ? 'Saved as draft.' : status === 'scheduled' ? 'Announcement scheduled.' : 'Announcement published.');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: AnnouncementStatus) {
    if (!orgId) return;
    setActionId(id);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/announcements/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setActionId(null);
    }
  }

  if (orgId === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
          Loading…
        </p>
      </div>
    );
  }

  if (orgId === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="glass-panel max-w-sm space-y-2 rounded-2xl p-8 text-center">
          <Megaphone className="mx-auto h-8 w-8" style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
            Announcements
          </h1>
          <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
            Pick an active workspace first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          badge="Announcements"
          badgeIcon={Megaphone}
          title="Announcements"
          description="Share updates with all students or with the batches you coach."
        />

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">{notice}</div>}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Announcements" value={counts.total} icon={Megaphone} tone="accent" hint="All time" />
          <StatCard label="Published" value={counts.published} icon={CheckCircle2} tone="success" hint="Active announcements" />
          <StatCard label="Scheduled" value={counts.scheduled} icon={Clock} tone="warning" hint="Upcoming announcements" />
          <StatCard label="Archived" value={counts.archived} icon={Archive} tone="danger" hint="Completed / expired" />
        </div>

        <div className="flex gap-1 overflow-x-auto rounded-xl border-b p-1" style={{ borderColor: 'var(--panel-border)' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold transition-all"
              style={
                tab === t.key
                  ? { color: 'var(--primary)', borderBottom: '2px solid var(--primary)' }
                  : { color: 'var(--foreground-muted)' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="glass-panel rounded-2xl border p-5" style={{ borderColor: 'var(--panel-border)' }}>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Bell className="mb-3 h-8 w-8" style={{ color: 'var(--foreground-subtle)' }} />
                  <EmptyRow>No announcements in this category.</EmptyRow>
                </div>
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--panel-border)' }}>
                  {filtered.map((a) => (
                    <li key={a.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
                          {a.title}
                        </span>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--foreground-muted)' }}>
                        {a.body}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--foreground-subtle)' }}>
                        <span className="rounded-full px-2 py-0.5 font-bold uppercase tracking-wide" style={{ backgroundColor: 'var(--overlay-sm)' }}>
                          {TAG_OPTIONS.find((o) => o.value === a.tag)?.label ?? a.tag}
                        </span>
                        <span>{a.audienceType === 'all' ? 'All Students' : `${a.batchIds.length} batch${a.batchIds.length === 1 ? '' : 'es'}`}</span>
                        <span>
                          {a.status === 'scheduled' && a.scheduledAt
                            ? `Scheduled for ${fmtDateTime(a.scheduledAt)}`
                            : a.publishedAt
                              ? fmtDateTime(a.publishedAt)
                              : fmtDateTime(a.createdAt)}
                        </span>
                      </div>
                      <div className="flex gap-3 pt-1">
                        {a.status === 'draft' && (
                          <button
                            disabled={actionId === a.id}
                            onClick={() => setStatus(a.id, 'published')}
                            className="text-xs font-bold hover:underline disabled:opacity-50"
                            style={{ color: 'var(--primary)' }}
                          >
                            Publish now
                          </button>
                        )}
                        {(a.status === 'published' || a.status === 'scheduled') && (
                          <button
                            disabled={actionId === a.id}
                            onClick={() => setStatus(a.id, 'archived')}
                            className="text-xs font-bold hover:underline disabled:opacity-50"
                            style={{ color: 'var(--foreground-muted)' }}
                          >
                            Archive
                          </button>
                        )}
                        {a.status === 'archived' && (
                          <button
                            disabled={actionId === a.id}
                            onClick={() => setStatus(a.id, 'published')}
                            className="text-xs font-bold hover:underline disabled:opacity-50"
                            style={{ color: 'var(--primary)' }}
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="glass-panel rounded-2xl border p-5" style={{ borderColor: 'var(--panel-border)' }}>
              <div className="mb-4 flex items-start gap-3 border-b pb-4" style={{ borderColor: 'var(--panel-border)' }}>
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ color: 'var(--primary)', backgroundColor: 'var(--primary-glow)' }}
                >
                  <Megaphone className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-extrabold" style={{ color: 'var(--foreground)' }}>
                    Create New Announcement
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                    Share important updates with your students.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--foreground-subtle)' }}>
                    Title <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter announcement title"
                    maxLength={200}
                    className="glass-input w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--foreground-subtle)' }}>
                      Message <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <span className="text-[11px]" style={{ color: 'var(--foreground-subtle)' }}>
                      {message.length}/1000
                    </span>
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                    placeholder="Write your announcement…"
                    rows={4}
                    maxLength={1000}
                    className="glass-input w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--foreground-subtle)' }}>
                    Tag Category <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <select value={tag} onChange={(e) => setTag(e.target.value as AnnouncementTag)} className="glass-input w-full rounded-lg px-3 py-2 text-sm">
                    {TAG_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--foreground-subtle)' }}>
                    Audience <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <select
                    value={audienceType}
                    onChange={(e) => setAudienceType(e.target.value as 'all' | 'batches')}
                    className="glass-input w-full rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="all">All Students</option>
                    <option value="batches">Specific Batches</option>
                  </select>
                  <p className="mt-1 text-xs" style={{ color: 'var(--foreground-subtle)' }}>
                    Choose who should see this announcement
                  </p>

                  {audienceType === 'batches' && (
                    <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2" style={{ borderColor: 'var(--glass-input-border)' }}>
                      {batches.length === 0 ? (
                        <p className="px-1 py-2 text-xs" style={{ color: 'var(--foreground-subtle)' }}>
                          You don&apos;t coach any batches yet.
                        </p>
                      ) : (
                        batches.map((b) => (
                          <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm" style={{ color: 'var(--foreground)' }}>
                            <input type="checkbox" checked={selectedBatchIds.includes(b.id)} onChange={() => toggleBatch(b.id)} />
                            {b.name}
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--foreground-subtle)' }}>
                    Schedule
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--foreground)' }}>
                      <input type="radio" name="schedule" checked={schedule === 'now'} onChange={() => setSchedule('now')} />
                      Publish Now
                    </label>
                    <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--foreground)' }}>
                      <input type="radio" name="schedule" checked={schedule === 'later'} onChange={() => setSchedule('later')} />
                      Schedule for Later
                    </label>
                  </div>
                  {schedule === 'now' ? (
                    <p className="mt-1 text-xs" style={{ color: 'var(--foreground-subtle)' }}>
                      Publish immediately
                    </p>
                  ) : (
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                      className="glass-input mt-2 w-full rounded-lg px-3 py-2 text-sm"
                    />
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--panel-border)' }}>
                  <button
                    disabled={!canSubmit}
                    onClick={() => submit('draft')}
                    className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    style={{ backgroundColor: 'var(--overlay-sm)', color: 'var(--foreground)' }}
                  >
                    Save as Draft
                  </button>
                  <button
                    disabled={!canSubmit || (schedule === 'later' && !scheduledAt)}
                    onClick={() => submit(schedule === 'later' ? 'scheduled' : 'published')}
                    className="btn-premium flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {schedule === 'later' ? 'Schedule Announcement' : 'Publish Announcement'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
