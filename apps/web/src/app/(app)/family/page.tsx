'use client';

// Family (Doc 02 §9 "I'm a parent/student", Doc 04 §7) — a guardian's own
// view: the wards they've added, adding a new one, and requesting a ward's
// enrollment at an organization. Standalone from /onboarding (which is a
// pre-membership, one-time flow) since guardianship is an ongoing identity-
// level relationship a parent revisits over time.

import { useEffect, useState } from 'react';
import { Users, UserPlus, Search, CheckCircle2, AlertCircle, Fingerprint, Copy, Wallet, TrendingUp } from 'lucide-react';
import { ProgressTrendCards, type MetricDefinition, type ProgressEntry } from '@/components/ProgressTrends';
import { PageHeader } from '@/components/PageHeader';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface Ward {
  wardUserId: string;
  displayName: string;
  dob: string | null;
  relationship: 'father' | 'mother' | 'guardian';
  consentAuthority: boolean;
}

function AddWardForm({ onAdded }: { onAdded: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [dob, setDob] = useState('');
  const [relationship, setRelationship] = useState<'father' | 'mother' | 'guardian'>('father');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!displayName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/me/wards', {
        method: 'POST',
        body: JSON.stringify({ displayName: displayName.trim(), dob: dob || undefined, relationship }),
      });
      setDisplayName('');
      setDob('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-panel mb-5 space-y-2 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-white">Add a child</h2>
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="glass-input w-full rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Date of birth</label>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="glass-input rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Relationship</label>
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value as typeof relationship)}
            className="glass-input rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="father">Father</option>
            <option value="mother">Mother</option>
            <option value="guardian">Guardian</option>
          </select>
        </div>
        <button
          disabled={busy || !displayName.trim()}
          onClick={submit}
          className="btn-premium flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          <UserPlus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

// Doc 04 §5 "Face enrollment" row: Parent's role is "consent only" — the
// actual embedding capture happens on the org's /attendance staff console
// (requires attendance.face.enroll, which guardians never hold). This just
// grants the consents row and surfaces its id for the guardian to hand to
// staff (shown on-screen, e.g. read aloud or shown on the phone).
function BiometricConsentButton({ ward }: { ward: Ward }) {
  const [consentId, setConsentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function grant() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ consentId: string }>('/api/v1/me/consents', {
        method: 'POST',
        body: JSON.stringify({ subjectUserId: ward.wardUserId, kind: 'biometric_face', evidence: { method: 'family_portal' } }),
      });
      setConsentId(result.consentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grant consent.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!consentId) return;
    await navigator.clipboard.writeText(consentId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!ward.consentAuthority) return null;

  return (
    <div className="mt-2">
      {error && <p className="mb-1 text-xs text-red-400">{error}</p>}
      {consentId ? (
        <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px]">
          <code className="truncate text-slate-300">{consentId}</code>
          <button onClick={copy} className="shrink-0 text-slate-400 hover:text-white">
            <Copy className="h-3 w-3" />
          </button>
          {copied && <span className="shrink-0 text-emerald-400">Copied</span>}
        </div>
      ) : (
        <button
          disabled={busy}
          onClick={grant}
          className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white hover:underline disabled:opacity-50"
        >
          <Fingerprint className="h-3.5 w-3.5 text-indigo-400" /> Grant biometric (face) consent
        </button>
      )}
      {consentId && <p className="mt-1 text-[10px] text-slate-400">Show this ID to staff to enroll {ward.displayName}&apos;s face for attendance.</p>}
    </div>
  );
}

interface WardCharge {
  id: string;
  description: string;
  amountMinor: number;
  currency: string;
  dueOn: string;
  status: 'open' | 'pending_verification' | 'paid' | 'waived' | 'cancelled' | 'refunded';
}

function formatMinor(amountMinor: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amountMinor / 100);
}

// Doc 04 §5 "Progress & performance" row: Parent is "🔷 wards" — a guardian
// reads a ward's recorded metrics via is_my_ward()-backed RLS (migration
// 0015, progress_entries_select_guardian). Read-only: guardians never log.
// Metric labels resolve from the platform library (always visible) plus the
// guardian's active org's custom metrics, if any.
function WardProgressSection({ ward }: { ward: Ward }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ProgressEntry[] | null>(null);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api<ProgressEntry[]>(`/api/v1/me/wards/${ward.wardUserId}/progress`)
      .then(setEntries)
      .catch((err) => setError(err.message));
    api<MetricDefinition[]>('/api/v1/me/progress/metrics')
      .then(setMetrics)
      .catch(() => {});
  }, [open]);

  return (
    <div className="mt-2">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white hover:underline">
        <TrendingUp className="h-3.5 w-3.5 text-indigo-400" /> {open ? 'Hide progress' : 'View progress'}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3">
          {error && <p className="text-xs text-red-400">{error}</p>}
          {entries === null ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : (
            <ProgressTrendCards entries={entries} metrics={metrics} />
          )}
        </div>
      )}
    </div>
  );
}

