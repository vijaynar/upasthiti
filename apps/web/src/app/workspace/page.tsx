'use client';

// Workspace switcher (Doc 05 §7) — lists every org the signed-in identity
// has a membership in and lets them pick the active one for this session.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Check, Plus } from 'lucide-react';

interface MembershipRow {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  orgType: string;
  orgStatus: string;
  branchId: string | null;
  status: string;
}

export default function WorkspacePage() {
  const [memberships, setMemberships] = useState<MembershipRow[] | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setError(null);
    try {
      const [orgsRes, activeRes] = await Promise.all([fetch('/api/v1/orgs'), fetch('/api/v1/me/workspace')]);
      const orgsBody = await orgsRes.json();
      const activeBody = await activeRes.json();
      if (!orgsRes.ok) throw new Error(orgsBody.error?.message ?? 'Could not load your organizations.');
      setMemberships(orgsBody.data);
      setActiveOrgId(activeBody.data?.activeOrgId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function handleSwitch(organizationId: string) {
    setSwitching(organizationId);
    setError(null);
    try {
      const res = await fetch('/api/v1/me/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: organizationId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not switch workspace.');
      setActiveOrgId(organizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Your workspaces</h1>
          <p className="mt-1 text-sm text-neutral-500">Pick which organization you want to work in.</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {memberships === null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : memberships.length === 0 ? (
          <p className="text-sm text-neutral-500">You&apos;re not part of any organization yet.</p>
        ) : (
          <ul className="space-y-2">
            {memberships.map((m) => {
              const isActive = m.organizationId === activeOrgId;
              const pending = m.status !== 'active';
              return (
                <li key={m.organizationId}>
                  <button
                    disabled={pending || switching !== null}
                    onClick={() => handleSwitch(m.organizationId)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isActive ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    <Building2 className="h-5 w-5 shrink-0 text-neutral-500" />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-neutral-900">{m.organizationName}</span>
                      <span className="block text-xs text-neutral-500">
                        {m.orgType.replace('_', ' ')}
                        {m.branchId ? '' : ' · org-wide'}
                        {pending ? ` · ${m.status}` : ''}
                        {m.orgStatus === 'pending' ? ' · pending verification' : ''}
                      </span>
                    </span>
                    {isActive && <Check className="h-4 w-4 shrink-0 text-neutral-900" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href="/onboarding"
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
        >
          <Plus className="h-4 w-4" />
          Add another workspace
        </Link>
      </div>
    </div>
  );
}
