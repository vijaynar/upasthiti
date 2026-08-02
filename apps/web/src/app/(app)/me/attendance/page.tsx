'use client';

// "Attendance" — the signed-in student's full attendance record (docsV2/
// STUDENT_PORTAL_SPEC.md Tier 1). Overall + per-batch tabs (unlike
// Performance, this IS meaningful — attendance_events carries a
// class_session_id that resolves to a real batch_id, so a per-batch split
// is real data, not fabricated). A same-month calendar grid mirrors the
// mockup's attendance trend view; built from the same event list, no new
// backend endpoint.

import { useEffect, useMemo, useState } from 'react';
import { ScanFace } from 'lucide-react';
import { ProgressRing, EmptyRow, StatusPill } from '@/components/DashboardKit';
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
}

interface AttendanceEvent {
  id: string;
  classSessionId: string;
  status: 'present' | 'late' | 'absent' | 'excused';
  recordedAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  present: 'var(--success)',
  late: 'var(--warning)',
  absent: 'var(--danger)',
  excused: 'var(--foreground-subtle)',
};

function MonthGrid({ events }: { events: AttendanceEvent[] }) {
  const byDate = useMemo(() => {
    const map = new Map<string, AttendanceEvent['status']>();
    for (const e of events) {
      const date = e.recordedAt.slice(0, 10);
      const existing = map.get(date);
      // present/late wins over absent/excused if a day has multiple entries
      if (!existing || existing === 'absent' || existing === 'excused') map.set(date, e.status);
    }
    return map;
  }, [events]);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase" style={{ color: 'var(--foreground-subtle)' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const status = byDate.get(date);
          return (
            <div
              key={i}
              title={status ? `${date}: ${status}` : date}
              className="flex aspect-square items-center justify-center rounded-md text-[10px] font-semibold"
              style={{
                backgroundColor: status ? STATUS_COLOR[status] + '33' : 'var(--overlay-xs)',
                color: status ? STATUS_COLOR[status] : 'var(--foreground-subtle)',
              }}
            >
              {day}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[10px]" style={{ color: 'var(--foreground-muted)' }}>
        {Object.entries(STATUS_COLOR).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> {status}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function MyAttendancePage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [sessionsByBatch, setSessionsByBatch] = useState<Map<string, string>>(new Map()); // sessionId -> batchId
  const [events, setEvents] = useState<AttendanceEvent[] | null>(null);
  const [tab, setTab] = useState<string>('overall');

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace')
      .then((w) => setOrgId(w.activeOrgId))
      .catch(() => setOrgId(null));
  }, []);

  useEffect(() => {
    const from = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    api<AttendanceEvent[]>(`/api/v1/me/attendance?from=${from}&to=${to}`)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    api<BatchSummary[]>(`/api/v1/orgs/${orgId}/me/batches`)
      .then(async (list) => {
        const active = list.filter((b) => b.enrollmentStatus === 'active');
        setBatches(active);
        const from = '2000-01-01';
        const to = new Date().toISOString().slice(0, 10);
        const map = new Map<string, string>();
        await Promise.all(
          active.map(async (b) => {
            const sessions = await api<ClassSession[]>(`/api/v1/orgs/${orgId}/batches/${b.batchId}/sessions?from=${from}&to=${to}`).catch(() => []);
            for (const s of sessions) map.set(s.id, b.batchId);
          })
        );
        setSessionsByBatch(map);
      })
      .catch(() => {});
  }, [orgId]);

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (tab === 'overall') return events;
    return events.filter((e) => sessionsByBatch.get(e.classSessionId) === tab);
  }, [events, tab, sessionsByBatch]);

  const pct = useMemo(() => {
    if (filteredEvents.length === 0) return null;
    const hits = filteredEvents.filter((e) => e.status === 'present' || e.status === 'late').length;
    return Math.round((hits / filteredEvents.length) * 100);
  }, [filteredEvents]);

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-8">
      <PageHeader badge="Attendance" badgeIcon={ScanFace} title="My Attendance" description="Your check-ins across all your batches." />

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl p-1" style={{ backgroundColor: 'var(--overlay-sm)' }}>
        {[{ key: 'overall', label: 'Overall' }, ...batches.map((b) => ({ key: b.batchId, label: b.batchName }))].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
            style={tab === t.key ? { backgroundColor: 'var(--primary)', color: '#fff' } : { color: 'var(--foreground-muted)' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {events === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl border p-6" style={{ borderColor: 'var(--panel-border)' }}>
            <ProgressRing pct={pct} label="Attendance" size={120} tone="primary" />
            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
              Last 180 days · {filteredEvents.length} session{filteredEvents.length === 1 ? '' : 's'} recorded
            </p>
          </div>
          <div className="glass-panel rounded-2xl border p-5" style={{ borderColor: 'var(--panel-border)' }}>
            <p className="mb-3 text-xs font-extrabold uppercase tracking-widest" style={{ color: 'var(--foreground-muted)' }}>
              This month
            </p>
            <MonthGrid events={filteredEvents} />
          </div>
        </div>
      )}

      <h2 className="mb-3 mt-6 text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--foreground-muted)' }}>
        Recent check-ins
      </h2>
      {filteredEvents.length === 0 ? (
        <EmptyRow>No attendance recorded yet.</EmptyRow>
      ) : (
        <ul className="space-y-2">
          {filteredEvents
            .slice()
            .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))
            .slice(0, 30)
            .map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--overlay-xs)' }}>
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                  {new Date(e.recordedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <StatusPill status={e.status} />
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
