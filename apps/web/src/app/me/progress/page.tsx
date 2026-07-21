'use client';

// Student self-view of progress (Doc 04 §5 "Progress & performance" 🔷 self)
// — any signed-in user sees their own recorded metrics (RLS
// progress_entries_select_self). Metric labels resolve from the platform
// library (always visible) plus the active org's custom metrics. Standalone
// self-service page, same shape as /me/notifications.

import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { ProgressTrendCards, type MetricDefinition, type ProgressEntry } from '@/components/ProgressTrends';

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

export default function MyProgressPage() {
  const [entries, setEntries] = useState<ProgressEntry[] | null>(null);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);

  useEffect(() => {
    api<ProgressEntry[]>('/api/v1/me/progress').then(setEntries).catch(() => setEntries([]));
    api<MetricDefinition[]>('/api/v1/me/progress/metrics').then(setMetrics).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-indigo-400" />
        <h1 className="text-lg font-semibold text-white">My progress</h1>
      </div>
      {entries === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 text-center">
          <p className="text-sm text-slate-400">No progress has been recorded for you yet.</p>
        </div>
      ) : (
        <ProgressTrendCards entries={entries} metrics={metrics} />
      )}
    </div>
  );
}
