'use client';

// "Schedule" — upcoming sessions across every active batch the signed-in
// student is enrolled in (docsV2/STUDENT_PORTAL_SPEC.md Tier 1). No
// "my sessions across all batches" endpoint exists, so this fans out to the
// existing per-batch sessions route (class_sessions_select_self already
// makes it visible) and merges client-side — the batch count per student is
// small, so this stays cheap.

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { EmptyRow, StatusPill, fmtTime } from '@/components/DashboardKit';
import { PageHeader } from '@/components/PageHeader';

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
}

interface ClassSession {
  id: string;
  batchId: string;
  sessionDate: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'holiday';
}

interface AgendaSession extends ClassSession {
  batchName: string;
}

export default function MySchedulePage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [sessions, setSessions] = useState<AgendaSession[] | null>(null);

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace')
      .then((w) => setOrgId(w.activeOrgId))
      .catch(() => setOrgId(null));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    api<BatchSummary[]>(`/api/v1/orgs/${orgId}/me/batches`)
      .then(async (batches) => {
        const active = batches.filter((b) => b.enrollmentStatus === 'active');
        const from = new Date().toISOString().slice(0, 10);
        const to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const perBatch = await Promise.all(
          active.map((b) =>
            api<ClassSession[]>(`/api/v1/orgs/${orgId}/batches/${b.batchId}/sessions?from=${from}&to=${to}`)
              .then((list) => list.map((s) => ({ ...s, batchName: b.batchName })))
              .catch(() => [] as AgendaSession[])
          )
        );
        if (!cancelled) setSessions(perBatch.flat().sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1)));
      })
      .catch(() => setSessions([]));
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaSession[]>();
    for (const s of sessions ?? []) {
      const arr = map.get(s.sessionDate) ?? [];
      arr.push(s);
      map.set(s.sessionDate, arr);
    }
    return [...map.entries()];
  }, [sessions]);

  if (orgId === undefined) return <p className="p-8 text-sm text-slate-400">Loading…</p>;
  if (!orgId) return <p className="p-8 text-sm text-slate-400">Select an active workspace first.</p>;

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-8">
      <PageHeader badge="Schedule" badgeIcon={CalendarDays} title="My Schedule" description="Upcoming sessions across all your batches, next 30 days." />

      {sessions === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : byDay.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 text-center">
          <EmptyRow>No upcoming sessions.</EmptyRow>
        </div>
      ) : (
        <div className="space-y-4">
          {byDay.map(([date, list]) => (
            <div key={date}>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-widest" style={{ color: 'var(--foreground-muted)' }}>
                {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
              <ul className="glass-panel divide-y divide-white/10 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--panel-border)' }}>
                {list.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--primary)' }}>
                        {fmtTime(s.startsAt)}
                      </span>
                      <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                        {s.batchName}
                      </span>
                    </div>
                    <StatusPill status={s.status} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
