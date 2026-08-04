'use client';

// Workspace switcher (Doc 05 §7) — lists every org the signed-in identity
// has a membership in and lets them pick the active one for this session.
// Reads/writes the shared WorkspaceProvider state (see @/lib/workspace) so
// switching here updates the sidebar immediately, with no full reload.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Check, LogOut, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

export default function WorkspacePage() {
  const { loading, memberships, activeOrg, switchWorkspace, refreshMemberships } = useWorkspace();
  const [switching, setSwitching] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Platform staff have no org membership of their own — an empty list means
  // "belongs on /platform", not "stuck with nothing to pick" like a student.
  const [platformRoles, setPlatformRoles] = useState<string[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    api<{ roles: string[] }>('/api/v1/me/platform-roles')
      .then((r) => setPlatformRoles(r?.roles ?? []))
      .catch(() => setPlatformRoles([]));
  }, []);

  useEffect(() => {
    if (loading || platformRoles === null || memberships.length > 0) return;
    router.replace((platformRoles.length > 0) ? '/platform/dashboard' : '/dashboard');
  }, [loading, memberships, platformRoles, router]);


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

  async function handleDelete(organizationId: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This removes the workspace permanently and cannot be undone.`)) return;
    setRemoving(organizationId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/orgs/${organizationId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Could not delete workspace.');
      }
      await refreshMemberships();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRemoving(null);
    }
  }

  async function handleLeave(organizationId: string, name: string) {
    if (!window.confirm(`Leave "${name}"? You'll need a new invite or join request to get back in.`)) return;
    setRemoving(organizationId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/orgs/${organizationId}/leave`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Could not leave workspace.');
      }
      await refreshMemberships();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRemoving(null);
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
              const isOwner = m.activeRoleKey === 'owner';
              const canDelete = isOwner && (m.orgStatus === 'pending' || m.orgStatus === 'rejected');
              const canLeave = !isOwner && m.status === 'active';
              const busy = removing === m.organizationId;
              return (
                <li key={m.organizationId} className="flex items-stretch gap-2">
                  <button
                    disabled={pending || switching !== null || busy}
                    onClick={() => handleSwitch(m.organizationId)}
                    className={`flex flex-1 items-center gap-3 rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
                  {canDelete && (
                    <button
                      aria-label="Delete workspace"
                      disabled={busy}
                      onClick={() => handleDelete(m.organizationId, m.organizationName)}
                      className="group relative flex shrink-0 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 px-3 text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--panel-border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
                      >
                        Delete workspace
                      </span>
                    </button>
                  )}
                  {canLeave && (
                    <button
                      aria-label="Leave workspace"
                      disabled={busy}
                      onClick={() => handleLeave(m.organizationId, m.organizationName)}
                      className="group relative flex shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 text-slate-400 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <LogOut className="h-4 w-4" />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--panel-border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
                      >
                        Leave workspace
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {activeOrg?.orgType === 'independent_coach' ? (
          <span
            aria-disabled="true"
            className="flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 px-4 py-2.5 text-sm font-medium text-slate-500"
          >
            <Plus className="h-4 w-4" />
            Add another workspace
          </span>
        ) : (
          <Link
            href="/onboarding"
            className="btn-secondary flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
            Add another workspace
          </Link>
        )}
      </div>
    </div>
  );
}
