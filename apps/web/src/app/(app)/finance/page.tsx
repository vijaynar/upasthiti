'use client';

// Finance console (Doc 07 §9, Doc 04 §5 "Fee policies & fines"/"Charges &
// payments"/"Proof approval / waivers / refunds"/"Payouts & ledger" rows) —
// staff view for the active workspace: fee policies, charges, payment
// recording/approval, the ledger, payouts, and bank accounts. Mirrors
// /scheduling and /attendance's plain-fetch client component style.

import { useEffect, useState } from 'react';
import { Wallet, Plus, Check, X, Landmark, Receipt, ScrollText } from 'lucide-react';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

function formatMinor(amountMinor: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amountMinor / 100);
}

type FeePolicyKind = 'recurring_monthly' | 'recurring_term' | 'one_time' | 'per_session';
type ChargeStatus = 'open' | 'pending_verification' | 'paid' | 'waived' | 'cancelled' | 'refunded';
type ChargeKind = 'fee' | 'fine' | 'adjustment';
type PaymentStatus = 'initiated' | 'pending_verification' | 'succeeded' | 'failed' | 'rejected' | 'refunded';

interface FeePolicy {
  id: string;
  name: string;
  kind: FeePolicyKind;
  amountMinor: number;
  currency: string;
  status: 'active' | 'archived';
}

interface Charge {
  id: string;
  branchId: string;
  enrollmentId: string;
  kind: ChargeKind;
  description: string;
  amountMinor: number;
  currency: string;
  dueOn: string;
  status: ChargeStatus;
}

interface Payment {
  id: string;
  payerUserId: string;
  method: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  proofPath: string | null;
}

interface LedgerEntry {
  id: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  refType: string;
  refId: string;
  occurredAt: string;
}

interface Payout {
  id: string;
  amountMinor: number;
  currency: string;
  status: 'pending' | 'processing' | 'settled' | 'failed' | 'reversed';
}

interface Enrollment {
  id: string;
  studentUserId: string;
  branchId: string;
  rollNumber: string | null;
}

const CHARGE_STATUS_COLORS: Record<ChargeStatus, string> = {
  open: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  pending_verification: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  paid: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  waived: 'bg-white/10 text-slate-300 border border-white/10',
  cancelled: 'bg-white/5 text-slate-400 border border-white/10',
  refunded: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
};

