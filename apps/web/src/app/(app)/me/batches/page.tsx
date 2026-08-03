'use client';

// "My Batches" — the signed-in student's full batch list across every org
// they're enrolled in (docsV2/STUDENT_PORTAL_SPEC.md Tier 1, org-agnostic —
// see listMyBatchSummaries' comment). All/Active/Completed tabs over
// listMyBatchSummaries (enrollmentStatus 'left' = Completed, per this
// spec's resolved open question — batch_enrollments has no separate
// "finished the program" state, so a withdrawal reads the same as
// completion). Also the browse-and-request surface for the batch
// join-request flow (migration 0011): a student can see other active
// batches in an org they're already enrolled in and ask a coach to add
// them — one "Join another batch" panel per org, since batch join-requests
// are still necessarily org-scoped (browsing a brand-new org/coach is a
// separate flow, via /onboarding's join-request form).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Search, UserPlus, Clock } from 'lucide-react';
import { ProgressRing, EmptyRow, StatusPill, fmtTime } from '@/components/DashboardKit';
import { PageHeader } from '@/components/PageHeader';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface BatchSummary {
  batchId: string;
  batchName: string;
  enrollmentStatus: 'active' | 'left';
  organizationId: string;
  organizationName: string;
  programName: string | null;
  mode: string;
  schedule: { days: number[]; startTime: string; endTime: string };
  coachName: string | null;
  attendancePct: number | null;
  nextSessionAt: string | null;
  progress: { tracked: boolean; pct: number | null; metricLabel: string | null; unit: string | null };
}

interface JoinableBatch {
  id: string;
  name: string;
  mode: string;
  schedule: { days: number[]; startTime: string; endTime: string };
}

interface JoinRequest {
  id: string;
  batchId: string;
  status: 'pending' | 'approved' | 'rejected';
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function scheduleLabel(s: { days: number[]; startTime: string; endTime: string }): string {
  return `${s.days.map((d) => DOW_LABELS[d - 1]).join('/')} · ${s.startTime}–${s.endTime}`;
}

function BatchListCard({ batch }: { batch: BatchSummary }) {
  return (
    <Link
      href={`/me/batches/${batch.batchId}`}
      className="glass-panel glass-panel-hover flex flex-col gap-4 rounded-2xl border p-5 transition-all duration-200 sm:flex-row sm:items-center"
      style={{ borderColor: 'var(--panel-border)' }}
    >
      <div className="flex shrink-0 gap-3">
        <ProgressRing pct={batch.attendancePct} label="Attend." size={68} tone="primary" />
        <ProgressRing pct={batch.progress.pct} label="Progress" size={68} tone="accent" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-base font-bold" style={{ color: 'var(--foreground)' }}>
            {batch.batchName}
          </p>
          {batch.enrollmentStatus === 'left' && <StatusPill status="completed" />}
        </div>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--foreground-muted)' }}>
          {batch.organizationName} · {batch.programName ?? 'General'} · {batch.coachName ? `Coach ${batch.coachName}` : 'No coach assigned'}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--foreground-subtle)' }}>
          {scheduleLabel(batch.schedule)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold" style={{ color: 'var(--foreground-muted)' }}>
          {batch.nextSessionAt ? `Next ${fmtTime(batch.nextSessionAt)}` : 'No upcoming session'}
        </p>
      </div>
    </Link>
  );
}

