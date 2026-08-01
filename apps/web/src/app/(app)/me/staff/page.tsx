'use client';

// Self-service HR (Doc 04 §5 "HR & payroll" row, 🔷 self column) — my own
// profile, availability, leave requests, documents, and pay info in my
// active organization. Mirrors /family's self-service style.

import { useEffect, useState } from 'react';
import { Briefcase, CalendarPlus, FileUp, IndianRupee } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface StaffProfile {
  id: string;
  designation: string | null;
  employmentType: string;
  status: string;
}

interface LeaveRequest {
  id: string;
  kind: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  status: string;
  decisionNote: string | null;
}

interface StaffDocument {
  id: string;
  docType: string;
  storagePath: string;
  reviewStatus: string;
}

interface PayoutSettings {
  payType: string;
  amountMinor: number | null;
  currency: string;
  commissionPct: number | null;
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>;
}

export default function MyStaffPage() {
  const [profile, setProfile] = useState<StaffProfile | null | undefined>(undefined);

  useEffect(() => {
    api<StaffProfile | null>('/api/v1/me/staff-profile').then(setProfile);
  }, []);

  if (profile === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="glass-panel max-w-sm space-y-2 rounded-xl p-8 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-slate-600" />
          <h1 className="text-lg font-semibold text-white">My HR</h1>
          <p className="text-sm text-slate-400">You don&apos;t have a staff profile in your active workspace.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <PageHeader
        badge="My HR"
        badgeIcon={Briefcase}
        title="My HR"
        description={
          <>
            {profile.designation || profile.employmentType.replace('_', ' ')} · <span className="uppercase">{profile.status}</span>
          </>
        }
      />

      <div className="space-y-6">
        <LeaveRequestsCard />
        <DocumentsCard />
        <PayoutCard />
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-xl p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        {icon} {title}
      </h2>
      {children}
    </div>
  );
}

function LeaveRequestsCard() {
  const [leaves, setLeaves] = useState<LeaveRequest[] | null>(null);
  const [kind, setKind] = useState('casual');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<LeaveRequest[]>('/api/v1/me/staff/leave-requests').then(setLeaves).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function submit() {
    if (!startsOn || !endsOn) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/me/staff/leave-requests', { method: 'POST', body: JSON.stringify({ kind, startsOn, endsOn, reason: reason.trim() || undefined }) });
      setStartsOn('');
      setEndsOn('');
      setReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setError(null);
    try {
      await api(`/api/v1/me/staff/leave-requests/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <Card title="Leave requests" icon={<CalendarPlus className="h-4 w-4 text-indigo-400" />}>
      <ErrorBanner error={error} />
      {leaves === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : leaves.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400">No leave requests yet.</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {leaves.map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-1.5 text-sm">
              <span className="text-slate-300">
                <span className="capitalize">{l.kind}</span>: {l.startsOn} → {l.endsOn}{' '}
                <span className="uppercase text-slate-500">({l.status})</span>
              </span>
              {l.status === 'pending' && (
                <button onClick={() => cancel(l.id)} className="text-xs font-medium text-red-400 hover:underline">
                  Withdraw
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
        >
          <option value="casual">Casual</option>
          <option value="sick">Sick</option>
          <option value="earned">Earned</option>
          <option value="unpaid">Unpaid</option>
          <option value="other">Other</option>
        </select>
        <input
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
        />
        <input
          type="date"
          value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="min-w-[10rem] flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
        />
        <button
          disabled={busy || !startsOn || !endsOn}
          onClick={submit}
          className="rounded-lg border border-indigo-500 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Request
        </button>
      </div>
    </Card>
  );
}

function DocumentsCard() {
  const [docs, setDocs] = useState<StaffDocument[] | null>(null);
  const [docType, setDocType] = useState('id_proof');
  const [storagePath, setStoragePath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<StaffDocument[]>('/api/v1/me/staff/documents').then(setDocs).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function upload() {
    if (!storagePath.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/me/staff/documents', { method: 'POST', body: JSON.stringify({ docType, storagePath: storagePath.trim() }) });
      setStoragePath('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api(`/api/v1/me/staff/documents/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <Card title="My documents" icon={<FileUp className="h-4 w-4 text-indigo-400" />}>
      <ErrorBanner error={error} />
      {docs === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400">Nothing uploaded yet.</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-1.5 text-sm">
              <span className="text-slate-300">
                <span className="capitalize">{d.docType.replace('_', ' ')}</span> — {d.storagePath}{' '}
                <span className="uppercase text-slate-500">({d.reviewStatus})</span>
              </span>
              {d.reviewStatus === 'pending' && (
                <button onClick={() => remove(d.id)} className="text-xs font-medium text-red-400 hover:underline">
                  Withdraw
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
        >
          <option value="id_proof">ID proof</option>
          <option value="address_proof">Address proof</option>
          <option value="certification">Certification</option>
          <option value="background_check">Background check</option>
          <option value="other">Other</option>
        </select>
        <input
          value={storagePath}
          onChange={(e) => setStoragePath(e.target.value)}
          placeholder="Document reference / link"
          className="min-w-[10rem] flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
        />
        <button
          disabled={busy || !storagePath.trim()}
          onClick={upload}
          className="rounded-lg border border-indigo-500 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Upload
        </button>
      </div>
    </Card>
  );
}

function PayoutCard() {
  const [payout, setPayout] = useState<PayoutSettings | null | undefined>(undefined);

  useEffect(() => {
    api<PayoutSettings | null>('/api/v1/me/staff/payout-settings').then(setPayout);
  }, []);

  return (
    <Card title="My pay settings" icon={<IndianRupee className="h-4 w-4 text-indigo-400" />}>
      {payout === undefined ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : payout === null ? (
        <p className="text-sm text-slate-400">Not configured yet — your organization will set this up.</p>
      ) : (
        <p className="text-sm text-slate-300">
          {payout.payType === 'commission'
            ? `${payout.commissionPct}% commission`
            : `${payout.currency} ${((payout.amountMinor ?? 0) / 100).toLocaleString()} (${payout.payType})`}
        </p>
      )}
    </Card>
  );
}
