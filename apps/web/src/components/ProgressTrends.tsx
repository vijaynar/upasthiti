'use client';

// Shared progress visualization (Phase 13) — a dependency-free SVG sparkline
// and a read-only grouped trend-card grid, reused by the staff /progress
// console, the student /me/progress self-view, and the guardian /family ward
// view. The staff console renders its own editable cards (delete + inline
// log) but imports Sparkline from here.

export type MetricDirection = 'higher_better' | 'lower_better' | null;

export interface MetricDefinition {
  id: string;
  organizationId: string | null;
  sportKey: string | null;
  key: string;
  label: string;
  unit: string | null;
  direction: MetricDirection;
}

export interface ProgressEntry {
  id: string;
  enrollmentId: string;
  metricKey: string;
  value: number;
  note: string | null;
  recordedOn: string;
  createdAt: string;
}

export function Sparkline({ values, direction }: { values: number[]; direction: MetricDirection }) {
  const W = 240;
  const H = 56;
  const P = 6;
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (W - 2 * P) / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = P + i * stepX;
    const y = H - P - ((v - min) / span) * (H - 2 * P);
    return { x, y };
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  let trendColor = 'var(--primary)';
  if (values.length > 1 && direction) {
    const delta = values[values.length - 1] - values[values.length - 2];
    const improved = direction === 'higher_better' ? delta > 0 : delta < 0;
    if (delta !== 0) trendColor = improved ? '#34d399' : '#f87171';
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={trendColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={trendColor} />
      ))}
    </svg>
  );
}

function groupByMetric(entries: ProgressEntry[]): Map<string, ProgressEntry[]> {
  const map = new Map<string, ProgressEntry[]>();
  for (const e of entries) {
    const arr = map.get(e.metricKey) ?? [];
    arr.push(e);
    map.set(e.metricKey, arr);
  }
  return map;
}

// Read-only trend cards — one per metric, latest value + sparkline + delta.
export function ProgressTrendCards({ entries, metrics }: { entries: ProgressEntry[]; metrics: MetricDefinition[] }) {
  const metricByKey = new Map(metrics.map((m) => [m.key, m]));
  const grouped = groupByMetric(entries);
  if (grouped.size === 0) {
    return <p className="text-sm text-slate-400">No progress recorded yet.</p>;
  }
  return (
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
          </div>
        );
      })}
    </div>
  );
}
