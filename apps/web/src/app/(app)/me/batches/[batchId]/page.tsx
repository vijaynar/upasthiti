'use client';

// Batch detail — one card per batch from "My Batches" (docsV2/
// STUDENT_PORTAL_SPEC.md Tier 1). Overview/Attendance/Performance/
// Assessments/Payments/Schedule tabs. Performance and Payments show the
// student's full record rather than a batch-filtered slice — the schema has
// no batch_id on progress_entries or charges (one enrollment can span
// several batches), so a per-batch filter would either be fake or require
// new schema; showing the honest full picture here matches this spec's own
// "never fabricate" rule. Assessments derives pseudo-assessment cards by
// grouping progress entries logged on the same day by the same coach — the
// schema has no separate "assessment session" concept, just individual
// metric rows.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { ProgressRing, EmptyRow, StatusPill, fmtTime, fmtMoney } from '@/components/DashboardKit';
import { ProgressTrendCards, type MetricDefinition, type ProgressEntry } from '@/components/ProgressTrends';

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface BatchSummary {
  batchId: string;
  batchName: string;
  enrollmentStatus: 'active' | 'left';
  programName: string | null;
  mode: string;
  schedule: { days: number[]; startTime: string; endTime: string };
  coachName: string | null;
  attendancePct: number | null;
  nextSessionAt: string | null;
  progress: { tracked: boolean; pct: number | null; metricLabel: string | null; unit: string | null; latestValue: number | null; targetValue: number | null };
}

interface AttendanceEvent {
  id: string;
  classSessionId: string;
  status: 'present' | 'late' | 'absent' | 'excused';
  method: string;
  recordedAt: string;
}

interface ClassSession {
  id: string;
  batchId: string;
  sessionDate: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'holiday';
}

interface Charge {
  id: string;
  description: string;
  amountMinor: number;
  currency: string;
  dueOn: string;
  status: string;
}

interface Payment {
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TABS = ['Overview', 'Attendance', 'Performance', 'Assessments', 'Payments', 'Schedule'] as const;
type Tab = (typeof TABS)[number];

function Pill({ children, tone = 'primary' }: { children: React.ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const colors: Record<string, { c: string; g: string }> = {
    primary: { c: 'var(--primary)', g: 'var(--primary-glow)' },
    success: { c: 'var(--success)', g: 'var(--success-glow)' },
    warning: { c: 'var(--warning)', g: 'var(--warning-glow)' },
    danger: { c: 'var(--danger)', g: 'var(--danger-glow)' },
  };
  const t = colors[tone];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ color: t.c, backgroundColor: t.g }}>
      {children}
    </span>
  );
}

