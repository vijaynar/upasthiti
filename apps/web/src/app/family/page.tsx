'use client';

// Family (Doc 02 §9 "I'm a parent/student", Doc 04 §7) — a guardian's own
// view: the wards they've added, adding a new one, and requesting a ward's
// enrollment at an organization. Standalone from /onboarding (which is a
// pre-membership, one-time flow) since guardianship is an ongoing identity-
// level relationship a parent revisits over time.

import { useEffect, useState } from 'react';
import { Users, UserPlus, Search, CheckCircle2, AlertCircle } from 'lucide-react';

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
    <div className="mb-5 space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Add a child</h2>
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-500">Name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Date of birth</label>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Relationship</label>
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value as typeof relationship)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
          >
            <option value="father">Father</option>
            <option value="mother">Mother</option>
            <option value="guardian">Guardian</option>
          </select>
        </div>
        <button
          disabled={busy || !displayName.trim()}
          onClick={submit}
          className="flex items-center gap-1 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
        >
          <UserPlus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
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
          <p className="text-sm font-medium text-neutral-900">{ward.displayName}</p>
          <p className="text-xs text-neutral-500">
            {ward.relationship}
            {ward.dob ? ` · b. ${ward.dob}` : ''}
            {ward.consentAuthority ? '' : ' · no consent authority'}
          </p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-neutral-600 hover:underline">
          {open ? 'Close' : 'Request enrollment'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 p-3">
          {error && <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</div>}
          {sent ? (
            <div className="flex items-start gap-2 text-xs text-green-700">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Request sent to {resolved?.name} for {ward.displayName}.</span>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="organization URL or code"
                    className="w-full rounded-lg border border-neutral-300 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-neutral-500"
                  />
                </div>
                <button
                  disabled={loading || !slug.trim()}
                  onClick={search}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Search
                </button>
              </div>
              {resolved && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 p-2">
                  <span className="text-xs text-neutral-700">
                    {resolved.name} ({resolved.orgType.replace('_', ' ')})
                  </span>
                  <button
                    disabled={loading}
                    onClick={request}
                    className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
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
    <div className="min-h-screen bg-neutral-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold text-neutral-900">
          <Users className="h-5 w-5 text-neutral-500" /> Family
        </h1>
        <p className="mb-5 text-sm text-neutral-500">Manage your children and request their enrollment at an organization.</p>

        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <AddWardForm onAdded={load} />

        {wards === null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : wards.length === 0 ? (
          <p className="text-sm text-neutral-500">You haven&apos;t added any children yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {wards.map((w) => (
              <EnrollWardCard key={w.wardUserId} ward={w} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
