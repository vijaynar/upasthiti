'use client';

// Workspace switcher (Doc 05 §7) — lists every org the signed-in identity
// has a membership in and lets them pick the active one for this session.
// Reads/writes the shared WorkspaceProvider state (see @/lib/workspace) so
// switching here updates the sidebar immediately, with no full reload.

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Check, Plus } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';

export default function WorkspacePage() {
  const { loading, memberships, activeOrg, switchWorkspace } = useWorkspace();
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSwitch(organizationId: string) {
    setSwitching(organizationId);
    setError(null);
    try {
      await switchWorkspace(organizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="glass-panel w-full max-w-md space-y-4 rounded-xl p-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Your workspaces</h1>
          <p className="mt-1 text-sm text-slate-400">Pick which organization you want to work in.</p>
        </div>

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : memberships.length === 0 ? (
          <p className="text-sm text-slate-400">You&apos;re not part of any organization yet.</p>
        ) : (
          <ul className="space-y-2">
            {memberships.map((m) => {
              const isActive = m.organizationId === activeOrg?.organizationId;
              const pending = m.status !== 'active';
              return (
                <li key={m.organizationId}>
                  <button
                    disabled={pending || switching !== null}
                    onClick={() => handleSwitch(m.organizationId)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isActive ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <Building2 className="h-5 w-5 shrink-0 text-indigo-400" />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-slate-100">
                        {switching === m.organizationId ? 'Switching…' : m.organizationName}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {m.orgType.replace('_', ' ')}
                        {m.branchId ? '' : ' · org-wide'}
                        {pending ? ` · ${m.status}` : ''}
                        {m.orgStatus === 'pending' ? ' · pending verification' : ''}
                      </span>
                    </span>
                    {isActive && <Check className="h-4 w-4 shrink-0 text-indigo-400" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href="/onboarding"
          className="btn-secondary flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10"
        >
          <Plus className="h-4 w-4" />
          Add another workspace
        </Link>
      </div>
    </div>
  );
}
