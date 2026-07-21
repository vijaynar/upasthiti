'use client';

// Platform console (Doc 04 §9/§3, Doc 07 §15-16, wireframe 4a-4f — scoped to
// what Phase 5 actually built: verification queue, org list/suspend,
// platform roles, support access, feature flags, announcements, audit log.
// Taxonomy/messaging/payments/localization panels (4g-4l) depend on modules
// that don't exist yet — not built here, see IMPLEMENTATION_STATUS.md.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck, CheckCircle2, XCircle, Ban, RotateCcw } from 'lucide-react';

type Tab = 'verification' | 'organizations' | 'roles' | 'support' | 'flags' | 'announcements' | 'audit';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

export default function PlatformConsolePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      }
    >
      <PlatformConsoleContent />
    </Suspense>
  );
}

function PlatformConsoleContent() {
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') as Tab | null) ?? 'verification';
  const [accessDenied, setAccessDenied] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api('/api/v1/platform/organizations')
      .then(() => setChecking(false))
      .catch(() => {
        setAccessDenied(true);
        setChecking(false);
      });
  }, []);

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="glass-panel max-w-sm space-y-2 rounded-xl p-8 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
          <h1 className="text-lg font-semibold text-white">Platform console</h1>
          <p className="text-sm text-slate-400">You don&apos;t hold a platform role. This area is for Super Admin, Verification Ops, Support, and Platform Finance staff only.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 p-8">
      {tab === 'verification' && <VerificationQueue />}
      {tab === 'organizations' && <OrganizationsPanel />}
      {tab === 'roles' && <PlatformRolesPanel />}
      {tab === 'support' && <SupportAccessPanel />}
      {tab === 'flags' && <FeatureFlagsPanel />}
      {tab === 'announcements' && <AnnouncementsPanel />}
      {tab === 'audit' && <AuditTrailPanel />}
    </main>
  );
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>;
}

function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
    </div>
  );
}

// ── Verification queue (wireframe 4a, Doc 04 US-1 AC5) ────────────

interface OrgSummary {
  id: string;
  orgType: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  verifiedAt: string | null;
}

