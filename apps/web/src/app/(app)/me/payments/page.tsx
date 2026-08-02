'use client';

// "Payments" — the signed-in student's full fee record (docsV2/
// STUDENT_PORTAL_SPEC.md Tier 1), backed entirely by existing self-service
// finance reads (/api/v1/me/finance/charges, /payments — Phase 9). Tabs are
// derived from each charge's status + due date rather than a separate
// server-side filter, since the dataset per student is small.

import { useEffect, useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
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
}

interface Payment {
  id: string;
  method: string;
  amountMinor: number;
  currency: string;
  status: string;
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
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    api<Charge[]>('/api/v1/me/finance/charges').then(setCharges).catch(() => setCharges([]));
    api<Payment[]>('/api/v1/me/finance/payments').then(setPayments).catch(() => setPayments([]));
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, upcoming: 0, paid: 0, overdue: 0 };
    for (const charge of charges ?? []) {
      for (const t of classify(charge, today)) c[t]++;
    }
    return c;
  }, [charges, today]);

  const filtered = useMemo(() => (charges ?? []).filter((c) => classify(c, today).includes(tab)), [charges, tab, today]);

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-8">
      <PageHeader badge="Payments" badgeIcon={Wallet} title="My Payments" description="Your fees and payment history." />

      <div className="mb-5 flex gap-1 rounded-xl p-1" style={{ backgroundColor: 'var(--overlay-sm)' }}>
        {(['all', 'upcoming', 'paid', 'overdue'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all"
            style={tab === t ? { backgroundColor: 'var(--primary)', color: '#fff' } : { color: 'var(--foreground-muted)' }}
          >
            {t} {counts[t] > 0 ? `(${counts[t]})` : ''}
          </button>
        ))}
      </div>

      {charges === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 text-center">
          <EmptyRow>Nothing here.</EmptyRow>
        </div>
      ) : (
        <ul className="mb-8 space-y-2">
          {filtered.map((c) => (
            <li key={c.id} className="glass-panel flex items-center justify-between rounded-xl border p-4" style={{ borderColor: 'var(--panel-border)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  {c.description}
                </p>
                <p className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>
                  Due {new Date(c.dueOn).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                  {fmtMoney(c.amountMinor, c.currency)}
                </p>
                <StatusPill status={c.status} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--foreground-muted)' }}>
        Payment history
      </h2>
      {payments === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : payments.length === 0 ? (
        <EmptyRow>No payments recorded yet.</EmptyRow>
      ) : (
        <ul className="space-y-2">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--overlay-xs)' }}>
              <span className="text-sm capitalize" style={{ color: 'var(--foreground)' }}>
                {p.method.replace(/_/g, ' ')}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  {fmtMoney(p.amountMinor, p.currency)}
                </span>
                <StatusPill status={p.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