// Doc 04 §5 "Charges & payments" row: Parent is "🔷 wards + pay" — a
// guardian can see a ward's charges (is_my_ward()-backed RLS, migration
// 0011) and submit proof of a payment they've made outside the app; a
// finance.proof.approve holder later confirms it on the org's /finance
// console. No gateway checkout exists yet (see migration 0011's header).
function WardFeesSection({ ward }: { ward: Ward }) {
  const [open, setOpen] = useState(false);
  const [charges, setCharges] = useState<WardCharge[] | null>(null);
  const [proofCharge, setProofCharge] = useState<WardCharge | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [proofPath, setProofPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    api<WardCharge[]>(`/api/v1/me/wards/${ward.wardUserId}/finance/charges`)
      .then(setCharges)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  async function submitProof() {
    if (!proofCharge || !organizationId.trim() || !proofPath.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/me/finance/payments', {
        method: 'POST',
        body: JSON.stringify({ organizationId: organizationId.trim(), amountMinor: proofCharge.amountMinor, currency: proofCharge.currency, proofPath: proofPath.trim() }),
      });
      setNotice('Proof submitted — staff will review and confirm it.');
      setProofCharge(null);
      setProofPath('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit proof.');
    } finally {
      setBusy(false);
    }
  }

  const openCharges = (charges ?? []).filter((c) => c.status === 'open' || c.status === 'pending_verification');

  return (
    <div className="mt-2">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white hover:underline">
        <Wallet className="h-3.5 w-3.5 text-indigo-400" /> {open ? 'Hide fees' : 'View fees'}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
          {error && <p className="text-xs text-red-400">{error}</p>}
          {notice && <p className="text-xs text-emerald-400">{notice}</p>}
          {charges === null ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : openCharges.length === 0 ? (
            <p className="text-xs text-slate-400">No open charges.</p>
          ) : (
            <ul className="space-y-1.5">
              {openCharges.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-200">
                    {c.description} — {formatMinor(c.amountMinor, c.currency)} <span className="text-slate-400">(due {c.dueOn})</span>
                  </span>
                  {c.status === 'open' && (
                    <button onClick={() => setProofCharge(c)} className="btn-secondary shrink-0 rounded border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-200 hover:bg-white/10">
                      Submit proof
                    </button>
                  )}
                  {c.status === 'pending_verification' && <span className="shrink-0 text-[10px] text-blue-400 font-semibold">pending review</span>}
                </li>
              ))}
            </ul>
          )}

          {proofCharge && (
            <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/5 p-2">
              <p className="text-[11px] text-slate-400">
                Proof of payment for &quot;{proofCharge.description}&quot; ({formatMinor(proofCharge.amountMinor, proofCharge.currency)})
              </p>
              <input
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                placeholder="organization ID"
                className="glass-input w-full rounded px-2 py-1 text-xs"
              />
              <input
                value={proofPath}
                onChange={(e) => setProofPath(e.target.value)}
                placeholder="proof file path / reference"
                className="glass-input w-full rounded px-2 py-1 text-xs"
              />
              <div className="flex gap-1.5">
                <button disabled={busy} onClick={submitProof} className="btn-premium rounded px-2 py-1 text-[10px] font-semibold disabled:opacity-50">
                  Submit
                </button>
                <button onClick={() => setProofCharge(null)} className="btn-secondary rounded border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-300 hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnrollWardCard({ ward }: { ward: Ward }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [resolved, setResolved] = useState<{ id: string; name: string; orgType: string } | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setError(null);
    setResolved(null);
    setLoading(true);
    try {
      const org = await api<{ id: string; name: string; orgType: string }>(`/api/v1/orgs/resolve?slug=${encodeURIComponent(slugify(slug))}`);
      setResolved(org);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No organization found with that URL.');
    } finally {
      setLoading(false);
    }
  }

  async function request() {
    if (!resolved) return;
    setError(null);
    setLoading(true);
    try {
      await api(`/api/v1/orgs/${resolved.id}/join-requests`, {
        method: 'POST',
        body: JSON.stringify({ requestedRole: 'student', subjectUserId: ward.wardUserId }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the join request.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-100">{ward.displayName}</p>
          <p className="text-xs text-slate-400">
            {ward.relationship}
            {ward.dob ? ` · b. ${ward.dob}` : ''}
            {ward.consentAuthority ? '' : ' · no consent authority'}
          </p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-slate-400 hover:text-white hover:underline">
          {open ? 'Close' : 'Request enrollment'}
        </button>
      </div>

      <BiometricConsentButton ward={ward} />
      <WardFeesSection ward={ward} />
      <WardProgressSection ward={ward} />

      {open && (
        <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
          {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">{error}</div>}
          {sent ? (
            <div className="flex items-start gap-2 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Request sent to {resolved?.name} for {ward.displayName}.</span>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="organization URL or code"
                    className="glass-input w-full rounded-lg py-1.5 pl-8 pr-2 text-xs"
                  />
                </div>
                <button
                  disabled={loading || !slug.trim()}
                  onClick={search}
                  className="btn-secondary rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  Search
                </button>
              </div>
              {resolved && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
                  <span className="text-xs text-slate-200">
                    {resolved.name} ({resolved.orgType.replace('_', ' ')})
                  </span>
                  <button
                    disabled={loading}
                    onClick={request}
                    className="btn-premium rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-50"
                  >
                    Send request
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

export default function FamilyPage() {
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<Ward[]>('/api/v1/me/wards')
      .then(setWards)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl">
        <PageHeader badge="Family" badgeIcon={Users} title="Family" description="Manage your children and request their enrollment at an organization." />

        {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

        <AddWardForm onAdded={load} />

        {wards === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : wards.length === 0 ? (
          <p className="text-sm text-slate-400">You haven&apos;t added any children yet.</p>
        ) : (
          <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
            {wards.map((w) => (
              <EnrollWardCard key={w.wardUserId} ward={w} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
