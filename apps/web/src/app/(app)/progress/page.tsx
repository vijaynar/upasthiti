'use client';

// Progress & Performance console (Doc 07 §13, Doc 04 §5 "Progress &
// performance" row) — staff view for the active workspace: pick an enrolled
// student, see each metric's trend over time (hand-rolled SVG sparklines, no
// chart dependency), and log a new value. Coaches get an "own batches only"
// toggle (the app-layer scoping from migration 0015's header). Mirrors
// /scheduling's plain-fetch client-component style.

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Plus, Trash2, Search } from 'lucide-react';
import { Sparkline, type MetricDefinition, type ProgressEntry } from '@/components/ProgressTrends';
import { PageHeader } from '@/components/PageHeader';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface RosterEntry {
  enrollmentId: string;
  studentUserId: string;
  displayName: string;
  branchId: string;
  rollNumber: string | null;
  batchNames: string[];
}

interface MetricDefinitionWithTarget extends MetricDefinition {
  targetValue: number | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">{error}</div>;
}

// Sets the goal (target_value) a batch's progress ring is measured against
// on the student portal — undefined here just means "not set yet", never a
// fabricated default (docsV2/STUDENT_PORTAL_SPEC.md's resolved open
// question on batch progress %).
function GoalEditor({
  metricId,
  unit,
  targetValue,
  onSave,
}: {
  metricId: string;
  unit: string | null;
  targetValue: number | null;
  onSave: (value: number | null) => void;
}) {
  const [value, setValue] = useState(targetValue === null ? '' : String(targetValue));

  useEffect(() => {
    setValue(targetValue === null ? '' : String(targetValue));
  }, [targetValue, metricId]);

  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs">
      <span className="text-slate-500">Student-portal goal:</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const num = value.trim() === '' ? null : Number(value);
          if (num !== targetValue && !(num !== null && Number.isNaN(num))) onSave(num);
        }}
        inputMode="decimal"
        placeholder="none"
        className="w-16 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-slate-200 outline-none focus:border-indigo-500"
      />
      {unit && <span className="text-slate-500">{unit}</span>}
    </div>
  );
}

