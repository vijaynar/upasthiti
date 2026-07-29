'use client';

// Student self-view of progress (Doc 04 §5 "Progress & performance" 🔷 self)
// — any signed-in user sees their own recorded metrics (RLS
// progress_entries_select_self). Metric labels resolve from the platform
// library (always visible) plus the active org's custom metrics. Standalone
// self-service page, same shape as /me/notifications.

import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { ProgressTrendCards, type MetricDefinition, type ProgressEntry } from '@/components/ProgressTrends';
import { PageHeader } from '@/components/PageHeader';

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
    <div className="mx-auto max-w-3xl p-8">
      <PageHeader badge="My Progress" badgeIcon={TrendingUp} title="My progress" description="Your recorded metrics, tracked over time." />
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
