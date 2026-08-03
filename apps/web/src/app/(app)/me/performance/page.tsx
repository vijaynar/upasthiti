'use client';

// "Performance" — the signed-in student's full progress record (docsV2/
// STUDENT_PORTAL_SPEC.md Tier 1). No per-batch tabs here, unlike Attendance:
// progress_entries has no batch_id (one enrollment can span several
// batches), so a per-batch split would be fabricated. The per-metric
// "Skill Breakdown" cards (ProgressTrendCards, same component /me/progress
// and the batch-detail Performance tab already use) are the real grain this
// schema supports. Coach Rating is deliberately omitted (resolved open
// question: no rating data exists yet, acceptable to skip for this pass
// rather than show a placeholder).

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Award, ClipboardCheck } from 'lucide-react';
import { StatCard, EmptyRow } from '@/components/DashboardKit';
import { ProgressTrendCards, type MetricDefinition, type ProgressEntry } from '@/components/ProgressTrends';
import { PageHeader } from '@/components/PageHeader';

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface BatchSummary {
  progress: { tracked: boolean; pct: number | null };
}

export default function MyPerformancePage() {
  const [entries, setEntries] = useState<ProgressEntry[] | null>(null);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);

  useEffect(() => {
    api<ProgressEntry[]>('/api/v1/me/progress').then(setEntries).catch(() => setEntries([]));
    api<MetricDefinition[]>('/api/v1/me/progress/metrics').then(setMetrics).catch(() => {});
    api<BatchSummary[]>('/api/v1/me/batches').then(setBatches).catch(() => {});
  }, []);

  const metricByKey = useMemo(() => new Map(metrics.map((m) => [m.key, m])), [metrics]);

  const stats = useMemo(() => {
    const tracked = batches.filter((b) => b.progress.tracked && b.progress.pct !== null);
    const overallPct = tracked.length === 0 ? null : Math.round(tracked.reduce((s, b) => s + (b.progress.pct ?? 0), 0) / tracked.length);

    const grouped = new Map<string, ProgressEntry[]>();
    for (const e of entries ?? []) {
      const arr = grouped.get(e.metricKey) ?? [];
      arr.push(e);
      grouped.set(e.metricKey, arr);
    }
    let improved = 0;
    for (const [key, list] of grouped) {
      if (list.length < 2) continue;
      const sorted = [...list].sort((a, b) => (a.recordedOn < b.recordedOn ? -1 : 1));
      const delta = sorted[sorted.length - 1].value - sorted[0].value;
      const direction = metricByKey.get(key)?.direction;
      if (direction ? (direction === 'higher_better' ? delta > 0 : delta < 0) : delta !== 0) improved++;
    }

    const assessmentDays = new Set((entries ?? []).map((e) => e.recordedOn)).size;

    return { overallPct, improved, assessmentDays };
  }, [batches, entries, metricByKey]);

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-8">
      <PageHeader badge="Performance" badgeIcon={TrendingUp} title="My Performance" description="Track your progress across all your batches." />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Overall progress" value={stats.overallPct === null ? '—' : `${stats.overallPct}%`} icon={TrendingUp} tone="accent" />
        <StatCard label="Skills improved" value={stats.improved} icon={Award} tone="success" />
        <StatCard label="Assessments logged" value={stats.assessmentDays} icon={ClipboardCheck} tone="primary" />
      </div>

      <h2 className="mb-3 text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--foreground-muted)' }}>
        Skill breakdown
      </h2>
      {entries === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 text-center">
          <EmptyRow>No progress has been recorded for you yet.</EmptyRow>
        </div>
      ) : (
        <ProgressTrendCards entries={entries} metrics={metrics} />
      )}
    </div>
  );
}