export default function ProgressPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [metrics, setMetrics] = useState<MetricDefinitionWithTarget[]>([]);
  const [ownBatchesOnly, setOwnBatchesOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<RosterEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace').then((w) => setOrgId(w.activeOrgId));
  }, []);

  function loadMetrics() {
    if (!orgId) return;
    api<MetricDefinitionWithTarget[]>(`/api/v1/orgs/${orgId}/progress/metrics`).then(setMetrics).catch(() => {});
  }

  useEffect(loadMetrics, [orgId]);

  async function setMetricGoal(metricId: string, targetValue: number | null) {
    if (!orgId) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/progress/metrics/${metricId}`, { method: 'PATCH', body: JSON.stringify({ targetValue }) });
      loadMetrics();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  useEffect(() => {
    if (!orgId) return;
    setRoster(null);
    setSelected(null);
    api<RosterEntry[]>(`/api/v1/orgs/${orgId}/progress/roster${ownBatchesOnly ? '?ownBatches=true' : ''}`)
      .then(setRoster)
      .catch((err) => setError(err.message));
  }, [orgId, ownBatchesOnly]);

  const filtered = useMemo(() => {
    if (!roster) return [];
    const q = search.trim().toLowerCase();
    return q ? roster.filter((r) => r.displayName.toLowerCase().includes(q) || (r.rollNumber ?? '').toLowerCase().includes(q)) : roster;
  }, [roster, search]);

  if (orgId === null) {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }
  if (!orgId) {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-400">Select an active workspace first.</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader
        badge="Performance"
        badgeIcon={TrendingUp}
        title="Progress & Performance"
        description="Track trends and log new metrics for enrolled students."
      />

      <ErrorBanner error={error} />

      <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
        {/* Roster */}
        <aside className="space-y-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <input type="checkbox" checked={ownBatchesOnly} onChange={(e) => setOwnBatchesOnly(e.target.checked)} className="accent-indigo-500" />
            My batches only
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students…"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-sm text-slate-200 outline-none focus:border-indigo-500"
            />
          </div>
          {roster === null ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-400">No students.</p>
          ) : (
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto no-scrollbar">
              {filtered.map((r) => (
                <li key={r.enrollmentId}>
                  <button
                    onClick={() => setSelected(r)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      selected?.enrollmentId === r.enrollmentId ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="block font-medium">{r.displayName}</span>
                    <span className={`block text-xs ${selected?.enrollmentId === r.enrollmentId ? 'text-indigo-100' : 'text-slate-500'}`}>
                      {r.batchNames.length ? r.batchNames.join(', ') : 'No batch'}
                      {r.rollNumber ? ` · #${r.rollNumber}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Detail */}
        <section>
          {selected ? (
            <StudentProgress orgId={orgId} student={selected} metrics={metrics} onSetMetricGoal={setMetricGoal} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/10">
              <p className="text-sm text-slate-500">Select a student to view and log progress.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StudentProgress({
  orgId,
  student,
  metrics,
  onSetMetricGoal,
}: {
  orgId: string;
  student: RosterEntry;
  metrics: MetricDefinitionWithTarget[];
  onSetMetricGoal: (metricId: string, targetValue: number | null) => void;
}) {
  const [entries, setEntries] = useState<ProgressEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState('');
  const [value, setValue] = useState('');
  const [recordedOn, setRecordedOn] = useState(todayISO());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const metricByKey = useMemo(() => new Map(metrics.map((m) => [m.key, m])), [metrics]);

  function load() {
    setEntries(null);
    api<ProgressEntry[]>(`/api/v1/orgs/${orgId}/progress/entries?enrollmentId=${student.enrollmentId}`)
      .then(setEntries)
      .catch((err) => setError(err.message));
  }

  useEffect(load, [orgId, student.enrollmentId]);

  const grouped = useMemo(() => {
    const map = new Map<string, ProgressEntry[]>();
    for (const e of entries ?? []) {
      const arr = map.get(e.metricKey) ?? [];
      arr.push(e);
      map.set(e.metricKey, arr);
    }
    return map;
  }, [entries]);

  async function log() {
    if (!metricKey || value === '' || Number.isNaN(Number(value))) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/progress/entries`, {
        method: 'POST',
        body: JSON.stringify({ enrollmentId: student.enrollmentId, metricKey, value: Number(value), recordedOn, note: note.trim() || undefined }),
      });
      setValue('');
      setNote('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(id: string) {
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/progress/entries/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white">{student.displayName}</h2>
        <p className="text-xs text-slate-500">{student.batchNames.length ? student.batchNames.join(', ') : 'No batch'}</p>
      </div>

      <ErrorBanner error={error} />

      {/* Log form */}
      <div className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-white/5 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Metric</label>
          <select
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value)}
            className="w-56 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
          >
            <option value="">Select a metric…</option>
            {metrics.map((m) => (
              <option key={m.id} value={m.key}>
                {m.label}
                {m.unit ? ` (${m.unit})` : ''}
                {m.organizationId ? ' — custom' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Value</label>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
          <input
            type="date"
            value={recordedOn}
            onChange={(e) => setRecordedOn(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full min-w-[8rem] rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>
        <button
          disabled={busy || !metricKey || value === ''}
          onClick={log}
          className="flex items-center gap-1.5 rounded-lg border border-indigo-500 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Log
        </button>
      </div>

      {/* Trend cards */}
      {entries === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : grouped.size === 0 ? (
        <p className="text-sm text-slate-400">No progress logged yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...grouped.entries()].map(([key, list]) => {
            const def = metricByKey.get(key);
            const latest = list[list.length - 1];
            const prev = list.length > 1 ? list[list.length - 2] : null;
            const delta = prev ? latest.value - prev.value : null;
            const improved = delta !== null && def?.direction ? (def.direction === 'higher_better' ? delta > 0 : delta < 0) : null;
            return (
              <div key={key} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">{def?.label ?? key}</h3>
                  <span className="text-lg font-bold text-white">
                    {latest.value}
                    {def?.unit ? <span className="ml-1 text-xs font-normal text-slate-500">{def.unit}</span> : null}
                  </span>
                </div>
                <Sparkline values={list.map((e) => e.value)} direction={def?.direction ?? null} />
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {list.length} {list.length === 1 ? 'entry' : 'entries'} · latest {latest.recordedOn}
                  </span>
                  {delta !== null && (
                    <span className={improved === null ? 'text-slate-400' : improved ? 'text-emerald-400' : 'text-red-400'}>
                      {delta > 0 ? '+' : ''}
                      {delta.toFixed(2)} vs prev
                    </span>
                  )}
                </div>
                {def?.organizationId && (
                  <GoalEditor
                    metricId={def.id}
                    unit={def.unit}
                    targetValue={def.targetValue}
                    onSave={(v) => onSetMetricGoal(def.id, v)}
                  />
                )}
                <div className="mt-3 space-y-1 border-t border-white/5 pt-2">
                  {list
                    .slice()
                    .reverse()
                    .map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-xs text-slate-400">
                        <span>
                          {e.recordedOn}: <span className="text-slate-200">{e.value}</span>
                          {e.note ? <span className="text-slate-500"> — {e.note}</span> : null}
                        </span>
                        <button onClick={() => removeEntry(e.id)} className="text-slate-600 hover:text-red-400" title="Delete entry">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