function JoinBatchPanel({ orgId, orgName, onRequested }: { orgId: string; orgName: string; onRequested: () => void }) {
  const [open, setOpen] = useState(false);
  const [joinable, setJoinable] = useState<JoinableBatch[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api<JoinableBatch[]>(`/api/v1/orgs/${orgId}/me/batches/joinable`)
      .then(setJoinable)
      .catch((e) => setError(e.message));
  }, [open, orgId]);

  async function request(batchId: string) {
    setBusyId(batchId);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/batches/${batchId}/join-requests`, { method: 'POST' });
      setJoinable((prev) => prev?.filter((b) => b.id !== batchId) ?? null);
      onRequested();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="glass-panel rounded-2xl border p-5" style={{ borderColor: 'var(--panel-border)' }}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--foreground-muted)' }}>
          <UserPlus className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          Join another batch at {orgName}
        </span>
        <span className="text-xs font-bold" style={{ color: 'var(--primary)' }}>
          {open ? 'Hide' : 'Browse'}
        </span>
      </button>

      {open && (
        <div className="mt-4">
          {error && (
            <p className="mb-3 rounded-lg border p-2 text-xs" style={{ color: 'var(--danger)', borderColor: 'var(--danger-glow)' }}>
              {error}
            </p>
          )}
          {joinable === null ? (
            <EmptyRow>Loading…</EmptyRow>
          ) : joinable.length === 0 ? (
            <EmptyRow>No other batches available to join right now.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {joinable.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--overlay-xs)' }}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                      {b.name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>
                      {scheduleLabel(b.schedule)}
                    </p>
                  </div>
                  <button
                    disabled={busyId === b.id}
                    onClick={() => request(b.id)}
                    className="btn-premium shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {busyId === b.id ? 'Requesting…' : 'Request to join'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

type Tab = 'all' | 'active' | 'completed';

export default function MyBatchesPage() {
  const [batches, setBatches] = useState<BatchSummary[] | null>(null);
  const [myRequestsByOrg, setMyRequestsByOrg] = useState<Map<string, JoinRequest[]>>(new Map());
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  function loadBatches() {
    api<BatchSummary[]>('/api/v1/me/batches').then(setBatches).catch((e) => setError(e.message));
  }
  function loadRequests(orgId: string) {
    api<JoinRequest[]>(`/api/v1/orgs/${orgId}/me/batch-join-requests`)
      .then((list) => setMyRequestsByOrg((prev) => new Map(prev).set(orgId, list)))
      .catch(() => {});
  }

  useEffect(() => {
    loadBatches();
  }, []);

  // Orgs the student is actually enrolled in, derived from their own batch
  // rows (org-agnostic — a student can hold enrollments at any number of
  // unrelated academies/coaches, see listMyBatchSummaries' comment).
  const myOrgs = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of batches ?? []) map.set(b.organizationId, b.organizationName);
    return [...map.entries()].map(([organizationId, organizationName]) => ({ organizationId, organizationName }));
  }, [batches]);

  useEffect(() => {
    for (const org of myOrgs) loadRequests(org.organizationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myOrgs]);

  const pendingRequests = useMemo(
    () => [...myRequestsByOrg.values()].flat().filter((r) => r.status === 'pending'),
    [myRequestsByOrg]
  );

  const filtered = useMemo(() => {
    if (!batches) return [];
    const q = search.trim().toLowerCase();
    return batches
      .filter((b) => (tab === 'all' ? true : tab === 'active' ? b.enrollmentStatus === 'active' : b.enrollmentStatus === 'left'))
      .filter((b) => (q ? b.batchName.toLowerCase().includes(q) : true));
  }, [batches, tab, search]);

  return (
    <div className="p-6 md:p-8">
      <PageHeader badge="My Batches" badgeIcon={CalendarClock} title="My Batches" description="All the batches you're part of." />

      {error && (
        <div className="mb-4 rounded-lg border p-3 text-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-glow)' }}>
          {error}
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--warning-glow)' }}>
          <Clock className="h-4 w-4 shrink-0" style={{ color: 'var(--warning)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            {pendingRequests.length} join request{pendingRequests.length === 1 ? '' : 's'} awaiting a coach&apos;s approval.
          </span>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: 'var(--overlay-sm)' }}>
          {(['all', 'active', 'completed'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all"
              style={tab === t ? { backgroundColor: 'var(--primary)', color: '#fff' } : { color: 'var(--foreground-muted)' }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5" style={{ color: 'var(--foreground-subtle)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search batches…"
            className="glass-input w-56 rounded-lg py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
      </div>

      <div className="mb-6 space-y-3">
        {batches === null ? (
          <EmptyRow>Loading…</EmptyRow>
        ) : filtered.length === 0 ? (
          <EmptyRow>No batches match here.</EmptyRow>
        ) : (
          filtered.map((b) => <BatchListCard key={b.batchId} batch={b} />)
        )}
      </div>

      {myOrgs.length > 0 && (
        <div className="space-y-3">
          {myOrgs.map((org) => (
            <JoinBatchPanel
              key={org.organizationId}
              orgId={org.organizationId}
              orgName={org.organizationName}
              onRequested={() => loadRequests(org.organizationId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
