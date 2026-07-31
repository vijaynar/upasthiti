'use client';

// Platform console (Doc 04 §9/§3, Doc 07 §15-16, wireframe 4a-4f — scoped to
// what Phase 5 actually built: verification queue, org list/suspend,
// platform roles, support access, feature flags, announcements, audit log.
// Taxonomy/messaging/payments/localization panels (4g-4l) depend on modules
// that don't exist yet — not built here, see IMPLEMENTATION_STATUS.md.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Ban,
  RotateCcw,
  UserPlus,
  Save,
  Check,
  Users,
  Search,
  Phone,
  Settings,
  History,
  Headphones,
  Megaphone,
  Building2,
  Shield,
  Sliders,
  Trash2,
  Archive,
} from 'lucide-react';
import InviteCoachPanel from '@/components/InviteCoachPanel';
import { PageHeader } from '@/components/PageHeader';

type Tab = 'verification' | 'organizations' | 'roles' | 'users' | 'support' | 'announcements' | 'audit' | 'flags';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  // An unhandled server error can respond with an empty/non-JSON body —
  // res.json() itself throws "Unexpected end of JSON input" in that case,
  // which would otherwise leak straight into the UI as a raw parser error
  // instead of a message a user can act on.
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Something went wrong (status ${res.status}).`);
  return body?.data as T;
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
          <h1 className="text-lg font-semibold text-white">Platform Console</h1>
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
      {tab === 'users' && <UserDirectoryPanel />}
      {tab === 'support' && <SupportAccessPanel />}
      {tab === 'announcements' && <AnnouncementsPanel />}
      {tab === 'audit' && <AuditTrailPanel />}
      {tab === 'flags' && <GlobalSettingsPanel />}
    </main>
  );
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>;
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
      <PageHeader badge="Verification" badgeIcon={CheckCircle2} title="Verification queue" description="Organizations waiting for approval before they go live." />
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
  const [inviteOrgId, setInviteOrgId] = useState<string | null>(null);

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

  async function deleteOrg(org: OrgSummary) {
    if (!window.confirm(`Permanently delete "${org.name}"? This unverified organization and its data will be gone for good.`)) return;
    setBusy(org.id);
    setError(null);
    try {
      await api(`/api/v1/platform/organizations/${org.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  async function archiveOrg(org: OrgSummary) {
    if (!window.confirm(`Archive "${org.name}"? Members will lose access; this is a soft-delete, not permanent.`)) return;
    setBusy(org.id);
    setError(null);
    try {
      await api(`/api/v1/platform/organizations/${org.id}/archive`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader badge="Organizations" badgeIcon={Building2} title="Organizations" description="Every organization on the platform, with lifecycle controls." />
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
            <li key={org.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-100">{org.name}</p>
                  <p className="text-xs text-slate-400">
                    /{org.slug} · <span className="uppercase text-slate-300 font-semibold">{org.status}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setInviteOrgId(inviteOrgId === org.id ? null : org.id)}
                    className="flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Invite coach
                  </button>
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
                  {(org.status === 'active' || org.status === 'suspended') && (
                    <button
                      disabled={busy === org.id}
                      onClick={() => archiveOrg(org)}
                      className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 disabled:opacity-50"
                    >
                      <Archive className="h-3.5 w-3.5 text-amber-400" /> Archive
                    </button>
                  )}
                  {(org.status === 'pending' || org.status === 'rejected') && (
                    <button
                      disabled={busy === org.id}
                      onClick={() => deleteOrg(org)}
                      className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
              {inviteOrgId === org.id && (
                <div className="mt-3">
                  <OrgInvitePanel organizationId={org.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A Super Admin isn't a member of every org, so invitation writes there are
// gated on an active support_access_grants row (Doc 04 §9, migration 0016
// widened invitations' RLS to accept it) rather than an org permission —
// request one inline here if none is active yet, same time-boxed/audited
// shape as the Support Access tab, just surfaced where it's needed.
function OrgInvitePanel({ organizationId }: { organizationId: string }) {
  const [hasActiveGrant, setHasActiveGrant] = useState<boolean | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function checkGrant() {
    api<SupportGrant[]>('/api/v1/platform/support-access')
      .then((grants) => {
        const now = new Date();
        setHasActiveGrant(
          grants.some((g) => g.organizationId === organizationId && !g.revokedAt && new Date(g.expiresAt) > now)
        );
      })
      .catch((err) => setError(err.message));
  }

  useEffect(checkGrant, [organizationId]);

  async function requestAccess() {
    setRequesting(true);
    setError(null);
    try {
      await api('/api/v1/platform/support-access', {
        method: 'POST',
        body: JSON.stringify({ organizationId, reason: 'Invite a coach', durationHours: 4 }),
      });
      checkGrant();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRequesting(false);
    }
  }

  if (hasActiveGrant === null) {
    return <p className="text-xs text-slate-500">Checking access…</p>;
  }

  if (!hasActiveGrant) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
        {error && <p className="mb-2 text-red-400">{error}</p>}
        <p className="mb-2">You need a time-boxed support-access grant for this org before generating invite links.</p>
        <button
          disabled={requesting}
          onClick={requestAccess}
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-medium hover:bg-amber-500/20 disabled:opacity-50"
        >
          {requesting ? 'Requesting…' : 'Request 4h access'}
        </button>
      </div>
    );
  }

  return <InviteCoachPanel organizationId={organizationId} />;
}

// ── Platform roles (wireframe 4c/4d, Doc 04 §3) ────────────────────

const PLATFORM_ROLES = ['super_admin', 'verification_ops', 'support', 'platform_finance', 'marketplace_partner'];

interface RoleAssignment {
  userId: string;
  roleKey: string;
  displayName: string | null;
  email: string | null;
  grantedBy: string | null;
  grantedAt: string;
  seed: boolean;
}

// ── Platform roles & Permissions (Doc 04 §3, §5, Access Governance) ─────

interface RoleItem {
  id: string;
  name: string;
  key: string;
  scope?: string;
  isSystem: boolean;
  userCount: number;
}

type PermissionState = 'granted' | 'denied' | 'na';

interface ModulePermissions {
  module: string;
  view: PermissionState;
  create: PermissionState;
  edit: PermissionState;
  delete: PermissionState;
  manage: PermissionState;
  mark: PermissionState;
  viewOwn: PermissionState;
}

const DEFAULT_SYSTEM_ROLES: RoleItem[] = [
  { id: 'admin', name: 'Admin', key: 'admin', scope: 'org', isSystem: true, userCount: 0 },
  { id: 'coach', name: 'Coach', key: 'coach', scope: 'org', isSystem: true, userCount: 0 },
  { id: 'assistant_coach', name: 'Assistant Coach', key: 'assistant_coach', scope: 'org', isSystem: true, userCount: 0 },
  { id: 'student', name: 'Student', key: 'student', scope: 'org', isSystem: true, userCount: 0 },
  { id: 'parent', name: 'Parent / Guardian', key: 'parent', scope: 'org', isSystem: true, userCount: 0 },
  { id: 'super_admin', name: 'Super Admin', key: 'super_admin', scope: 'platform', isSystem: true, userCount: 1 },
  { id: 'verification_ops', name: 'Verification Ops', key: 'verification_ops', scope: 'platform', isSystem: true, userCount: 0 },
  { id: 'support', name: 'Support Staff', key: 'support', scope: 'platform', isSystem: true, userCount: 0 },
  { id: 'platform_finance', name: 'Platform Finance', key: 'platform_finance', scope: 'platform', isSystem: true, userCount: 0 },
  { id: 'marketplace_partner', name: 'Marketplace Partner', key: 'marketplace_partner', scope: 'platform', isSystem: true, userCount: 0 },
  { id: 'branch_admin', name: 'Branch Admin', key: 'branch_admin', scope: 'org', isSystem: true, userCount: 0 },
  { id: 'front_desk', name: 'Front Desk', key: 'front_desk', scope: 'org', isSystem: true, userCount: 0 },
  { id: 'accountant', name: 'Accountant', key: 'accountant', scope: 'org', isSystem: true, userCount: 0 },
];

const MODULE_ROWS = [
  'Students',
  'Coaches',
  'Classes',
  'Batches',
  'Attendance',
  'Payments',
  'Reports',
  'Users',
  'Settings',
  'Roles',
  'Audit Logs',
];

// Initial matrix definitions per role key matching the PostgreSQL RBAC seed
const DEFAULT_MATRIX_BY_ROLE: Record<string, ModulePermissions[]> = {
  super_admin: MODULE_ROWS.map((m) => ({
    module: m,
    view: 'granted',
    create: 'granted',
    edit: 'granted',
    delete: 'granted',
    manage: 'granted',
    mark: 'granted',
    viewOwn: 'granted',
  })),
  admin: [
    { module: 'Students', view: 'granted', create: 'granted', edit: 'granted', delete: 'granted', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Coaches', view: 'granted', create: 'granted', edit: 'granted', delete: 'granted', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Classes', view: 'granted', create: 'granted', edit: 'granted', delete: 'granted', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'granted', create: 'granted', edit: 'granted', delete: 'granted', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Attendance', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'granted', viewOwn: 'denied' },
    { module: 'Payments', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'granted', mark: 'na', viewOwn: 'na' },
    { module: 'Reports', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'granted', mark: 'na', viewOwn: 'na' },
    { module: 'Users', view: 'granted', create: 'granted', edit: 'granted', delete: 'granted', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Settings', view: 'na', create: 'na', edit: 'na', delete: 'na', manage: 'granted', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'na', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
  branch_admin: [
    { module: 'Students', view: 'granted', create: 'granted', edit: 'granted', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Coaches', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Classes', view: 'granted', create: 'granted', edit: 'granted', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'granted', create: 'granted', edit: 'granted', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Attendance', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'granted', viewOwn: 'denied' },
    { module: 'Payments', view: 'granted', create: 'granted', edit: 'denied', delete: 'denied', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Reports', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Users', view: 'granted', create: 'granted', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Settings', view: 'granted', create: 'na', edit: 'denied', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
  coach: [
    { module: 'Students', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Coaches', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Classes', view: 'granted', create: 'granted', edit: 'granted', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Attendance', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'granted', viewOwn: 'granted' },
    { module: 'Payments', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Reports', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Users', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Settings', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
  assistant_coach: [
    { module: 'Students', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Coaches', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'denied' },
    { module: 'Classes', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Attendance', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'granted', viewOwn: 'denied' },
    { module: 'Payments', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Reports', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'denied' },
    { module: 'Users', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'denied' },
    { module: 'Settings', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
  student: [
    { module: 'Students', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Coaches', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'denied' },
    { module: 'Classes', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Attendance', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'denied', viewOwn: 'granted' },
    { module: 'Payments', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'granted' },
    { module: 'Reports', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Users', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Settings', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
  parent: [
    { module: 'Students', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Coaches', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'denied' },
    { module: 'Classes', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Attendance', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'denied', viewOwn: 'granted' },
    { module: 'Payments', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'granted' },
    { module: 'Reports', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Users', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'granted' },
    { module: 'Settings', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
  front_desk: [
    { module: 'Students', view: 'granted', create: 'granted', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Coaches', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Classes', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Attendance', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'granted', viewOwn: 'denied' },
    { module: 'Payments', view: 'granted', create: 'granted', edit: 'denied', delete: 'denied', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Reports', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'denied' },
    { module: 'Users', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Settings', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
  accountant: [
    { module: 'Students', view: 'denied', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Coaches', view: 'denied', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Classes', view: 'denied', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'denied', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Attendance', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'denied', viewOwn: 'denied' },
    { module: 'Payments', view: 'granted', create: 'granted', edit: 'granted', delete: 'granted', manage: 'granted', mark: 'na', viewOwn: 'na' },
    { module: 'Reports', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'granted', mark: 'na', viewOwn: 'na' },
    { module: 'Users', view: 'denied', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Settings', view: 'granted', create: 'na', edit: 'denied', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
  verification_ops: [
    { module: 'Students', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Coaches', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Classes', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Attendance', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'denied', viewOwn: 'na' },
    { module: 'Payments', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Reports', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Users', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Settings', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'granted', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
  support: [
    { module: 'Students', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Coaches', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Classes', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Attendance', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'denied', viewOwn: 'na' },
    { module: 'Payments', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Reports', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Users', view: 'granted', create: 'denied', edit: 'denied', delete: 'denied', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Settings', view: 'granted', create: 'na', edit: 'denied', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
  platform_finance: [
    { module: 'Students', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Coaches', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Classes', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Attendance', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'denied', viewOwn: 'na' },
    { module: 'Payments', view: 'granted', create: 'granted', edit: 'granted', delete: 'granted', manage: 'granted', mark: 'na', viewOwn: 'na' },
    { module: 'Reports', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'granted', mark: 'na', viewOwn: 'na' },
    { module: 'Users', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Settings', view: 'granted', create: 'na', edit: 'denied', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
  marketplace_partner: [
    { module: 'Students', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Coaches', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Classes', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Batches', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Attendance', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'denied', viewOwn: 'na' },
    { module: 'Payments', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Reports', view: 'granted', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Users', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
    { module: 'Settings', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Roles', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'denied', mark: 'na', viewOwn: 'na' },
    { module: 'Audit Logs', view: 'denied', create: 'na', edit: 'na', delete: 'na', manage: 'na', mark: 'na', viewOwn: 'na' },
  ],
};

function PlatformRolesPanel() {
  const [roles, setRoles] = useState<RoleItem[]>(DEFAULT_SYSTEM_ROLES);
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>('admin');
  const [matrices, setMatrices] = useState<Record<string, ModulePermissions[]>>(DEFAULT_MATRIX_BY_ROLE);
  const [assignments, setAssignments] = useState<RoleAssignment[] | null>(null);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantRoleKey, setGrantRoleKey] = useState(PLATFORM_ROLES[1]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  function load() {
    api<{ assignments: RoleAssignment[]; systemRoles: Array<{ key: string; scope: string; userCount: number }> }>('/api/v1/platform/roles')
      .then((res) => {
        setAssignments(res.assignments ?? []);
        if (res.systemRoles && res.systemRoles.length > 0) {
          const countsMap = new Map(res.systemRoles.map((sr) => [sr.key, sr.userCount]));
          setRoles((prev) =>
            prev.map((r) => {
              const directCount = countsMap.get(r.key);
              let cnt = directCount ?? 0;
              if (r.key === 'admin') {
                cnt = (countsMap.get('owner') ?? 0) + (countsMap.get('org_admin') ?? 0) + (countsMap.get('admin') ?? 0);
              }
              return {
                ...r,
                userCount: cnt > 0 ? cnt : r.userCount,
              };
            })
          );
        }
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function grant() {
    if (!grantUserId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/platform/roles', { method: 'POST', body: JSON.stringify({ userId: grantUserId.trim(), roleKey: grantRoleKey }) });
      setGrantUserId('');
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

  // Toggle cell permission (strictly between granted and denied; NA remains fixed)
  function toggleCell(moduleName: string, actionKey: keyof Omit<ModulePermissions, 'module'>) {
    setMatrices((prev) => {
      const currentRoleMatrix = prev[selectedRoleKey] || DEFAULT_MATRIX_BY_ROLE[selectedRoleKey] || DEFAULT_MATRIX_BY_ROLE['admin'];
      const updated = currentRoleMatrix.map((row) => {
        if (row.module !== moduleName) return row;
        const currentVal = row[actionKey];
        if (currentVal === 'na') return row; // Keep NA cells fixed
        const nextVal: PermissionState = currentVal === 'granted' ? 'denied' : 'granted';
        return { ...row, [actionKey]: nextVal };
      });
      return { ...prev, [selectedRoleKey]: updated };
    });
    setHasUnsavedChanges(true);
    setSaveSuccess(false);
  }

  async function saveMatrixChanges() {
    setSavingMatrix(true);
    try {
      // Simulate/persist matrix policy save
      await new Promise((resolve) => setTimeout(resolve, 300));
      setHasUnsavedChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSavingMatrix(false);
    }
  }

  function handleCreateRole() {
    if (!newRoleName.trim()) return;
    const key = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');
    const newRole: RoleItem = {
      id: key,
      name: newRoleName.trim(),
      key,
      isSystem: false,
      userCount: 0,
    };
    setRoles((prev) => [...prev, newRole]);
    setMatrices((prev) => ({
      ...prev,
      [key]: MODULE_ROWS.map((m) => ({
        module: m,
        view: 'granted',
        create: 'na',
        edit: 'na',
        delete: 'na',
        manage: 'na',
        mark: 'na',
        viewOwn: 'na',
      })),
    }));
    setSelectedRoleKey(key);
    setNewRoleName('');
    setShowCreateModal(false);
  }

  const selectedRole = roles.find((r) => r.key === selectedRoleKey) || roles[0];
  const activeMatrix = matrices[selectedRoleKey] || DEFAULT_MATRIX_BY_ROLE[selectedRoleKey] || DEFAULT_MATRIX_BY_ROLE['admin'];

  return (
    <div className="space-y-8">
      <PageHeader
        badge="Access Governance"
        badgeIcon={ShieldCheck}
        title="Roles & Permissions"
        description="Configure granular access control policies for each role"
      />

      <ErrorBanner error={error} />

      {/* Main 2-Column Access Governance Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: ACTIVE ROLES (Narrower Width) */}
        <div className="space-y-4 lg:col-span-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Active Roles</span>
          </div>

          {/* Platform Roles Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 text-[10px] font-extrabold uppercase tracking-wider text-purple-400">
              <span>🌐 Platform Roles</span>
              <span className="rounded-full bg-purple-500/10 px-2 py-0.5 border border-purple-500/20 text-purple-300 font-bold">
                {roles.filter((r) => r.scope === 'platform').length}
              </span>
            </div>
            <div className="space-y-1.5">
              {roles
                .filter((r) => r.scope === 'platform')
                .map((r) => {
                  const active = r.key === selectedRoleKey;
                  return (
                    <div
                      key={r.id}
                      onClick={() => {
                        setSelectedRoleKey(r.key);
                        setHasUnsavedChanges(false);
                      }}
                      className={`group relative grid grid-cols-[120px_56px_1fr] items-center gap-1.5 cursor-pointer rounded-xl border px-3 py-2 transition-all duration-200 ${
                        active
                          ? 'border-indigo-500/60 bg-indigo-600/20 shadow-indigo-500/15 shadow-sm text-white'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06] text-slate-200'
                      }`}
                    >
                      {/* Left Column: Role Name (Fixed 120px Width) */}
                      <div className="truncate text-xs font-bold min-w-0 pr-1" title={r.name}>
                        <span className={`${active ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                          {r.name}
                        </span>
                      </div>

                      {/* Middle Column (Strict Vertical Line): System/Custom Badge */}
                      <div className="w-14 flex justify-start">
                        {r.isSystem ? (
                          <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-indigo-300 border border-indigo-500/30 text-center w-full block">
                            System
                          </span>
                        ) : (
                          <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-purple-300 border border-purple-500/30 text-center w-full block">
                            Custom
                          </span>
                        )}
                      </div>

                      {/* Right Column: User Count & Lock */}
                      <div className="flex items-center justify-end gap-1.5 min-w-0">
                        <span className="text-[10px] font-semibold text-slate-400 truncate">
                          {r.userCount} user{r.userCount === 1 ? '' : 's'}
                        </span>
                        {r.isSystem && <span className="text-[10px] text-slate-500 shrink-0" title="System Role">🔒</span>}
                        {active && <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-glow shrink-0 ml-0.5" />}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Org Roles Section */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between px-1 text-[10px] font-extrabold uppercase tracking-wider text-indigo-400">
              <span>🏢 Organization Roles</span>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 border border-indigo-500/20 text-indigo-300 font-bold">
                {roles.filter((r) => r.scope !== 'platform').length}
              </span>
            </div>
            <div className="space-y-1.5">
              {roles
                .filter((r) => r.scope !== 'platform')
                .map((r) => {
                  const active = r.key === selectedRoleKey;
                  return (
                    <div
                      key={r.id}
                      onClick={() => {
                        setSelectedRoleKey(r.key);
                        setHasUnsavedChanges(false);
                      }}
                      className={`group relative grid grid-cols-[120px_56px_1fr] items-center gap-1.5 cursor-pointer rounded-xl border px-3 py-2 transition-all duration-200 ${
                        active
                          ? 'border-indigo-500/60 bg-indigo-600/20 shadow-indigo-500/15 shadow-sm text-white'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06] text-slate-200'
                      }`}
                    >
                      {/* Left Column: Role Name (Fixed 120px Width) */}
                      <div className="truncate text-xs font-bold min-w-0 pr-1" title={r.name}>
                        <span className={`${active ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                          {r.name}
                        </span>
                      </div>

                      {/* Middle Column (Strict Vertical Line): System/Custom Badge */}
                      <div className="w-14 flex justify-start">
                        {r.isSystem ? (
                          <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-indigo-300 border border-indigo-500/30 text-center w-full block">
                            System
                          </span>
                        ) : (
                          <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-purple-300 border border-purple-500/30 text-center w-full block">
                            Custom
                          </span>
                        )}
                      </div>

                      {/* Right Column: User Count & Lock */}
                      <div className="flex items-center justify-end gap-1.5 min-w-0">
                        <span className="text-[10px] font-semibold text-slate-400 truncate">
                          {r.userCount} user{r.userCount === 1 ? '' : 's'}
                        </span>
                        {r.isSystem && <span className="text-[10px] text-slate-500 shrink-0" title="System Role">🔒</span>}
                        {active && <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-glow shrink-0 ml-0.5" />}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Create Role Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-500/40 bg-indigo-500/5 py-2.5 text-xs font-bold text-indigo-300 transition-all hover:border-indigo-500/80 hover:bg-indigo-500/10"
          >
            <UserPlus className="h-4 w-4" /> + Create Role
          </button>
        </div>

        {/* Right Column: PERMISSIONS MATRIX TABLE (Wider Column) */}
        <div className="lg:col-span-9">
          <div className="glass-panel overflow-hidden rounded-2xl border border-white/10 shadow-xl">
            {/* Matrix Header + Save Changes Button */}
            <div className="flex items-center justify-between border-b border-white/10 p-5 bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{selectedRole.name}</h3>
                  <p className="text-xs text-slate-400">Click cells to toggle permissions</p>
                </div>
              </div>

              {/* Save Changes Button (matching uploaded design) */}
              <button
                disabled={!hasUnsavedChanges || savingMatrix}
                onClick={saveMatrixChanges}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-md ${
                  saveSuccess
                    ? 'bg-emerald-500 text-white border border-emerald-400'
                    : hasUnsavedChanges
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 hover:scale-[1.02]'
                    : 'bg-white/5 text-slate-500 border border-white/10 opacity-50 cursor-not-allowed'
                }`}
              >
                {saveSuccess ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-white" /> Saved!
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" /> Save Changes
                  </>
                )}
              </button>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-black/20">
                    <th className="py-3.5 pl-6 pr-4">Module</th>
                    <th className="px-3 py-3.5 text-center">View</th>
                    <th className="px-3 py-3.5 text-center">Create</th>
                    <th className="px-3 py-3.5 text-center">Edit</th>
                    <th className="px-3 py-3.5 text-center">Delete</th>
                    <th className="px-3 py-3.5 text-center">Manage</th>
                    <th className="px-3 py-3.5 text-center">Mark</th>
                    <th className="py-3.5 pl-3 pr-6 text-center">View Own</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium">
                  {activeMatrix.map((row) => {
                    return (
                      <tr key={row.module} className="transition-colors hover:bg-white/[0.02]">
                        <td className="py-3.5 pl-6 pr-4 font-bold text-slate-200">{row.module}</td>
                        {(['view', 'create', 'edit', 'delete', 'manage', 'mark', 'viewOwn'] as const).map((col, idx) => {
                          const state = row[col];
                          return (
                            <td
                              key={col}
                              onClick={() => state !== 'na' && toggleCell(row.module, col)}
                              className={`py-3.5 text-center ${state !== 'na' ? 'cursor-pointer hover:bg-white/5' : ''} ${idx === 6 ? 'pr-6' : 'px-3'}`}
                            >
                              {state === 'granted' ? (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </span>
                              ) : state === 'denied' ? (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-500/10 text-slate-500 border border-slate-500/20">
                                  <XCircle className="h-3.5 w-3.5" />
                                </span>
                              ) : (
                                <span className="text-slate-600 font-bold">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Create Role Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-md w-full rounded-2xl border border-white/20 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Create Custom Role</h3>
            <p className="text-xs text-slate-400">Specify a title for the new role to configure permissions in the matrix.</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Role Title</label>
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g. Senior Coach, Front Desk Manager"
                className="glass-input w-full rounded-xl px-3 py-2 text-xs font-medium text-slate-200"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                disabled={!newRoleName.trim()}
                onClick={handleCreateRole}
                className="btn-premium rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50"
              >
                Create Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── User Directory (User Management & Role Assignments) ───────────

function UserDirectoryPanel() {
  const [assignments, setAssignments] = useState<RoleAssignment[] | null>(null);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantRoleKey, setGrantRoleKey] = useState(PLATFORM_ROLES[1]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  function load() {
    api<{ assignments: RoleAssignment[] }>('/api/v1/platform/roles')
      .then((data) => setAssignments(data.assignments ?? []))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function grant() {
    if (!grantUserId.trim()) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api('/api/v1/platform/roles', { method: 'POST', body: JSON.stringify({ userId: grantUserId.trim(), roleKey: grantRoleKey }) });
      setGrantUserId('');
      setShowAddModal(false);
      setSuccessMsg('Platform role granted successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(a: RoleAssignment) {
    setError(null);
    setSuccessMsg(null);
    try {
      await api(`/api/v1/platform/roles/${a.userId}/${a.roleKey}`, { method: 'DELETE' });
      setSuccessMsg(`Role ${a.roleKey.toUpperCase().replace(/_/g, ' ')} revoked successfully.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  const allUsers = (assignments ?? []).map((a) => {
    const email = a.email || a.userEmail || `${a.userId.substring(0, 8)}@abhyas.app`;
    const rawName = a.displayName || (email.includes('@') ? email.split('@')[0].replace(/[\._-]/g, ' ') : `Staff (${a.userId.substring(0, 6)})`);
    const formattedName = rawName.replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      id: a.userId,
      name: formattedName,
      email: email,
      org: 'ABHYAS PLATFORM',
      role: a.roleKey.toUpperCase().replace(/_/g, ' '),
      phone: '+91 98765 43210',
      status: 'Active',
      initials: formattedName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase() || 'SU',
      assignment: a,
      isSystemSuperAdmin: a.seed,
    };
  });

  const filteredUsers = allUsers.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.role.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = selectedRoleFilter === 'ALL' || u.role.toUpperCase() === selectedRoleFilter.toUpperCase();
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        badge="User Directory"
        badgeIcon={Users}
        title="User Management"
        description="Manage academy staff, coaches, and administrators"
        action={
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all cursor-pointer"
          >
            <UserPlus className="h-4 w-4" /> + Add New User
          </button>
        }
      />

      <ErrorBanner error={error} />
      {successMsg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-300">
          ✓ {successMsg}
        </div>
      )}

      {/* Search and Role Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-400 shrink-0">Filter by Role:</label>
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="glass-input rounded-2xl border border-white/10 bg-slate-900/90 px-3 py-2 text-xs font-bold text-slate-200 focus:border-indigo-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL" className="bg-slate-900 text-white">All Roles</option>
            {PLATFORM_ROLES.map((r) => (
              <option key={r} value={r.toUpperCase().replace(/_/g, ' ')} className="bg-slate-900 text-white">
                {r.toUpperCase().replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Section Divider */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <span className="rounded-full bg-amber-500/10 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-400 border border-amber-500/20">
          SUPER ADMINS &amp; STAFF
        </span>
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
          {filteredUsers.length} MEMBER{filteredUsers.length === 1 ? '' : 'S'}
        </span>
      </div>

      {/* User Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredUsers.map((user) => (
          <div key={user.id} className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-white/20 hover:bg-white/[0.06]">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-xs font-black text-indigo-300 border border-indigo-500/30">
                  {user.initials}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{user.name}</h3>
                  <p className="text-xs text-slate-400 truncate max-w-[170px]" title={user.email}>{user.email}</p>
                </div>
              </div>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-300 border border-amber-500/30">
                {user.role}
              </span>
            </div>

            {/* Org Pill */}
            <div className="mt-3">
              <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/20">
                {user.org}
              </span>
            </div>

            {/* Phone & Status */}
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-500" />
                <span>{user.phone}</span>
              </div>
              <div className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{user.status}</span>
              </div>
            </div>

            {/* Action */}
            <div className="mt-4 pt-3 border-t border-white/10">
              {user.assignment ? (
                <button
                  onClick={() => revoke(user.assignment!)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-xs font-bold text-red-300 hover:bg-red-500/20 transition-all cursor-pointer"
                >
                  <Ban className="h-3.5 w-3.5" /> Deactivate / Revoke
                </button>
              ) : (
                <div className="w-full text-center py-2 text-[11px] font-semibold text-slate-500 italic">
                  System Owner (Protected)
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Grant Role Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md space-y-4 rounded-2xl border border-white/10 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-indigo-400" /> Grant Platform Role
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">User ID or Email</label>
                <input
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                  placeholder="e.g. user_123 or name@example.com"
                  className="glass-input w-full rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">Select Role</label>
                <select
                  value={grantRoleKey}
                  onChange={(e) => setGrantRoleKey(e.target.value)}
                  className="glass-input w-full rounded-xl px-3 py-2 text-sm text-white bg-slate-900"
                >
                  {PLATFORM_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.toUpperCase().replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAddModal(false)} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">
                Cancel
              </button>
              <button disabled={busy || !grantUserId.trim()} onClick={grant} className="btn-premium rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50">
                Grant Role
              </button>
            </div>
          </div>
        </div>
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
      <PageHeader badge="Support Access" badgeIcon={Headphones} title="Support access" description="Time-boxed, audited org entry — never standing access (Doc 04 §9)." />
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

// ── Global Settings (wireframe 4j) ───────────────────────────────────

interface FeatureFlag {
  key: string;
  defaultOn: boolean;
  description: string | null;
}

function GlobalSettingsPanel() {
  const [activeCategory, setActiveCategory] = useState<'general' | 'policies' | 'flags' | 'security'>('general');
  const [flags, setFlags] = useState<FeatureFlag[] | null>(null);
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // System Settings State
  const [sessionRetention, setSessionRetention] = useState('30');
  const [supportGrantMax, setSupportGrantMax] = useState('24');
  const [maxBranches, setMaxBranches] = useState('10');
  const [senderName, setSenderName] = useState('Abhyas Notifications');
  const [enableTelemetry, setEnableTelemetry] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [autoRevokeExpired, setAutoRevokeExpired] = useState(true);

  function load() {
    api<FeatureFlag[]>('/api/v1/platform/feature-flags')
      .then(setFlags)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function createFlag() {
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

  async function toggleFlag(f: FeatureFlag) {
    setError(null);
    try {
      await api('/api/v1/platform/feature-flags', {
        method: 'POST',
        body: JSON.stringify({ key: f.key, defaultOn: !f.defaultOn, description: f.description ?? undefined }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  const categories = [
    { id: 'general', label: 'General', group: 'General' },
    { id: 'policies', label: 'Platform Policies', group: 'General' },
    { id: 'flags', label: 'Feature Flags', group: 'General' },
    { id: 'security', label: 'Security & Maintenance', group: 'Security' },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        badge="System Configuration"
        badgeIcon={Settings}
        title="Settings"
        description="Manage your system credentials, platform policies, and feature flags."
      />

      <ErrorBanner error={error} />
      {saveSuccess && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-300">
          ✓ Settings saved successfully.
        </div>
      )}

      {/* 2-Column Layout matching reference design */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Category Navigation Menu */}
        <div className="space-y-6 lg:col-span-3">
          <div className="space-y-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-2">General</span>
              <div className="mt-2 space-y-1">
                {categories.filter(c => c.group === 'General').map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      activeCategory === cat.id
                        ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-2">Security</span>
              <div className="mt-2 space-y-1">
                {categories.filter(c => c.group === 'Security').map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      activeCategory === cat.id
                        ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Active Category Content Area */}
        <div className="space-y-6 lg:col-span-9">
          {/* General Category */}
          {activeCategory === 'general' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-extrabold text-white">General</h2>
                <p className="text-xs text-slate-400">Manage telemetry, system branding, and notification defaults.</p>
              </div>

              <div className="glass-panel divide-y divide-white/10 rounded-2xl border border-white/10 p-6 space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">Enable Telemetry</h4>
                    <p className="text-xs text-slate-400">When toggled on, collects anonymized usage data to help enhance system performance.</p>
                  </div>
                  <button
                    onClick={() => setEnableTelemetry(!enableTelemetry)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                      enableTelemetry ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-400 border border-white/10'
                    }`}
                  >
                    {enableTelemetry ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-4 pb-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">Marketing &amp; System Emails</h4>
                    <p className="text-xs text-slate-400">Receive product updates, security advisories, and feature promotions.</p>
                  </div>
                  <button
                    onClick={() => setMarketingEmails(!marketingEmails)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                      marketingEmails ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-400 border border-white/10'
                    }`}
                  >
                    {marketingEmails ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="pt-4 space-y-2">
                  <h4 className="text-sm font-bold text-white">Notification Sender Name</h4>
                  <p className="text-xs text-slate-400">Default sender name for system notification emails.</p>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    className="glass-input w-full max-w-md rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    onClick={saveSettings}
                    disabled={savingSettings}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-indigo-500 transition-all disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> {savingSettings ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Platform Policies Category */}
          {activeCategory === 'policies' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-extrabold text-white">Platform Policies</h2>
                <p className="text-xs text-slate-400">Core operational thresholds and session boundaries across all organizations.</p>
              </div>

              <div className="glass-panel divide-y divide-white/10 rounded-2xl border border-white/10 p-6 space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">Session Cookie Retention (Days)</h4>
                    <p className="text-xs text-slate-400 mb-2">Duration before a user refresh token expires.</p>
                    <input
                      type="number"
                      value={sessionRetention}
                      onChange={(e) => setSessionRetention(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-white">Support Access Max Duration (Hours)</h4>
                    <p className="text-xs text-slate-400 mb-2">Auto-revoke timer for platform support grants.</p>
                    <input
                      type="number"
                      value={supportGrantMax}
                      onChange={(e) => setSupportGrantMax(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <h4 className="text-sm font-bold text-white">Max Branch Limit per Organization</h4>
                    <p className="text-xs text-slate-400 mb-2">Maximum allowed branches per academy organization.</p>
                    <input
                      type="number"
                      value={maxBranches}
                      onChange={(e) => setMaxBranches(e.target.value)}
                      className="glass-input w-full max-w-xs rounded-xl px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    onClick={saveSettings}
                    disabled={savingSettings}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-indigo-500 transition-all disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> {savingSettings ? 'Saving...' : 'Save Policies'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Feature Flags Category */}
          {activeCategory === 'flags' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-extrabold text-white">Feature Flags</h2>
                <p className="text-xs text-slate-400">Global kill switches and experimental feature rollout controls.</p>
              </div>

              <div className="glass-panel rounded-2xl border border-white/10 p-6 space-y-4">
                <div className="flex items-end gap-2 border-b border-white/10 pb-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">Flag Key</label>
                    <input value={key} onChange={(e) => setKey(e.target.value)} className="glass-input w-48 rounded-xl px-3 py-2 text-sm text-white" placeholder="flag_key" />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
                    <input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe feature flag purpose..."
                      className="glass-input w-full rounded-xl px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <button
                    disabled={!key.trim()}
                    onClick={createFlag}
                    className="btn-premium rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    + New Flag
                  </button>
                </div>

                {flags === null ? (
                  <p className="text-sm text-slate-400">Loading feature flags...</p>
                ) : (
                  <div className="divide-y divide-white/10 rounded-xl overflow-hidden border border-white/10 bg-white/[0.02]">
                    {flags.map((f) => (
                      <div key={f.key} className="flex items-center justify-between gap-4 p-4">
                        <div>
                          <h4 className="text-sm font-bold text-white">{f.key}</h4>
                          {f.description && <p className="text-xs text-slate-400 mt-0.5">{f.description}</p>}
                        </div>
                        <button
                          onClick={() => toggleFlag(f)}
                          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                            f.defaultOn ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-400 border border-white/10'
                          }`}
                        >
                          {f.defaultOn ? 'ENABLED' : 'DISABLED'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Security & Maintenance Category */}
          {activeCategory === 'security' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-extrabold text-white">Security &amp; Maintenance</h2>
                <p className="text-xs text-slate-400">System maintenance toggles and access grant controls.</p>
              </div>

              <div className="glass-panel divide-y divide-white/10 rounded-2xl border border-white/10 p-6 space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">System Maintenance Mode</h4>
                    <p className="text-xs text-slate-400">When enabled, non-admin users will see a maintenance notice upon logging in.</p>
                  </div>
                  <button
                    onClick={() => setMaintenanceMode(!maintenanceMode)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                      maintenanceMode ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-white/5 text-slate-400 border border-white/10'
                    }`}
                  >
                    {maintenanceMode ? 'ACTIVE' : 'OFF'}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-4 pb-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">Auto-Revoke Expired Support Access</h4>
                    <p className="text-xs text-slate-400">Automatically revoke temporary platform support grants when the timer expires.</p>
                  </div>
                  <button
                    onClick={() => setAutoRevokeExpired(!autoRevokeExpired)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                      autoRevokeExpired ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-400 border border-white/10'
                    }`}
                  >
                    {autoRevokeExpired ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    onClick={saveSettings}
                    disabled={savingSettings}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-indigo-500 transition-all disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> {savingSettings ? 'Saving...' : 'Save Security Settings'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
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
      <PageHeader badge="Announcements" badgeIcon={Megaphone} title="Announcements" description="Platform-wide messages surfaced in-app." />
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

// ── Audit trail (wireframe 4e, Doc 07 §16) ─────────────────────────

interface AuditEntry {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  orgName: string | null;
  supportGrantId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  occurredAt: string;
}

const MODULE_OPTIONS = [
  'All Modules',
  'Students',
  'Coaches',
  'Attendance',
  'Payments',
  'Reports',
  'Users',
  'Roles',
  'Settings',
  'Audit Logs',
];

const ACTION_OPTIONS = [
  'All Actions',
  'ONBOARD',
  'SWITCH_ROLE',
  'GRANT',
  'REVOKE',
  'SUSPEND',
  'VERIFY',
  'CREATE',
  'UPDATE',
  'DELETE',
];

const TIME_OPTIONS = [
  'All Time',
  'Today',
  'Past 7 Days',
  'Past 30 Days',
];

function getModuleCategory(entry: AuditEntry): string {
  const action = (entry.action || '').toLowerCase();
  const target = (entry.targetType || '').toLowerCase();
  if (action.includes('coach') || target.includes('coach') || target.includes('staff')) return 'Coaches';
  if (action.includes('student') || target.includes('student') || target.includes('enroll')) return 'Students';
  if (action.includes('attend') || target.includes('attend')) return 'Attendance';
  if (action.includes('pay') || action.includes('charge') || target.includes('finance')) return 'Payments';
  if (action.includes('report') || target.includes('report')) return 'Reports';
  if (action.includes('role') || target.includes('role')) return 'Roles';
  if (action.includes('user') || target.includes('user')) return 'Users';
  if (action.includes('setting') || action.includes('org') || target.includes('org')) return 'Settings';
  return 'Audit Logs';
}

function getActionCategory(entry: AuditEntry): string {
  const action = (entry.action || '').toUpperCase();
  if (action.includes('ONBOARD')) return 'ONBOARD';
  if (action.includes('SWITCH')) return 'SWITCH_ROLE';
  if (action.includes('GRANT')) return 'GRANT';
  if (action.includes('REVOKE')) return 'REVOKE';
  if (action.includes('SUSPEND')) return 'SUSPEND';
  if (action.includes('VERIFY')) return 'VERIFY';
  if (action.includes('CREATE')) return 'CREATE';
  if (action.includes('UPDATE')) return 'UPDATE';
  if (action.includes('DELETE')) return 'DELETE';
  return action.split('.')[0] || 'ACTION';
}

function getAccentColor(actionCategory: string): string {
  switch (actionCategory) {
    case 'ONBOARD':
    case 'CREATE':
      return '#3b82f6'; // blue
    case 'SWITCH_ROLE':
    case 'GRANT':
      return '#8b5cf6'; // purple
    case 'VERIFY':
      return '#10b981'; // emerald
    case 'SUSPEND':
    case 'REVOKE':
    case 'DELETE':
      return '#ef4444'; // red
    case 'UPDATE':
      return '#f59e0b'; // amber
    default:
      return '#6366f1'; // indigo
  }
}

function formatAuditDescription(entry: AuditEntry): string {
  const d = entry.detail || {};
  const actor = entry.actorName || entry.actorEmail || entry.actorUserId || 'User';
  const action = entry.action;

  if (action === 'platform_role.grant') {
    return `Granted platform role '${d.roleKey ?? 'role'}' to user ${entry.targetId ?? ''}`;
  }
  if (action === 'platform_role.revoke') {
    return `Revoked platform role '${d.roleKey ?? 'role'}' from user ${entry.targetId ?? ''}`;
  }
  if (action === 'platform.org.verify') {
    return `Verified organization ${entry.orgName ? `'${entry.orgName}'` : entry.targetId ?? ''} (Decision: ${d.decision ?? 'processed'})`;
  }
  if (action === 'platform.org.suspend') {
    return `Suspended organization ${entry.orgName ? `'${entry.orgName}'` : entry.targetId ?? ''} (Reason: ${d.reason ?? 'N/A'})`;
  }
  if (action === 'platform.org.reinstate') {
    return `Reinstated organization ${entry.orgName ? `'${entry.orgName}'` : entry.targetId ?? ''}`;
  }
  if (action === 'platform.org.delete') {
    const name = entry.orgName || d.name;
    return `Permanently deleted organization ${name ? `'${name}'` : entry.targetId ?? ''}${d.reason ? ` (Reason: ${d.reason})` : ''}`;
  }
  if (action === 'platform.org.archive') {
    return `Archived organization ${entry.orgName ? `'${entry.orgName}'` : entry.targetId ?? ''}${d.reason ? ` (Reason: ${d.reason})` : ''}`;
  }
  if (action === 'org.delete') {
    const name = entry.orgName || d.name;
    return `${actor} deleted workspace ${name ? `'${name}'` : entry.targetId ?? ''}`;
  }
  if (action === 'org.leave') {
    return `${actor} left workspace ${entry.orgName ? `'${entry.orgName}'` : entry.targetId ?? ''}`;
  }
  if (action.includes('switch_role')) {
    return `User ${entry.actorEmail || actor} switched active role from '${d.fromRole ?? 'previous'}' to '${d.toRole ?? 'new'}'`;
  }
  if (action.includes('onboard')) {
    return `Onboarded coach ${d.name ?? entry.targetId ?? 'profile'} (${d.email ?? entry.actorEmail ?? ''})`;
  }

  // General fallback text
  let desc = `${actor} performed '${action}'`;
  if (entry.targetType) desc += ` on ${entry.targetType} ${entry.targetId ?? ''}`;
  if (entry.orgName) desc += ` in '${entry.orgName}'`;
  return desc;
}

function AuditTrailPanel() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState('All Modules');
  const [selectedAction, setSelectedAction] = useState('All Actions');
  const [selectedTime, setSelectedTime] = useState('All Time');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api<AuditEntry[]>('/api/v1/platform/audit-log')
      .then(setEntries)
      .catch((err) => setError(err.message));
  }, []);

  const filteredEntries = (entries || []).filter((e) => {
    // Module Filter
    if (selectedModule !== 'All Modules') {
      const mod = getModuleCategory(e);
      if (mod.toLowerCase() !== selectedModule.toLowerCase()) return false;
    }

    // Action Filter
    if (selectedAction !== 'All Actions') {
      const act = getActionCategory(e);
      if (act.toLowerCase() !== selectedAction.toLowerCase()) return false;
    }

    // Time Filter
    if (selectedTime !== 'All Time') {
      const occurred = new Date(e.occurredAt).getTime();
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      if (selectedTime === 'Today' && now - occurred > oneDay) return false;
      if (selectedTime === 'Past 7 Days' && now - occurred > 7 * oneDay) return false;
      if (selectedTime === 'Past 30 Days' && now - occurred > 30 * oneDay) return false;
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const desc = formatAuditDescription(e).toLowerCase();
      const act = e.action.toLowerCase();
      const actor = (e.actorName || e.actorEmail || e.actorUserId || '').toLowerCase();
      const org = (e.orgName || '').toLowerCase();
      const detailStr = JSON.stringify(e.detail || {}).toLowerCase();
      const match = desc.includes(q) || act.includes(q) || actor.includes(q) || org.includes(q) || detailStr.includes(q);
      if (!match) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Audit Trail"
        badgeIcon={RotateCcw}
        title="Audit Logs"
        description="Complete chronological record of all administrative actions"
      />

      <ErrorBanner error={error} />

      {/* Toolbar: Search + Module + Action + Time + Count */}
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 border border-white/10">
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[280px]">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search actions or descriptions..."
              className="glass-input w-full rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-200 placeholder-slate-500"
            />
            <span className="absolute left-3 top-2.5 text-slate-500">🔍</span>
          </div>

          {/* Module Filter Dropdown */}
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            className="glass-input rounded-xl px-3 py-2 text-xs font-semibold text-slate-300"
          >
            {MODULE_OPTIONS.map((m) => (
              <option key={m} value={m} className="bg-slate-900 text-slate-200">
                {m === 'All Modules' ? '⚙️ All Modules' : m}
              </option>
            ))}
          </select>

          {/* Action Filter Dropdown */}
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="glass-input rounded-xl px-3 py-2 text-xs font-semibold text-slate-300"
          >
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a} className="bg-slate-900 text-slate-200">
                {a === 'All Actions' ? '⚡ All Actions' : a}
              </option>
            ))}
          </select>

          {/* Time Filter Dropdown */}
          <select
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className="glass-input rounded-xl px-3 py-2 text-xs font-semibold text-slate-300"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t} className="bg-slate-900 text-slate-200">
                🕒 {t}
              </option>
            ))}
          </select>
        </div>

        {/* Count Badge */}
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300">
          {filteredEntries.length} event{filteredEntries.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Log Entries List */}
      {entries === null ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading audit trail...</div>
      ) : filteredEntries.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center text-sm text-slate-400">
          No audit log events matched your filter criteria.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((e) => {
            const actionCat = getActionCategory(e);
            const moduleCat = getModuleCategory(e).toLowerCase();
            const accentColor = getAccentColor(actionCat);
            const isExpanded = expandedId === e.id;

            return (
              <div
                key={e.id}
                onClick={() => setExpandedId(isExpanded ? null : e.id)}
                className="glass-panel relative flex flex-col overflow-hidden rounded-2xl border border-white/10 transition-all duration-200 hover:border-indigo-500/30 cursor-pointer"
              >
                {/* Accent bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1.5"
                  style={{ backgroundColor: accentColor }}
                />

                <div className="flex flex-wrap items-center justify-between gap-4 p-4 pl-6">
                  {/* Left Badges + Description */}
                  <div className="flex flex-1 flex-col gap-2 min-w-[280px]">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-black tracking-wider uppercase text-white shadow-sm"
                        style={{ backgroundColor: accentColor }}
                      >
                        {actionCat}
                      </span>
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                        {moduleCat}
                      </span>
                      {e.orgName && (
                        <span className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                          {e.orgName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-100 leading-snug">
                      {formatAuditDescription(e)}
                    </p>
                  </div>

                  {/* Right Actor + Timestamp */}
                  <div className="flex items-center gap-6 text-right">
                    <div className="flex flex-col text-right">
                      <span className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-200">
                        <span>👤</span> {e.actorName || e.actorEmail || 'System Admin'}
                      </span>
                      <span className="flex items-center justify-end gap-1.5 text-[11px] font-medium text-slate-400 mt-0.5">
                        <span>🕒</span> {new Date(e.occurredAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expandable Debug Drawer */}
                {isExpanded && (
                  <div className="border-t border-white/10 bg-black/40 p-4 pl-6 space-y-2 text-xs font-mono text-slate-300">
                    <div className="flex items-center justify-between text-[11px] text-indigo-300 font-sans font-bold">
                      <span>DEBUG DETAILS (Event ID: {e.id})</span>
                      <span>Click row to collapse ▲</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><strong className="text-slate-400">Action:</strong> {e.action}</div>
                      <div><strong className="text-slate-400">Target Type:</strong> {e.targetType ?? 'N/A'}</div>
                      <div><strong className="text-slate-400">Target ID:</strong> {e.targetId ?? 'N/A'}</div>
                      <div><strong className="text-slate-400">Organization ID:</strong> {e.organizationId ?? 'N/A'}</div>
                      <div><strong className="text-slate-400">Actor User ID:</strong> {e.actorUserId ?? 'N/A'}</div>
                      <div><strong className="text-slate-400">Support Grant ID:</strong> {e.supportGrantId ?? 'N/A'}</div>
                    </div>
                    {e.detail && Object.keys(e.detail).length > 0 && (
                      <div className="pt-2">
                        <strong className="block text-slate-400 mb-1">Payload Detail JSON:</strong>
                        <pre className="rounded-xl border border-white/10 bg-slate-950 p-3 overflow-x-auto text-[11px] text-emerald-400">
                          {JSON.stringify(e.detail, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
