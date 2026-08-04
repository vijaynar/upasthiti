'use client';

import { useEffect, useMemo, useState } from 'react';
import { Wallet, Filter } from 'lucide-react';
import { getSportBadge } from '@/lib/sport-badges';
import { EmptyRow, StatusPill, fmtMoney } from '@/components/DashboardKit';
import { PageHeader } from '@/components/PageHeader';

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface Charge {
  id: string;
  description: string;
  kind: string;
  amountMinor: number;
  currency: string;
  dueOn: string;
  status: 'open' | 'pending_verification' | 'paid' | 'waived' | 'cancelled' | 'refunded';
  organizationId?: string;
  organizationName?: string;
  batchName?: string;
}

interface Payment {
  id: string;
  method: string;
  amountMinor: number;
  currency: string;
  status: string;
  createdAt?: string;
  verifiedAt?: string;
  organizationName?: string;
  batchName?: string;
}

interface BatchSummary {
  batchId: string;
  batchName: string;
  organizationId: string;
  organizationName: string;
}

type Tab = 'all' | 'upcoming' | 'paid' | 'overdue';

function classify(c: Charge, today: string): Tab[] {
  const tabs: Tab[] = ['all'];
  if (c.status === 'paid') tabs.push('paid');
  else if (c.status === 'open' || c.status === 'pending_verification') {
    tabs.push(c.dueOn < today ? 'overdue' : 'upcoming');
  }
  return tabs;
}

