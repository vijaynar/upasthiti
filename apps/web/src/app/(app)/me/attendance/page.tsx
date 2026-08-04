'use client';

// "Attendance" — the signed-in student's full attendance record across
// every org they're enrolled in (docsV2/STUDENT_PORTAL_SPEC.md Tier 1,
// org-agnostic — see listMyBatchSummaries' comment). Overall + per-batch
// tabs (unlike Performance, this IS meaningful — attendance_events carries a
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

import { ChevronLeft, ChevronRight, CalendarClock } from 'lucide-react';

interface BatchSummary {
  batchId: string;
  batchName: string;
  organizationId: string;
  organizationName?: string;
  enrollmentStatus: 'active' | 'left';
  schedule?: { days: number[]; startTime: string; endTime: string };
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function scheduleLabel(s?: { days: number[]; startTime: string; endTime: string }): string {
  if (!s || !s.days) return '';
  const days = s.days.map((d) => DOW_LABELS[d - 1]).join(', ');
  return `${days}${s.startTime ? ` · ${s.startTime}–${s.endTime}` : ''}`;
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; text: string }> = {
  present: { label: 'Present', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.2)', text: '#4ade80' },
  late: { label: 'Late', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24' },
  absent: { label: 'Absent', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171' },
  no_class: { label: 'No Class', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8' },
};

function MonthGrid({ events }: { events: AttendanceEvent[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const byDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of events) {
      const date = e.recordedAt.slice(0, 10);
      const existing = map.get(date);
      const statusKey = e.status === 'excused' ? 'no_class' : e.status;
      if (!existing || existing === 'absent' || existing === 'no_class') map.set(date, statusKey);
    }
    return map;
  }, [events]);

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>
          {monthLabel}
        </h4>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition"
            title="Previous Month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={nextMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition"
            title="Next Month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[10px] font-extrabold uppercase" style={{ color: 'var(--foreground-subtle)' }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const statusKey = byDate.get(dateStr) ?? 'no_class';
          const cfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.no_class;

          return (
            <div
              key={i}
              title={`${dateStr}: ${cfg.label}`}
              className="flex aspect-square flex-col items-center justify-center rounded-xl border text-xs font-bold transition-all"
              style={{
                backgroundColor: cfg.bg,
                borderColor: cfg.color + '44',
                color: cfg.text,
              }}
            >
              <span>{day}</span>
              <span className="mt-0.5 text-[8px] font-normal opacity-80">{cfg.label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs font-medium" style={{ color: 'var(--foreground-muted)' }}>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: cfg.color, borderColor: cfg.color }} />
            {cfg.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function MyAttendancePage() {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [sessionsByBatch, setSessionsByBatch] = useState<Map<string, string>>(new Map());
  const [events, setEvents] = useState<AttendanceEvent[] | null>(null);
  const [tab, setTab] = useState<string>('overall');

  useEffect(() => {
    const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    api<AttendanceEvent[]>(`/api/v1/me/attendance?from=${from}&to=${to}`)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    api<BatchSummary[]>('/api/v1/me/batches')
      .then(async (list) => {
        const active = list.filter((b) => b.enrollmentStatus === 'active');
        setBatches(active);
        const from = '2000-01-01';
        const to = new Date().toISOString().slice(0, 10);
        const map = new Map<string, string>();
        await Promise.all(
          active.map(async (b) => {
            const sessions = await api<ClassSession[]>(
              `/api/v1/orgs/${b.organizationId}/batches/${b.batchId}/sessions?from=${from}&to=${to}`
            ).catch(() => []);
            for (const s of sessions) map.set(s.id, b.batchId);
          })
        );
        setSessionsByBatch(map);
      })
      .catch(() => {});
  }, []);

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

  const selectedBatch = useMemo(() => batches.find((b) => b.batchId === tab), [batches, tab]);

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-8">
      <PageHeader badge="Attendance" badgeIcon={ScanFace} title="My Attendance" description="Your check-ins across all your batches." />

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl p-1" style={{ backgroundColor: 'var(--overlay-sm)' }}>
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
        <div className="grid gap-6 md:grid-cols-12">
          <div className="glass-panel flex flex-col items-center justify-between gap-4 rounded-2xl border p-6 md:col-span-4" style={{ borderColor: 'var(--panel-border)' }}>
            {/* Batch Info / Description inside Pie Chart Card */}
            {tab !== 'overall' && selectedBatch ? (
              <div className="w-full flex flex-col items-center gap-1 text-center pb-3 border-b border-white/5">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="font-bold text-sm" style={{ color: 'var(--primary)' }}>{selectedBatch.batchName}</span>
                  {selectedBatch.organizationName && <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>· {selectedBatch.organizationName}</span>}
                </div>
                {selectedBatch.schedule && (
                  <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--foreground-muted)' }}>
                    <CalendarClock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span>{scheduleLabel(selectedBatch.schedule)}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full text-center pb-3 border-b border-white/5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">All Batches Overview</span>
              </div>
            )}

            <ProgressRing pct={pct} label="Attendance" size={130} tone="primary" />

            <p className="text-center text-xs font-medium" style={{ color: 'var(--foreground-muted)' }}>
              Score across {filteredEvents.length} recorded session{filteredEvents.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="glass-panel rounded-2xl border p-6 md:col-span-8" style={{ borderColor: 'var(--panel-border)' }}>
            <MonthGrid events={filteredEvents} />
          </div>
        </div>
      )}
    </div>
  );
}
