'use client';

// Staff HR console (Doc 07 §12, Doc 04 §4/§5 "HR & payroll" row) — org staff
// directory, document review, availability visibility, leave decisions, and
// pay configuration. Coach onboarding itself (the invite/join-request paths,
// Doc 04 §8) already exists since Phase 3/4 — "Onboard staff" here creates
// the HR profile for an existing active member, it doesn't grant the role.

import { useEffect, useState } from 'react';
import { Briefcase, Calendar, CheckCircle2, ChevronDown, ChevronRight, FileText, IndianRupee, UserPlus, XCircle } from 'lucide-react';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

type Tab = 'directory' | 'leaves';

interface StaffProfile {
  id: string;
  branchId: string | null;
  userId: string;
  displayName: string;
  designation: string | null;
  employmentType: string;
  status: string;
  notes: string | null;
}

interface OnboardableMember {
  membershipId: string;
  userId: string;
  displayName: string;
  branchId: string | null;
}

interface StaffDocument {
  id: string;
  docType: string;
  storagePath: string;
  reviewStatus: string;
  reviewNote: string | null;
}

interface AvailabilitySlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface PayoutSettings {
  payType: string;
  amountMinor: number | null;
  currency: string;
  commissionPct: number | null;
  notes: string | null;
  updatedAt: string;
}

interface LeaveRequest {
  id: string;
  staffProfileId: string;
  kind: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  status: string;
  decisionNote: string | null;
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>;
}

export default function StaffHrPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('directory');

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace').then((w) => setOrgId(w.activeOrgId));
  }, []);

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
      <div className="mb-6 flex items-center gap-2">
        <Briefcase className="h-5 w-5 text-indigo-400" />
        <h1 className="text-lg font-semibold text-white">Staff HR</h1>
      </div>

      <div className="mb-6 flex gap-2 border-b border-white/10">
        {(['directory', 'leaves'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition ${
              tab === t ? 'border-b-2 border-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'directory' ? 'Staff directory' : 'Leave requests'}
          </button>
        ))}
      </div>

      {tab === 'directory' ? <StaffDirectory orgId={orgId} /> : <LeaveRequestsPanel orgId={orgId} />}
    </div>
  );
}

