'use client';

// Shared "invite a coach" panel (Doc 04 §8 unification) — generates a
// token link via the existing tenancy-rbac invitations service (built
// Phase 3, never had a UI). Used from /staff (an org admin inviting into
// their own org) and /platform (a Super Admin inviting into an org they
// hold an active support-access grant for — RLS extended in migration
// 0016 to allow support_grant_active(organizationId) on invitations).

import { useEffect, useState } from 'react';
import { Copy, UserPlus } from 'lucide-react';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface Invitation {
  id: string;
  branchId: string | null;
  email: string | null;
  phone: string | null;
  roleKeys: string[];
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: 'coach', label: 'Coach' },
  { value: 'assistant_coach', label: 'Assistant coach' },
];

export default function InviteCoachPanel({ organizationId }: { organizationId: string }) {
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState('coach');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function load() {
    api<Invitation[]>(`/api/v1/orgs/${organizationId}/invitations`).then(setInvitations).catch((err) => setError(err.message));
  }

  useEffect(load, [organizationId]);

  async function createInvite() {
    setBusy(true);
    setError(null);
    setLastLink(null);
    try {
      const result = await api<{ invitationId: string; token: string }>(`/api/v1/orgs/${organizationId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() || undefined, roleKeys: [roleKey] }),
      });
      setLastLink(`${window.location.origin}/onboarding?token=${result.token}`);
      setEmail('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await api(`/api/v1/orgs/${organizationId}/invitations/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  function copyLink() {
    if (!lastLink) return;
    navigator.clipboard.writeText(lastLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      {error && <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">{error}</div>}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Email (optional)</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="coach@example.com"
            className="w-56 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Role</label>
          <select
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <button
          disabled={busy}
          onClick={createInvite}
          className="flex items-center gap-1.5 rounded-lg border border-indigo-500 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <UserPlus className="h-3.5 w-3.5" /> Generate invite link
        </button>
      </div>

      {lastLink && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-xs text-emerald-300">
          <span className="flex-1 truncate">{lastLink}</span>
          <button onClick={copyLink} className="flex items-center gap-1 rounded border border-emerald-500/30 px-2 py-1 hover:bg-emerald-500/20">
            <Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-slate-500">Pending &amp; recent invitations</p>
        {invitations === null ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : invitations.length === 0 ? (
          <p className="text-xs text-slate-500">No invitations yet.</p>
        ) : (
          <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 p-2.5 text-xs">
                <div>
                  <span className="font-medium text-slate-200">{inv.email ?? inv.phone ?? 'no contact'}</span>
                  <span className="ml-2 text-slate-500">{inv.roleKeys.join(', ')}</span>
                  {inv.acceptedAt && <span className="ml-2 text-emerald-400">accepted</span>}
                  {inv.revokedAt && <span className="ml-2 text-red-400">revoked</span>}
                  {!inv.acceptedAt && !inv.revokedAt && <span className="ml-2 text-amber-400">pending</span>}
                </div>
                {!inv.acceptedAt && !inv.revokedAt && (
                  <button onClick={() => revoke(inv.id)} className="text-red-400 hover:underline">
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