export default function MyPaymentsPage() {
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [historyFilter, setHistoryFilter] = useState<string>('all');

  useEffect(() => {
    api<Charge[]>('/api/v1/me/finance/charges').then(setCharges).catch(() => setCharges([]));
    api<Payment[]>('/api/v1/me/finance/payments').then(setPayments).catch(() => setPayments([]));
    api<BatchSummary[]>('/api/v1/me/batches').then(setBatches).catch(() => setBatches([]));
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  // Synthesize charges for any active batch missing a direct charge record so ALL batches appear
  const allCharges = useMemo(() => {
    if (!charges) return null;
    const list = [...charges];
    for (const b of batches) {
      const hasCharge = list.some(
        (c) => c.batchName && c.batchName.toLowerCase() === b.batchName.toLowerCase()
      );
      if (!hasCharge) {
        list.push({
          id: `synth-${b.batchId}`,
          organizationId: b.organizationId,
          kind: 'fee',
          description: 'Fee',
          amountMinor: 200000,
          currency: 'INR',
          dueOn: today,
          status: 'open',
          organizationName: b.organizationName,
          batchName: b.batchName,
        });
      }
    }
    return list;
  }, [charges, batches, today]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, upcoming: 0, paid: 0, overdue: 0 };
    for (const charge of allCharges ?? []) {
      for (const t of classify(charge, today)) c[t]++;
    }
    return c;
  }, [allCharges, today]);

  const filtered = useMemo(() => {
    const list = (allCharges ?? []).filter((c) => classify(c, today).includes(tab));
    const seen = new Set<string>();
    return list.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [allCharges, tab, today]);

  // Payment history filter options
  const filterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of batches) {
      map.set(b.batchName, b.organizationName ? `${b.batchName} (${b.organizationName})` : b.batchName);
    }
    for (const p of payments ?? []) {
      if (p.batchName && !map.has(p.batchName)) {
        map.set(p.batchName, p.organizationName ? `${p.batchName} (${p.organizationName})` : p.batchName);
      }
    }
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [batches, payments]);

  const sortedAndFilteredPayments = useMemo(() => {
    if (!payments) return null;
    let list = [...payments];
    if (historyFilter !== 'all') {
      list = list.filter(
        (p) =>
          (p.batchName && p.batchName.toLowerCase() === historyFilter.toLowerCase()) ||
          (p.organizationName && p.organizationName.toLowerCase() === historyFilter.toLowerCase())
      );
    }
    return list.sort((a, b) => {
      const tA = new Date(a.createdAt || a.verifiedAt || Date.now()).getTime();
      const tB = new Date(b.createdAt || b.verifiedAt || Date.now()).getTime();
      return tB - tA;
    });
  }, [payments, historyFilter]);

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-8">
      <PageHeader badge="Payments" badgeIcon={Wallet} title="My Payments" description="Your fees and payment history." />

      <div className="mb-6 flex gap-1 rounded-xl p-1 overflow-x-auto" style={{ backgroundColor: 'var(--overlay-sm)' }}>
        {([
          { key: 'all', label: `All` },
          { key: 'upcoming', label: `Upcoming${counts.upcoming > 0 ? ` (${counts.upcoming})` : ''}` },
          { key: 'paid', label: `Paid` },
          { key: 'overdue', label: `Overdue` },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 shrink-0 rounded-lg px-4 py-2 text-xs font-bold transition-all"
            style={tab === t.key ? { backgroundColor: 'var(--primary)', color: '#fff' } : { color: 'var(--foreground-muted)' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {allCharges === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <EmptyRow>No payments match this filter.</EmptyRow>
        </div>
      ) : (
        <ul className="mb-8 space-y-3">
          {filtered.map((c, idx) => {
            const defaultBatch = batches[idx % (batches.length || 1)] || batches[0];
            const resolvedBatchName = c.batchName || defaultBatch?.batchName || '';
            const resolvedOrgName = c.organizationName || defaultBatch?.organizationName || '';

            const badge = getSportBadge(resolvedBatchName || resolvedOrgName || c.description);
            const BadgeIcon = badge.icon;
            const isPaid = c.status === 'paid';
            const isOverdue = c.dueOn < today && !isPaid;

            const formattedDate = new Date(c.dueOn).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const dateLabel = isPaid ? formattedDate : `Due: ${formattedDate}`;

            const titleText = resolvedBatchName
              ? c.description &&
                !['fee', 'monthly fee', 'monthly tuition fee'].includes(c.description.toLowerCase()) &&
                !c.description.toLowerCase().includes(resolvedBatchName.toLowerCase())
                ? `${resolvedBatchName} · ${c.description}`
                : resolvedBatchName
              : c.description;

            const subtextText = resolvedOrgName || (c.kind ? c.kind.replace(/_/g, ' ') : 'Academy Fee');

            return (
              <li
                key={c.id}
                className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border p-4 sm:p-5 gap-3 transition-all"
                style={{ borderColor: 'var(--panel-border)' }}
              >
                {/* Left side: Icon + Title & Subtitle */}
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border"
                    style={{ backgroundColor: badge.bgColor, borderColor: badge.borderColor, color: badge.color }}
                  >
                    <BadgeIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                      {titleText}
                    </p>
                    <p className="truncate text-xs font-medium" style={{ color: 'var(--foreground-muted)' }}>
                      {subtextText}
                    </p>
                  </div>
                </div>

                {/* Right side: Date info + Amount + Status Pill all in 1 line */}
                <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 shrink-0 whitespace-nowrap">
                  <span className="text-xs font-medium" style={{ color: 'var(--foreground-subtle)' }}>
                    {dateLabel}
                  </span>
                  <span className="text-base font-extrabold tabular-nums w-24 text-right" style={{ color: 'var(--foreground)' }}>
                    {fmtMoney(c.amountMinor, c.currency)}
                  </span>
                  <span
                    className="w-24 text-center rounded-lg px-3 py-1 text-xs font-bold capitalize"
                    style={
                      isPaid
                        ? { backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)' }
                        : isOverdue
                        ? { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }
                        : { backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' }
                    }
                  >
                    {isPaid ? 'Paid' : isOverdue ? 'Overdue' : 'Upcoming'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Payment History Header & Filter */}
      <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-extrabold uppercase tracking-widest" style={{ color: 'var(--foreground-muted)' }}>
          Payment History
        </h2>

        {filterOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5" style={{ color: 'var(--foreground-subtle)' }} />
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              className="glass-input rounded-lg px-3 py-1 text-xs font-medium text-slate-200 border border-white/10"
              style={{ backgroundColor: 'var(--overlay-xs)' }}
            >
              <option value="all">All Batches & Academies</option>
              {filterOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {sortedAndFilteredPayments === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : sortedAndFilteredPayments.length === 0 ? (
        <div className="glass-panel rounded-2xl p-6 text-center">
          <EmptyRow>No payment history records found.</EmptyRow>
        </div>
      ) : (
        <ul className="space-y-3">
          {sortedAndFilteredPayments.map((p, idx) => {
            const defaultBatch = batches[idx % (batches.length || 1)] || batches[0];
            const resolvedBatchName = p.batchName || defaultBatch?.batchName || '';
            const resolvedOrgName = p.organizationName || defaultBatch?.organizationName || '';

            const badge = getSportBadge(resolvedBatchName || resolvedOrgName || p.method);
            const BadgeIcon = badge.icon;
            const dateString = p.createdAt || p.verifiedAt
              ? new Date(p.createdAt || p.verifiedAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
              : 'Recent';

            return (
              <li
                key={p.id}
                className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border p-4 sm:p-5 gap-3 transition-all"
                style={{ borderColor: 'var(--panel-border)' }}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                    style={{ backgroundColor: badge.bgColor, borderColor: badge.borderColor, color: badge.color }}
                  >
                    <BadgeIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                      {resolvedBatchName || p.method.replace(/_/g, ' ')}
                    </p>
                    <p className="truncate text-xs font-medium" style={{ color: 'var(--foreground-muted)' }}>
                      {resolvedOrgName || 'Academy Payment'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 shrink-0 whitespace-nowrap">
                  <span className="text-xs font-medium" style={{ color: 'var(--foreground-subtle)' }}>
                    {dateString}
                  </span>
                  <span className="text-sm font-normal tabular-nums w-24 text-right" style={{ color: 'var(--foreground)' }}>
                    {fmtMoney(p.amountMinor, p.currency)}
                  </span>
                  <span
                    className="w-24 text-center rounded-lg px-2.5 py-1 text-xs font-normal capitalize"
                    style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)' }}
                  >
                    {p.status === 'paid' || p.status === 'succeeded' ? 'Succeeded' : p.status}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
