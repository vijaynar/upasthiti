'use client';

// "Schedule" — upcoming sessions across every active batch the signed-in
// student is enrolled in, across every org (docsV2/STUDENT_PORTAL_SPEC.md
// Tier 1, org-agnostic — a student has no single "active workspace"; see
// listMyBatchSummaries' comment). Backed by GET /api/v1/me/schedule, which
// aggregates class_sessions across every org server-side (RLS is still the
// real gate, keyed on the caller's own enrollments, not current_org()).

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

interface AgendaSession {
  sessionId: string;
  batchId: string;
  batchName: string;
  organizationName: string;
  sessionDate: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'holiday';
}

export default function MySchedulePage() {
  const [sessions, setSessions] = useState<AgendaSession[] | null>(null);

  useEffect(() => {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    api<AgendaSession[]>(`/api/v1/me/schedule?from=${from}&to=${to}`)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaSession[]>();
    for (const s of sessions ?? []) {
      const arr = map.get(s.sessionDate) ?? [];
      arr.push(s);
      map.set(s.sessionDate, arr);
    }
    return [...map.entries()];
  }, [sessions]);

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
                  <li key={s.sessionId} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--primary)' }}>
                        {fmtTime(s.startsAt)}
                      </span>
                      <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                        {s.batchName}
                        <span className="ml-1.5 font-normal" style={{ color: 'var(--foreground-subtle)' }}>
                          · {s.organizationName}
                        </span>
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