export default function BatchDetailPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = params.batchId;

  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [batch, setBatch] = useState<BatchSummary | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('Overview');
  const [error, setError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ClassSession[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceEvent[] | null>(null);
  const [entries, setEntries] = useState<ProgressEntry[] | null>(null);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace')
      .then((w) => setOrgId(w.activeOrgId))
      .catch(() => setOrgId(null));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    api<BatchSummary[]>(`/api/v1/orgs/${orgId}/me/batches`)
      .then((list) => setBatch(list.find((b) => b.batchId === batchId) ?? null))
      .catch((e) => setError(e.message));
  }, [orgId, batchId]);

  useEffect(() => {
    if (!orgId) return;
    const from = '2000-01-01';
    const to = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    api<ClassSession[]>(`/api/v1/orgs/${orgId}/batches/${batchId}/sessions?from=${from}&to=${to}`)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [orgId, batchId]);

  useEffect(() => {
    const from = '2000-01-01';
    const to = new Date().toISOString().slice(0, 10);
    api<AttendanceEvent[]>(`/api/v1/me/attendance?from=${from}&to=${to}`)
      .then(setAttendance)
      .catch(() => setAttendance([]));
    api<ProgressEntry[]>('/api/v1/me/progress').then(setEntries).catch(() => setEntries([]));
    if (orgId) api<MetricDefinition[]>(`/api/v1/orgs/${orgId}/progress/metrics`).then(setMetrics).catch(() => {});
    api<Charge[]>('/api/v1/me/finance/charges').then(setCharges).catch(() => setCharges([]));
    api<Payment[]>('/api/v1/me/finance/payments').then(setPayments).catch(() => setPayments([]));
  }, [orgId]);

  const sessionIds = useMemo(() => new Set((sessions ?? []).map((s) => s.id)), [sessions]);
  const batchAttendance = useMemo(() => (attendance ?? []).filter((a) => sessionIds.has(a.classSessionId)), [attendance, sessionIds]);
  const nextSession = useMemo(() => sessions?.find((s) => s.status === 'scheduled' && new Date(s.startsAt) >= new Date()) ?? null, [sessions]);

  const assessments = useMemo(() => {
    if (!entries) return [];
    const groups = new Map<string, ProgressEntry[]>();
    for (const e of entries) {
      const key = `${e.recordedOn}`;
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [entries]);

  const metricByKey = useMemo(() => new Map(metrics.map((m) => [m.key, m])), [metrics]);

  if (orgId === undefined || batch === undefined) return <p className="p-8 text-sm text-slate-400">Loading…</p>;
  if (!orgId) return <p className="p-8 text-sm text-slate-400">Select an active workspace first.</p>;
  if (error) return <div className="m-8 rounded-lg border p-4 text-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-glow)' }}>{error}</div>;
  if (!batch) return <p className="p-8 text-sm text-slate-400">Batch not found, or you&apos;re not in it.</p>;

  return (
    <div className="p-6 md:p-8">
      <Link href="/me/batches" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--foreground-muted)' }}>
        <ArrowLeft className="h-3.5 w-3.5" /> My Batches
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--primary)', backgroundColor: 'var(--overlay-sm)', borderColor: 'var(--panel-border)' }}>
            <CalendarClock className="h-3 w-3" /> {batch.programName ?? 'Batch'}
          </div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--foreground)' }}>
            {batch.batchName}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
            {batch.coachName ? `Coach ${batch.coachName}` : 'No coach assigned'} · {batch.schedule.days.map((d) => DOW_LABELS[d - 1]).join('/')} ·{' '}
            {batch.schedule.startTime}–{batch.schedule.endTime}
          </p>
        </div>
        {batch.enrollmentStatus === 'left' && <Pill tone="warning">Completed</Pill>}
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl p-1" style={{ backgroundColor: 'var(--overlay-sm)' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
            style={tab === t ? { backgroundColor: 'var(--primary)', color: '#fff' } : { color: 'var(--foreground-muted)' }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="glass-panel flex flex-col items-center gap-2 rounded-2xl border p-5" style={{ borderColor: 'var(--panel-border)' }}>
            <ProgressRing pct={batch.attendancePct} label="Attendance" size={96} tone="primary" />
            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>This month</p>
          </div>
          <div className="glass-panel flex flex-col items-center gap-2 rounded-2xl border p-5" style={{ borderColor: 'var(--panel-border)' }}>
            <ProgressRing pct={batch.progress.pct} label="Progress" size={96} tone="accent" />
            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
              {batch.progress.tracked ? batch.progress.metricLabel : 'Not tracked yet'}
            </p>
          </div>
          <div className="glass-panel rounded-2xl border p-5" style={{ borderColor: 'var(--panel-border)' }}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--foreground-subtle)' }}>
              Next session
            </p>
            {nextSession ? (
              <>
                <p className="text-lg font-black" style={{ color: 'var(--foreground)' }}>
                  {fmtTime(nextSession.startsAt)}
                </p>
                <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                  {new Date(nextSession.sessionDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
              </>
            ) : (
              <p className="text-sm" style={{ color: 'var(--foreground-subtle)' }}>No upcoming session scheduled.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'Attendance' && (
        <div className="glass-panel rounded-2xl border p-5" style={{ borderColor: 'var(--panel-border)' }}>
          {batchAttendance.length === 0 ? (
            <EmptyRow>No attendance recorded yet for this batch.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {batchAttendance
                .slice()
                .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))
                .map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--overlay-xs)' }}>
                    <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                      {new Date(a.recordedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <StatusPill status={a.status} />
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'Performance' && (
        <div>
          {entries === null ? (
            <EmptyRow>Loading…</EmptyRow>
          ) : entries.length === 0 ? (
            <EmptyRow>No progress logged yet.</EmptyRow>
          ) : (
            <ProgressTrendCards entries={entries} metrics={metrics} />
          )}
        </div>
      )}

      {tab === 'Assessments' && (
        <div className="space-y-3">
          {assessments.length === 0 ? (
            <EmptyRow>No assessments logged yet.</EmptyRow>
          ) : (
            assessments.map(([date, list]) => (
              <div key={date} className="glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--panel-border)' }}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                    {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                  <Pill>{list.length} metric{list.length === 1 ? '' : 's'}</Pill>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {list.map((e) => {
                    const def = metricByKey.get(e.metricKey);
                    return (
                      <li key={e.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'var(--overlay-xs)' }}>
                        <span style={{ color: 'var(--foreground-muted)' }}>{def?.label ?? e.metricKey}</span>
                        <span className="font-bold" style={{ color: 'var(--foreground)' }}>
                          {e.value}
                          {def?.unit ? <span className="ml-1 text-xs font-normal">{def.unit}</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {list[0]?.note && (
                  <p className="mt-2 text-xs italic" style={{ color: 'var(--foreground-subtle)' }}>
                    &ldquo;{list[0].note}&rdquo;
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'Payments' && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>
            Showing your full payment record — fees aren&apos;t tracked per batch in this system.
          </p>
          {charges === null ? (
            <EmptyRow>Loading…</EmptyRow>
          ) : charges.length === 0 ? (
            <EmptyRow>No charges yet.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {charges.map((c) => (
                <li key={c.id} className="glass-panel flex items-center justify-between rounded-xl border p-3" style={{ borderColor: 'var(--panel-border)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                      {c.description}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>
                      Due {new Date(c.dueOn).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                      {fmtMoney(c.amountMinor, c.currency)}
                    </p>
                    <StatusPill status={c.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'Schedule' && (
        <div className="glass-panel rounded-2xl border p-5" style={{ borderColor: 'var(--panel-border)' }}>
          {sessions === null || sessions.length === 0 ? (
            <EmptyRow>No sessions scheduled.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {sessions
                .slice()
                .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1))
                .map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--overlay-xs)' }}>
                    <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                      {new Date(s.sessionDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtTime(s.startsAt)}
                    </span>
                    <StatusPill status={s.status} />
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