function VerificationQueue() {
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    api<OrgSummary[]>('/api/v1/platform/organizations?status=pending')
      .then(setOrgs)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function decide(id: string, decision: 'approved' | 'rejected') {
    setBusy(id);
    setError(null);
    try {
      await api(`/api/v1/platform/organizations/${id}/verify`, { method: 'POST', body: JSON.stringify({ decision }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PanelHeader title="Verification queue" subtitle="Organizations waiting for approval before they go live." />
      <ErrorBanner error={error} />
      {orgs === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : orgs.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing pending — the queue is empty.</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {orgs.map((org) => (
            <li key={org.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium text-slate-100">{org.name}</p>
                <p className="text-xs text-slate-400">
                  {org.orgType.replace('_', ' ')} · /{org.slug} · submitted {new Date(org.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busy === org.id}
                  onClick={() => decide(org.id, 'approved')}
                  className="btn-premium flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  disabled={busy === org.id}
                  onClick={() => decide(org.id, 'rejected')}
                  className="btn-secondary flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium border border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Organizations (wireframe 4b) ───────────────────────────────────

function OrganizationsPanel() {
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    api<OrgSummary[]>(`/api/v1/platform/organizations${qs}`)
      .then(setOrgs)
      .catch((err) => setError(err.message));
  }

  useEffect(load, [search]);

  async function toggleSuspend(org: OrgSummary) {
    setBusy(org.id);
    setError(null);
    try {
      const action = org.status === 'active' ? 'suspend' : 'reinstate';
      await api(`/api/v1/platform/organizations/${org.id}/suspend`, { method: 'POST', body: JSON.stringify({ action }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PanelHeader title="Organizations" subtitle="Every organization on the platform, with lifecycle controls." />
      <ErrorBanner error={error} />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or slug…"
        className="glass-input mb-4 w-72 rounded-lg px-3 py-1.5 text-sm"
      />
      {orgs === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {orgs.map((org) => (
            <li key={org.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium text-slate-100">{org.name}</p>
                <p className="text-xs text-slate-400">
                  /{org.slug} · <span className="uppercase text-slate-300 font-semibold">{org.status}</span>
                </p>
              </div>
              {(org.status === 'active' || org.status === 'suspended') && (
                <button
                  disabled={busy === org.id}
                  onClick={() => toggleSuspend(org)}
                  className="btn-secondary flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 disabled:opacity-50"
                >
                  {org.status === 'active' ? (
                    <>
                      <Ban className="h-3.5 w-3.5 text-red-400" /> Suspend
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3.5 w-3.5 text-emerald-400" /> Reinstate
                    </>
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Platform roles (wireframe 4c/4d, Doc 04 §3) ────────────────────

const PLATFORM_ROLES = ['super_admin', 'verification_ops', 'support', 'platform_finance', 'marketplace_partner'];

interface RoleAssignment {
  userId: string;
  roleKey: string;
  grantedBy: string | null;
  grantedAt: string;
  seed: boolean;
}

function PlatformRolesPanel() {
  const [assignments, setAssignments] = useState<RoleAssignment[] | null>(null);
  const [userId, setUserId] = useState('');
  const [roleKey, setRoleKey] = useState(PLATFORM_ROLES[1]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<RoleAssignment[]>('/api/v1/platform/roles')
      .then(setAssignments)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function grant() {
    if (!userId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/platform/roles', { method: 'POST', body: JSON.stringify({ userId: userId.trim(), roleKey }) });
      setUserId('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(a: RoleAssignment) {
    setError(null);
    try {
      await api(`/api/v1/platform/roles/${a.userId}/${a.roleKey}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div>
      <PanelHeader title="Platform roles" subtitle="Super Admin, Verification Ops, Support, Platform Finance, Marketplace Partner." />
      <ErrorBanner error={error} />
      <div className="glass-panel mb-5 flex items-end gap-2 rounded-xl p-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-400">User ID</label>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="uuid of the user to grant a role to"
            className="glass-input w-full rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Role</label>
          <select
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
            className="glass-input rounded-lg px-3 py-1.5 text-sm"
          >
            {PLATFORM_ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <button
          disabled={busy || !userId.trim()}
          onClick={grant}
          className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Grant
        </button>
      </div>
      {assignments === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {assignments.map((a) => (
            <li key={`${a.userId}-${a.roleKey}`} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium text-slate-100">
                  {a.roleKey.replace('_', ' ')} {a.seed && <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-400 border border-white/10">seed</span>}
                </p>
                <p className="text-xs text-slate-400">user {a.userId}</p>
              </div>
              {!a.seed && (
                <button onClick={() => revoke(a)} className="text-xs font-medium text-red-400 hover:underline">
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Support access (wireframe 1h/4b, Doc 04 §9) ────────────────────

interface SupportGrant {
  id: string;
  organizationId: string;
  granteeUserId: string;
  reason: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

function SupportAccessPanel() {
  const [grants, setGrants] = useState<SupportGrant[] | null>(null);
  const [orgId, setOrgId] = useState('');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<SupportGrant[]>('/api/v1/platform/support-access')
      .then(setGrants)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function requestAccess() {
    if (!orgId.trim() || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/platform/support-access', {
        method: 'POST',
        body: JSON.stringify({ organizationId: orgId.trim(), reason: reason.trim(), durationHours: hours }),
      });
      setOrgId('');
      setReason('');
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
      await api(`/api/v1/platform/support-access/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div>
      <PanelHeader title="Support access" subtitle="Time-boxed, audited org entry — never standing access (Doc 04 §9)." />
      <ErrorBanner error={error} />
      <div className="glass-panel mb-5 flex flex-wrap items-end gap-2 rounded-xl p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Organization ID</label>
          <input
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="glass-input w-64 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-400">Reason</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="glass-input w-full rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Hours (max 24)</label>
          <input
            type="number"
            min={1}
            max={24}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="glass-input w-20 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <button
          disabled={busy || !orgId.trim() || !reason.trim()}
          onClick={requestAccess}
          className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Request access
        </button>
      </div>
      {grants === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {grants.map((g) => {
            const expired = new Date(g.expiresAt) < new Date();
            const status = g.revokedAt ? 'revoked' : expired ? 'expired' : 'active';
            return (
              <li key={g.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    org {g.organizationId} <span className="ml-1 text-xs uppercase text-slate-400 font-semibold">{status}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {g.reason} · expires {new Date(g.expiresAt).toLocaleString()}
                  </p>
                </div>
                {status === 'active' && (
                  <button onClick={() => revoke(g.id)} className="text-xs font-medium text-red-400 hover:underline">
                    Revoke
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Feature flags (wireframe 4j) ───────────────────────────────────

interface FeatureFlag {
  key: string;
  defaultOn: boolean;
  description: string | null;
}

function FeatureFlagsPanel() {
  const [flags, setFlags] = useState<FeatureFlag[] | null>(null);
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<FeatureFlag[]>('/api/v1/platform/feature-flags')
      .then(setFlags)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function toggle(flag: FeatureFlag) {
    setError(null);
    try {
      await api('/api/v1/platform/feature-flags', {
        method: 'POST',
        body: JSON.stringify({ key: flag.key, defaultOn: !flag.defaultOn, description: flag.description ?? undefined }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function create() {
    if (!key.trim()) return;
    setError(null);
    try {
      await api('/api/v1/platform/feature-flags', { method: 'POST', body: JSON.stringify({ key: key.trim(), defaultOn: false, description }) });
      setKey('');
      setDescription('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div>
      <PanelHeader title="Feature flags" subtitle="Global kill switches and rollout toggles." />
      <ErrorBanner error={error} />
      <div className="glass-panel mb-5 flex items-end gap-2 rounded-xl p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Key</label>
          <input value={key} onChange={(e) => setKey(e.target.value)} className="glass-input w-48 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="glass-input w-full rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <button
          disabled={!key.trim()}
          onClick={create}
          className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          + New flag
        </button>
      </div>
      {flags === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {flags.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium text-slate-100">{f.key}</p>
                {f.description && <p className="text-xs text-slate-400">{f.description}</p>}
              </div>
              <button
                onClick={() => toggle(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  f.defaultOn ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-400 border border-white/10'
                }`}
              >
                {f.defaultOn ? 'On' : 'Off'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Announcements (wireframe 4f) ───────────────────────────────────

interface Announcement {
  id: string;
  audience: string;
  title: string;
  body: string;
  publishedAt: string | null;
  createdAt: string;
}

function AnnouncementsPanel() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [audience, setAudience] = useState('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<Announcement[]>('/api/v1/platform/announcements')
      .then(setItems)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function publish() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/platform/announcements', { method: 'POST', body: JSON.stringify({ audience, title: title.trim(), body: body.trim() }) });
      setTitle('');
      setBody('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PanelHeader title="Announcements" subtitle="Platform-wide messages surfaced in-app." />
      <ErrorBanner error={error} />
      <div className="glass-panel mb-5 space-y-2 rounded-xl p-4">
        <div className="flex gap-2">
          <select value={audience} onChange={(e) => setAudience(e.target.value)} className="glass-input rounded-lg px-3 py-1.5 text-sm">
            <option value="all">All users</option>
            <option value="org_admins">Org admins</option>
            <option value="platform_staff">Platform staff</option>
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="glass-input flex-1 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message"
          rows={3}
          className="glass-input w-full rounded-lg px-3 py-1.5 text-sm"
        />
        <button
          disabled={busy || !title.trim() || !body.trim()}
          onClick={publish}
          className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Publish
        </button>
      </div>
      {items === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {items.map((a) => (
            <li key={a.id} className="p-4">
              <p className="text-sm font-medium text-slate-100">
                {a.title} <span className="ml-1 text-xs uppercase text-slate-400 font-semibold">{a.audience}</span>
              </p>
              <p className="mt-0.5 text-sm text-slate-400">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Audit trail (wireframe 4e) ─────────────────────────────────────

interface AuditEntry {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  occurredAt: string;
}

function AuditTrailPanel() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AuditEntry[]>('/api/v1/platform/audit-log')
      .then(setEntries)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <PanelHeader title="Audit trail" subtitle="Append-only. Role grants, support access, and org lifecycle changes." />
      <ErrorBanner error={error} />
      {entries === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-400">No platform-scope events yet.</p>
      ) : (
        <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
          {entries.map((e) => (
            <li key={e.id} className="p-4">
              <p className="text-sm font-medium text-slate-100">{e.action}</p>
              <p className="text-xs text-slate-400">
                {new Date(e.occurredAt).toLocaleString()} · actor {e.actorUserId ?? '—'}
                {e.targetType && ` · ${e.targetType} ${e.targetId}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