export default function FinancePage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [feePolicies, setFeePolicies] = useState<FeePolicy[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace').then((w) => setOrgId(w.activeOrgId));
  }, []);

  function reloadAll() {
    if (!orgId) return;
    api<Enrollment[]>(`/api/v1/orgs/${orgId}/enrollments`).then(setEnrollments).catch(() => {});
    api<FeePolicy[]>(`/api/v1/orgs/${orgId}/finance/fee-policies`).then(setFeePolicies).catch((err) => setError(err.message));
    api<Charge[]>(`/api/v1/orgs/${orgId}/finance/charges`).then(setCharges).catch((err) => setError(err.message));
    api<Payment[]>(`/api/v1/orgs/${orgId}/finance/payments`).then(setPayments).catch(() => {});
    api<LedgerEntry[]>(`/api/v1/orgs/${orgId}/finance/ledger`).then(setLedger).catch(() => {});
    api<Payout[]>(`/api/v1/orgs/${orgId}/finance/payouts`).then(setPayouts).catch(() => {});
  }

  useEffect(reloadAll, [orgId]);

  const rollLabel = (enrollmentId: string) => enrollments.find((e) => e.id === enrollmentId)?.rollNumber ?? enrollmentId;

  async function run(action: () => Promise<unknown>, successMsg?: string) {
    setError(null);
    try {
      await action();
      if (successMsg) setNotice(successMsg);
      reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  if (orgId === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (orgId === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="glass-panel max-w-sm space-y-2 rounded-xl p-8 text-center">
          <Wallet className="mx-auto h-8 w-8 text-indigo-400" />
          <h1 className="text-lg font-semibold text-white">Finance</h1>
          <p className="text-sm text-slate-400">Pick an active workspace first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold text-white">
            <Wallet className="h-5 w-5 text-indigo-400" /> Finance
          </h1>
          <p className="text-sm text-slate-400">Fee policies, charges, payments, ledger, and payouts for the active workspace.</p>
        </div>

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">{notice}</div>}

        <FeePoliciesSection orgId={orgId} feePolicies={feePolicies} run={run} />
        <ChargesSection orgId={orgId} charges={charges} feePolicies={feePolicies} rollLabel={rollLabel} run={run} />
        <PaymentsSection orgId={orgId} payments={payments} charges={charges} run={run} />
        <PayoutsSection orgId={orgId} payouts={payouts} run={run} />
        <LedgerSection ledger={ledger} />
      </div>
    </div>
  );
}

function FeePoliciesSection({
  orgId,
  feePolicies,
  run,
}: {
  orgId: string;
  feePolicies: FeePolicy[];
  run: (action: () => Promise<unknown>, successMsg?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FeePolicyKind>('recurring_monthly');
  const [amount, setAmount] = useState('');
  const [absenceFine, setAbsenceFine] = useState('');

  async function submit() {
    if (!name.trim() || !amount) return;
    const finePolicy = absenceFine ? { absenceFine: { amountMinor: Math.round(Number(absenceFine) * 100) } } : undefined;
    await run(
      () =>
        api(`/api/v1/orgs/${orgId}/finance/fee-policies`, {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), kind, amountMinor: Math.round(Number(amount) * 100), finePolicy }),
        }),
      'Fee policy created.'
    );
    setName('');
    setAmount('');
    setAbsenceFine('');
    setOpen(false);
  }

  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Fee policies</h2>
        <button onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-slate-400 hover:text-white hover:underline">
          <Plus className="h-3.5 w-3.5" /> {open ? 'Close' : 'New policy'}
        </button>
      </div>

      {open && (
        <div className="mb-3 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex flex-wrap gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="glass-input flex-1 rounded-lg px-3 py-1.5 text-sm" />
            <select value={kind} onChange={(e) => setKind(e.target.value as FeePolicyKind)} className="glass-input rounded-lg px-3 py-1.5 text-sm">
              <option value="recurring_monthly">Recurring — monthly</option>
              <option value="recurring_term">Recurring — term</option>
              <option value="one_time">One-time</option>
              <option value="per_session">Per session</option>
            </select>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (₹)" type="number" className="glass-input w-32 rounded-lg px-3 py-1.5 text-sm" />
            <input
              value={absenceFine}
              onChange={(e) => setAbsenceFine(e.target.value)}
              placeholder="Absence fine (₹, optional)"
              type="number"
              className="glass-input w-44 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <p className="text-[11px] text-slate-400">Absence fine, if set, is what assessFine() charges automatically when a batch using this policy marks a student absent past grace period.</p>
          <button onClick={submit} className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold">
            Create
          </button>
        </div>
      )}

      {feePolicies.length === 0 ? (
        <p className="text-sm text-slate-400">No fee policies yet.</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {feePolicies.map((p) => (
            <li key={p.id} className="flex items-center justify-between p-3 text-sm">
              <span className="text-slate-200">
                {p.name} <span className="text-slate-400">({p.kind.replace('_', ' ')})</span>
              </span>
              <span className="font-semibold text-slate-100">{formatMinor(p.amountMinor, p.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChargesSection({
  orgId,
  charges,
  feePolicies,
  rollLabel,
  run,
}: {
  orgId: string;
  charges: Charge[];
  feePolicies: FeePolicy[];
  rollLabel: (enrollmentId: string) => string;
  run: (action: () => Promise<unknown>, successMsg?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [kind, setKind] = useState<ChargeKind>('fee');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueOn, setDueOn] = useState('');

  async function submit() {
    if (!enrollmentId.trim() || !branchId.trim() || !description.trim() || !amount || !dueOn) return;
    await run(
      () =>
        api(`/api/v1/orgs/${orgId}/finance/charges`, {
          method: 'POST',
          body: JSON.stringify({ enrollmentId: enrollmentId.trim(), branchId: branchId.trim(), kind, description: description.trim(), amountMinor: Math.round(Number(amount) * 100), dueOn }),
        }),
      'Charge created.'
    );
    setEnrollmentId('');
    setBranchId('');
    setDescription('');
    setAmount('');
    setDueOn('');
    setOpen(false);
  }

  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Receipt className="h-4 w-4 text-indigo-400" /> Charges
        </h2>
        <button onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-slate-400 hover:text-white hover:underline">
          <Plus className="h-3.5 w-3.5" /> {open ? 'Close' : 'New charge'}
        </button>
      </div>

      {open && (
        <div className="mb-3 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex flex-wrap gap-2">
            <input value={enrollmentId} onChange={(e) => setEnrollmentId(e.target.value)} placeholder="Enrollment ID" className="glass-input flex-1 rounded-lg px-3 py-1.5 text-sm" />
            <input value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="Branch ID" className="glass-input flex-1 rounded-lg px-3 py-1.5 text-sm" />
            <select value={kind} onChange={(e) => setKind(e.target.value as ChargeKind)} className="glass-input rounded-lg px-3 py-1.5 text-sm">
              <option value="fee">Fee</option>
              <option value="fine">Fine</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="glass-input flex-1 rounded-lg px-3 py-1.5 text-sm" />
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (₹)" type="number" className="glass-input w-32 rounded-lg px-3 py-1.5 text-sm" />
            <input value={dueOn} onChange={(e) => setDueOn(e.target.value)} type="date" className="glass-input rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <button onClick={submit} className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold">
            Create
          </button>
        </div>
      )}

      {feePolicies.length === 0 && <p className="mb-2 text-[11px] text-slate-400">No fee policies configured yet — charges can still be created ad hoc.</p>}

      {charges.length === 0 ? (
        <p className="text-sm text-slate-400">No charges yet.</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {charges.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <p className="text-slate-200">
                  {rollLabel(c.enrollmentId)} — {c.description}
                </p>
                <p className="text-xs text-slate-400">
                  {formatMinor(c.amountMinor, c.currency)} · due {c.dueOn}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CHARGE_STATUS_COLORS[c.status]}`}>{c.status.replace('_', ' ')}</span>
                {(c.status === 'open' || c.status === 'pending_verification') && (
                  <>
                    <button onClick={() => run(() => api(`/api/v1/orgs/${orgId}/finance/charges/${c.id}/waive`, { method: 'POST' }), 'Charge waived.')} className="btn-secondary rounded border border-white/10 px-1.5 py-1 text-[10px] font-medium text-slate-300 hover:bg-white/10">
                      Waive
                    </button>
                    <button onClick={() => run(() => api(`/api/v1/orgs/${orgId}/finance/charges/${c.id}/cancel`, { method: 'POST' }), 'Charge cancelled.')} className="btn-secondary rounded border border-white/10 px-1.5 py-1 text-[10px] font-medium text-slate-300 hover:bg-white/10">
                      Cancel
                    </button>
                  </>
                )}
                {c.status === 'paid' && (
                  <button onClick={() => run(() => api(`/api/v1/orgs/${orgId}/finance/charges/${c.id}/refund`, { method: 'POST' }), 'Charge refunded.')} className="rounded border border-purple-500/30 bg-purple-500/20 px-1.5 py-1 text-[10px] font-medium text-purple-300 hover:bg-purple-500/30">
                    Refund
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PaymentsSection({
  orgId,
  payments,
  charges,
  run,
}: {
  orgId: string;
  payments: Payment[];
  charges: Charge[];
  run: (action: () => Promise<unknown>, successMsg?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [payerUserId, setPayerUserId] = useState('');
  const [method, setMethod] = useState<'cash' | 'waiver'>('cash');
  const [amount, setAmount] = useState('');
  const [chargeIdsText, setChargeIdsText] = useState('');

  async function submit() {
    const chargeIds = chargeIdsText.split(',').map((s) => s.trim()).filter(Boolean);
    if (!payerUserId.trim() || !amount || chargeIds.length === 0) return;
    await run(
      () =>
        api(`/api/v1/orgs/${orgId}/finance/payments`, {
          method: 'POST',
          body: JSON.stringify({ payerUserId: payerUserId.trim(), method, amountMinor: Math.round(Number(amount) * 100), chargeIds }),
        }),
      'Payment recorded.'
    );
    setPayerUserId('');
    setAmount('');
    setChargeIdsText('');
    setOpen(false);
  }

  const pendingProof = payments.filter((p) => p.status === 'pending_verification' && p.method === 'manual_proof');

  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Payments</h2>
        <button onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-slate-400 hover:text-white hover:underline">
          <Plus className="h-3.5 w-3.5" /> {open ? 'Close' : 'Record cash/waiver'}
        </button>
      </div>

      {open && (
        <div className="mb-3 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex flex-wrap gap-2">
            <input value={payerUserId} onChange={(e) => setPayerUserId(e.target.value)} placeholder="Payer user ID" className="glass-input flex-1 rounded-lg px-3 py-1.5 text-sm" />
            <select value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'waiver')} className="glass-input rounded-lg px-3 py-1.5 text-sm">
              <option value="cash">Cash</option>
              <option value="waiver">Waiver</option>
            </select>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (₹)" type="number" className="glass-input w-32 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <input value={chargeIdsText} onChange={(e) => setChargeIdsText(e.target.value)} placeholder="Charge IDs, comma-separated" className="glass-input w-full rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={submit} className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold">
            Record
          </button>
        </div>
      )}

      {pendingProof.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1.5 text-xs font-semibold text-slate-300">Pending proof review</h3>
          <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
            {pendingProof.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="text-slate-200">
                  {formatMinor(p.amountMinor, p.currency)} — {p.proofPath ?? 'no proof path'}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const chargeIds = charges.filter((c) => c.status === 'open' || c.status === 'pending_verification').map((c) => c.id);
                      run(() => api(`/api/v1/orgs/${orgId}/finance/payments/${p.id}/approve`, { method: 'POST', body: JSON.stringify({ chargeIds }) }), 'Payment approved.');
                    }}
                    className="btn-premium flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold"
                  >
                    <Check className="h-3 w-3" /> Approve
                  </button>
                  <button
                    onClick={() => run(() => api(`/api/v1/orgs/${orgId}/finance/payments/${p.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'Rejected by staff' }) }), 'Payment rejected.')}
                    className="btn-secondary flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-300 hover:bg-white/10"
                  >
                    <X className="h-3 w-3" /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {payments.length === 0 ? (
        <p className="text-sm text-slate-400">No payments yet.</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {payments.slice(0, 20).map((p) => (
            <li key={p.id} className="flex items-center justify-between p-3 text-sm">
              <span className="text-slate-200">
                {formatMinor(p.amountMinor, p.currency)} <span className="text-slate-400">({p.method})</span>
              </span>
              <span className="text-xs text-slate-400 font-medium">{p.status.replace('_', ' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PayoutsSection({ orgId, payouts, run }: { orgId: string; payouts: Payout[]; run: (action: () => Promise<unknown>, successMsg?: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');

  async function submit() {
    if (!amount) return;
    await run(() => api(`/api/v1/orgs/${orgId}/finance/payouts`, { method: 'POST', body: JSON.stringify({ amountMinor: Math.round(Number(amount) * 100) }) }), 'Payout requested.');
    setAmount('');
    setOpen(false);
  }

  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Landmark className="h-4 w-4 text-indigo-400" /> Payouts
        </h2>
        <button onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-slate-400 hover:text-white hover:underline">
          <Plus className="h-3.5 w-3.5" /> {open ? 'Close' : 'Request payout'}
        </button>
      </div>

      {open && (
        <div className="mb-3 flex gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (₹)" type="number" className="glass-input flex-1 rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={submit} className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold">
            Request
          </button>
        </div>
      )}

      {payouts.length === 0 ? (
        <p className="text-sm text-slate-400">No payouts yet.</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {payouts.map((p) => (
            <li key={p.id} className="flex items-center justify-between p-3 text-sm">
              <span className="text-slate-200">{formatMinor(p.amountMinor, p.currency)}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">{p.status}</span>
                {p.status === 'pending' && (
                  <>
                    <button onClick={() => run(() => api(`/api/v1/orgs/${orgId}/finance/payouts/${p.id}/settle`, { method: 'POST' }), 'Payout settled.')} className="btn-premium rounded px-2 py-1 text-[10px] font-semibold">
                      Settle
                    </button>
                    <button onClick={() => run(() => api(`/api/v1/orgs/${orgId}/finance/payouts/${p.id}/fail`, { method: 'POST' }), 'Payout marked failed.')} className="btn-secondary rounded border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-300 hover:bg-white/10">
                      Mark failed
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LedgerSection({ ledger }: { ledger: LedgerEntry[] }) {
  return (
    <section className="glass-panel rounded-xl p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-white">
        <ScrollText className="h-4 w-4 text-indigo-400" /> Ledger
      </h2>
      {ledger.length === 0 ? (
        <p className="text-sm text-slate-400">No ledger entries yet.</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {ledger.slice(0, 20).map((e) => (
            <li key={e.id} className="flex items-center justify-between p-3 text-xs">
              <span className="text-slate-400">
                {e.refType} · {new Date(e.occurredAt).toLocaleString()}
              </span>
              <span className={e.amountMinor >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-red-400'}>
                {e.amountMinor >= 0 ? '+' : ''}
                {formatMinor(e.amountMinor, e.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