function StaffDirectory({ orgId }: { orgId: string }) {
  const [staff, setStaff] = useState<StaffProfile[] | null>(null);
  const [onboardable, setOnboardable] = useState<OnboardableMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const [membershipId, setMembershipId] = useState('');
  const [designation, setDesignation] = useState('');
  const [employmentType, setEmploymentType] = useState('full_time');
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function load() {
    api<StaffProfile[]>(`/api/v1/orgs/${orgId}/staff`).then(setStaff).catch((err) => setError(err.message));
    api<OnboardableMember[]>(`/api/v1/orgs/${orgId}/staff/onboardable`).then(setOnboardable).catch(() => {});
  }

  useEffect(load, [orgId]);

  async function onboard() {
    if (!membershipId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/staff`, {
        method: 'POST',
        body: JSON.stringify({ membershipId, designation: designation.trim() || undefined, employmentType }),
      });
      setMembershipId('');
      setDesignation('');
      setShowOnboard(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/staff/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div>
      <ErrorBanner error={error} />

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">Everyone with an HR profile in this organization.</p>
        <button
          onClick={() => setShowOnboard(!showOnboard)}
          className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20"
        >
          <UserPlus className="h-3.5 w-3.5" /> Onboard staff
        </button>
      </div>

      {showOnboard && (
        <div className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-white/5 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Member</label>
            <select
              value={membershipId}
              onChange={(e) => setMembershipId(e.target.value)}
              className="w-56 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
            >
              <option value="">Select a member…</option>
              {onboardable.map((m) => (
                <option key={m.membershipId} value={m.membershipId}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Designation</label>
            <input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Head Coach"
              className="w-44 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Employment type</label>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
            >
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
              <option value="contract">Contract</option>
              <option value="volunteer">Volunteer</option>
            </select>
          </div>
          <button
            disabled={busy || !membershipId}
            onClick={onboard}
            className="rounded-lg border border-indigo-500 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            Onboard
          </button>
        </div>
      )}

      {staff === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-slate-400">No staff onboarded yet.</p>
      ) : (
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
          {staff.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-white/5"
              >
                <div className="flex items-center gap-2">
                  {expandedId === s.id ? (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-200">{s.displayName}</p>
                    <p className="text-xs text-slate-500">
                      {s.designation || s.employmentType.replace('_', ' ')} · <span className="uppercase">{s.status}</span>
                    </p>
                  </div>
                </div>
                {s.status !== 'offboarded' && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatus(s.id, 'offboarded');
                    }}
                    className="text-xs font-medium text-red-400 hover:underline"
                  >
                    Offboard
                  </span>
                )}
              </button>
              {expandedId === s.id && <StaffDetail orgId={orgId} staffId={s.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StaffDetail({ orgId, staffId }: { orgId: string; staffId: string }) {
  const [documents, setDocuments] = useState<StaffDocument[] | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySlot[] | null>(null);
  const [payout, setPayout] = useState<PayoutSettings | null>(null);
  const [payType, setPayType] = useState('salary');
  const [amount, setAmount] = useState('');
  const [commissionPct, setCommissionPct] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<StaffDocument[]>(`/api/v1/orgs/${orgId}/staff/${staffId}/documents`).then(setDocuments).catch(() => {});
    api<AvailabilitySlot[]>(`/api/v1/orgs/${orgId}/staff/${staffId}/availability`).then(setAvailability).catch(() => {});
    api<PayoutSettings | null>(`/api/v1/orgs/${orgId}/staff/${staffId}/payout-settings`)
      .then((p) => {
        setPayout(p);
        if (p) {
          setPayType(p.payType);
          setAmount(p.amountMinor !== null ? String(p.amountMinor / 100) : '');
          setCommissionPct(p.commissionPct !== null ? String(p.commissionPct) : '');
        }
      })
      .catch(() => {});
  }

  useEffect(load, [orgId, staffId]);

  async function reviewDoc(docId: string, decision: 'approved' | 'rejected') {
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/staff/${staffId}/documents/${docId}`, { method: 'PATCH', body: JSON.stringify({ decision }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function savePayout() {
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/staff/${staffId}/payout-settings`, {
        method: 'PUT',
        body: JSON.stringify({
          payType,
          amountMinor: amount ? Math.round(Number(amount) * 100) : undefined,
          commissionPct: commissionPct ? Number(commissionPct) : undefined,
        }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="border-t border-white/5 bg-white/[0.02] p-4">
      <ErrorBanner error={error} />

      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <FileText className="h-3.5 w-3.5" /> Documents
          </h4>
          {documents === null ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : documents.length === 0 ? (
            <p className="text-xs text-slate-500">None uploaded.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((d) => (
                <li key={d.id} className="rounded-lg border border-white/10 p-2 text-xs">
                  <p className="font-medium text-slate-300">{d.docType.replace('_', ' ')}</p>
                  <p className="text-slate-500">{d.storagePath}</p>
                  <p className="mt-1 uppercase text-slate-400">{d.reviewStatus}</p>
                  {d.reviewStatus === 'pending' && (
                    <div className="mt-1 flex gap-2">
                      <button onClick={() => reviewDoc(d.id, 'approved')} className="text-emerald-400 hover:underline">
                        Approve
                      </button>
                      <button onClick={() => reviewDoc(d.id, 'rejected')} className="text-red-400 hover:underline">
                        Reject
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Calendar className="h-3.5 w-3.5" /> Availability
          </h4>
          {availability === null ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : availability.length === 0 ? (
            <p className="text-xs text-slate-500">Not set.</p>
          ) : (
            <ul className="space-y-1 text-xs text-slate-400">
              {availability.map((a) => (
                <li key={a.id}>
                  {DAY_NAMES[a.dayOfWeek]} {a.startTime}–{a.endTime}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <IndianRupee className="h-3.5 w-3.5" /> Pay settings
          </h4>
          <div className="space-y-2">
            <select
              value={payType}
              onChange={(e) => setPayType(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
            >
              <option value="salary">Salary</option>
              <option value="commission">Commission</option>
              <option value="hourly">Hourly</option>
            </select>
            {payType !== 'commission' && (
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount (₹)"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
              />
            )}
            {payType === 'commission' && (
              <input
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
                placeholder="Commission %"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
              />
            )}
            <button
              onClick={savePayout}
              className="w-full rounded-lg border border-indigo-500 bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Save
            </button>
            {payout?.updatedAt && <p className="text-[10px] text-slate-500">Last updated {new Date(payout.updatedAt).toLocaleDateString()}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeaveRequestsPanel({ orgId }: { orgId: string }) {
  const [leaves, setLeaves] = useState<LeaveRequest[] | null>(null);
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<LeaveRequest[]>(`/api/v1/orgs/${orgId}/leave-requests?status=${status}`).then(setLeaves).catch((err) => setError(err.message));
  }

  useEffect(load, [orgId, status]);

  async function decide(id: string, decision: 'approved' | 'rejected') {
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/leave-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ decision }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div>
      <ErrorBanner error={error} />
      <div className="mb-4 flex gap-2">
        {['pending', 'approved', 'rejected', 'cancelled'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
              status === s ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {leaves === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : leaves.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
          {leaves.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium text-slate-200 capitalize">{l.kind} leave</p>
                <p className="text-xs text-slate-500">
                  {l.startsOn} → {l.endsOn}
                  {l.reason ? ` · ${l.reason}` : ''}
                </p>
                {l.decisionNote && <p className="text-xs text-slate-500">Note: {l.decisionNote}</p>}
              </div>
              {l.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => decide(l.id, 'approved')}
                    className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => decide(l.id, 'rejected')}
                    className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
