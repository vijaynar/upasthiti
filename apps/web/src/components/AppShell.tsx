'use client';

// Global app shell for every authenticated V2 surface (/platform, /people,
// /scheduling, /attendance, /finance, /notifications, /announcements,
// /marketplace, /workspace, /me/*) — before this, each of those routes rendered
// bare (no logo, no workspace context, no theme control, no way to sign
// out) because V2 never got its own version of V1's admin sidebar
// (apps/web/src/app/admin/layout.tsx, still on V1's Supabase-direct-client
// auth and schema, out of scope to extend further). This is that sidebar,
// rebuilt on V2's real session (cookie JWT via /api/v1/me, not
// supabase.auth) and mounted once per route tree via a thin layout.tsx.
//
// ORG_NAV items are filtered by the caller's ACTIVE role's permissions
// (migration 0022 — GET .../me/permissions) — a membership can HOLD several
// roles but only one is active at a time, and the nav follows that one role
// only, not the union of everything the membership could switch to. 'Me'
// items stay unfiltered (self-access, not RBAC-mediated per Doc 04 §4).

import { Suspense, useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  LayoutGrid,
  Gauge,
  Users,
  CalendarClock,
  CalendarDays,
  ScanFace,
  Wallet,
  Bell,
  Store,
  ShieldCheck,
  UserCog,
  TrendingUp,
  UserRound,
  LogOut,
  Moon,
  Sun,
  Palette,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Building2,
  Shield,
  Headphones,
  Megaphone,
  History,
  Settings,
  Check,
  Plus,
} from 'lucide-react';
import ThemeSelector from '@/components/ThemeSelector';
import { useTheme } from '@/lib/theme';
import { useWorkspace } from '@/lib/workspace';
import { TAGLINE } from '@/lib/brand';

async function api<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data as T;
  } catch {
    return null;
  }
}

// Display labels for the real org-scope role keys (migration 0006's
// `roles` seed) — "Member" is not one of these; it never was a real role.
const ORG_ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  org_admin: 'Org Admin',
  branch_admin: 'Branch Admin',
  coach: 'Coach',
  assistant_coach: 'Assistant Coach',
  front_desk: 'Front Desk',
  accountant: 'Accountant',
  student: 'Student',
};

// permission: the key that actually gates that page's RLS read policy (not
// a guess — traced to each module's `*_select_staff` policy), used to
// show/hide the item by the caller's active role only.
const ORG_NAV = [
  { label: 'Students', href: '/people', icon: Users, permission: 'people.student.read' },
  { label: 'Scheduling', href: '/scheduling', icon: CalendarClock, permission: 'schedule.calendar.read' },
  { label: 'Attendance', href: '/attendance', icon: ScanFace, permission: 'attendance.read' },
  { label: 'Finance', href: '/finance', icon: Wallet, permission: 'finance.charge.read' },
  { label: 'Staff HR', href: '/staff', icon: UserCog, permission: 'hr.staff.onboard' },
  { label: 'Marketplace', href: '/marketplace', icon: Store, permission: 'market.listing.manage' },
  { label: 'Notifications', href: '/notifications', icon: Bell, permission: 'notify.log.read' },
  { label: 'Announcements', href: '/announcements', icon: Megaphone, permission: 'notify.announcement.read' },
];

const ME_NAV = [
  { label: 'My Profile', href: '/me/profile', icon: UserCog },
  { label: 'My Batches', href: '/me/batches', icon: CalendarClock },
  { label: 'My Schedule', href: '/me/schedule', icon: CalendarDays },
  { label: 'My Attendance', href: '/me/attendance', icon: ScanFace },
  { label: 'My Performance', href: '/me/performance', icon: TrendingUp },
  { label: 'My Payments', href: '/me/payments', icon: Wallet },
  { label: 'My notifications', href: '/me/notifications', icon: Bell },
];

const PLATFORM_TABS = [
  { key: 'verification', label: 'Verification queue' },
  { key: 'organizations', label: 'Organizations' },
  { key: 'roles', label: 'Platform roles' },
  { key: 'support', label: 'Support access' },
  { key: 'flags', label: 'Feature flags' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'audit', label: 'Audit trail' },
];

function PlatformSubmenuList({ pathname, setSidebarOpen }: { pathname: string; setSidebarOpen: (open: boolean) => void }) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'verification';
  return (
    <div className="mt-0.5 space-y-0.5 pl-4">
      {PLATFORM_TABS.map(({ key, label }) => {
        const active = pathname === '/platform' && activeTab === key;
        return (
          <Link
            key={key}
            href={`/platform?tab=${key}`}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-2 rounded-md px-2 h-7 text-xs font-medium transition-all duration-150 group ${
              active ? 'bg-indigo-500/10 font-bold text-indigo-400' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-indigo-400' : 'bg-slate-600 group-hover:bg-slate-400'}`} />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [heldRoleKeys, setHeldRoleKeys] = useState<string[]>([]);
  const [activeRoleKey, setActiveRoleKey] = useState<string | null>(null);
  const [activePermissions, setActivePermissions] = useState<Set<string> | null>(null);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [platformRoles, setPlatformRoles] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [platformExpanded, setPlatformExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);
  const [switchingWorkspace, setSwitchingWorkspace] = useState<string | null>(null);
  const { mode, toggleMode } = useTheme();
  const { activeOrg, memberships, switchWorkspace: switchActiveWorkspace } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname.startsWith('/platform')) setPlatformExpanded(true);
  }, [pathname]);

  useEffect(() => {
    fetch('/api/v1/me')
      .then(async (res) => {
        if (res.status === 401) {
          router.push('/auth/login');
          return null;
        }
        if (!res.ok) return null;
        const body = await res.json();
        return body.data as { displayName: string; avatarPath: string | null };
      })
      .then((p) => {
        setDisplayName(p?.displayName ?? null);
        setAvatarPath(p?.avatarPath ?? null);
      })
      .catch(() => {});
    api<{ roles: string[] }>('/api/v1/me/platform-roles').then((r) => setPlatformRoles(r?.roles ?? []));
  }, []);

  // Roles and permissions are scoped to whichever org is active — refetch
  // whenever it changes, whether the switch happened here or on the
  // /workspace page (both write to the same WorkspaceProvider state).
  useEffect(() => {
    if (!activeOrg) {
      setHeldRoleKeys([]);
      setActiveRoleKey(null);
      setActivePermissions(null);
      return;
    }
    api<{ roleKeys: string[]; activeRoleKey: string | null }>(`/api/v1/orgs/${activeOrg.organizationId}/me/roles`)
      .then((r) => {
        setHeldRoleKeys(r?.roleKeys ?? []);
        setActiveRoleKey(r?.activeRoleKey ?? null);
      })
      .catch(() => {
        setHeldRoleKeys([]);
        setActiveRoleKey(null);
      });
    api<{ permissionKeys: string[] }>(`/api/v1/orgs/${activeOrg.organizationId}/me/permissions`)
      .then((r) => setActivePermissions(new Set(r?.permissionKeys ?? [])))
      .catch(() => setActivePermissions(new Set()));
  }, [activeOrg]);

  async function endSession() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.push('/auth/login');
    router.refresh();
  }

  async function switchRole(roleKey: string) {
    if (!activeOrg || roleKey === activeRoleKey) {
      setRoleMenuOpen(false);
      return;
    }
    setSwitchingRole(true);
    try {
      const res = await fetch(`/api/v1/orgs/${activeOrg.organizationId}/me/active-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleKey }),
      });
      if (!res.ok) throw new Error('switch failed');
      // Full reload: every page's own data (already fetched under the old
      // active role's permissions) needs to re-run against the new one, not
      // just this sidebar's local state.
      window.location.reload();
    } catch {
      setSwitchingRole(false);
      setRoleMenuOpen(false);
    }
  }

  async function switchWorkspace(organizationId: string) {
    if (organizationId === activeOrg?.organizationId) {
      setShowSettings(false);
      setWorkspaceExpanded(false);
      return;
    }
    setSwitchingWorkspace(organizationId);
    try {
      await switchActiveWorkspace(organizationId);
      setShowSettings(false);
      setWorkspaceExpanded(false);
    } catch {
      // best-effort; leave the flyout open so the user can retry
    } finally {
      setSwitchingWorkspace(null);
    }
  }

  const isPlatformStaff = platformRoles.length > 0;
  const visibleOrgNav = activePermissions ? ORG_NAV.filter((item) => activePermissions.has(item.permission)) : ORG_NAV;

  function navItem(item: { label: string; href: string; icon: typeof Users }) {
    const Icon = item.icon;
    const active = pathname === item.href || pathname.startsWith(item.href + '/');
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center gap-2.5 rounded-md px-2.5 h-9 text-[13px] font-medium transition-all duration-150 group ${
          active
            ? 'bg-indigo-600 text-white font-semibold shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'}`} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  return (
    <div className="relative flex min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <div className="radial-mesh-bg" />

      {/* ── Mobile header ── */}
      <header className="glass-panel fixed left-0 top-0 z-40 flex h-12 w-full items-center justify-between border-b border-white/10 px-4 md:hidden">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Abhyas" className="h-5 w-auto object-contain" />
          <span className="text-xs font-black tracking-widest text-indigo-400">ABHYAS</span>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-lg border border-white/10 bg-white/5 p-1.5 hover:bg-white/10"
        >
          <Menu className="h-4 w-4 text-slate-200" />
        </button>
      </header>

      {/* ── Sidebar ── */}
      <aside
        className={`glass-panel fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full transform flex-col border-r border-white/10 transition-transform duration-300 md:static md:h-screen md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : ''
        }`}
      >
        {/* Brand header */}
        <div className="relative flex h-12 items-center justify-between border-b border-white/10 px-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Abhyas" className="h-6 w-auto shrink-0 object-contain" />
            <div className="flex flex-col leading-tight">
              <span className="bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-xs font-extrabold tracking-wider text-transparent">
                ABHYAS
              </span>
              <span className="text-[8px] font-medium uppercase tracking-widest text-slate-500">
                {TAGLINE}
              </span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="rounded-md p-1 text-slate-400 hover:text-white md:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Active workspace card */}
        {(memberships.length > 0 || isPlatformStaff) && (
          <Link
            href="/workspace"
            className="mx-2.5 mt-2 flex items-center gap-2 rounded-lg border border-indigo-500/10 bg-indigo-950/20 p-2 hover:border-indigo-500/25 transition-all"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <div className="overflow-hidden">
              <h4 className="truncate text-xs font-bold tracking-wide text-slate-200">
                {isPlatformStaff ? 'Abhyas Platform' : activeOrg ? activeOrg.organizationName : 'No workspace selected'}
              </h4>
              <p className="truncate text-[10px] text-slate-400/80">
                {isPlatformStaff ? 'platform.abhyas.app' : activeOrg ? `${activeOrg.organizationSlug}.abhyas.app` : 'Choose a workspace →'}
              </p>
            </div>
          </Link>
        )}

        {/* Nav */}
        <nav className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-2.5 py-2">
          <div className="space-y-1">
            {navItem({ label: 'Dashboard', href: isPlatformStaff ? '/platform/dashboard' : '/dashboard', icon: LayoutDashboard })}
          </div>

          {activeOrg && (
            <div>
              <div className="mt-2 pt-2 border-t border-white/10 px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400/80">
                Manage
              </div>
              <div className="space-y-1">{visibleOrgNav.map(navItem)}</div>
            </div>
          )}

          {isPlatformStaff && (
            <div>
              <div className="mt-2 pt-2 border-t border-white/10 px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400/80">
                Administration
              </div>
              <div className="space-y-1">
                {[
                  { key: 'verification', label: 'Verification queue', href: '/platform?tab=verification', icon: CheckCircle2 },
                  { key: 'organizations', label: 'Organizations', href: '/platform?tab=organizations', icon: Building2 },
                  { key: 'roles', label: 'Roles & Permissions', href: '/platform?tab=roles', icon: Shield },
                  { key: 'users', label: 'User Directory', href: '/platform?tab=users', icon: Users },
                  { key: 'support', label: 'Support access', href: '/platform?tab=support', icon: Headphones },
                  { key: 'announcements', label: 'Announcements', href: '/platform?tab=announcements', icon: Megaphone },
                  { key: 'audit', label: 'Audit Logs', href: '/platform?tab=audit', icon: History },
                  { key: 'flags', label: 'Global Settings', href: '/platform?tab=flags', icon: Settings },
                ].map((item) => {
                  const Icon = item.icon;
                  const activeTab = searchParams.get('tab') || 'verification';
                  const active = pathname === '/platform' && activeTab === item.key;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-2.5 rounded-md px-2.5 h-9 text-[13px] font-medium transition-all duration-150 group ${
                        active
                          ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="mt-2 pt-2 border-t border-white/10 px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400/80">
              Me
            </div>
            <div className="space-y-1">
              {(isPlatformStaff && !activeOrg
                ? ME_NAV.filter((item) => item.href === '/me/profile' || item.href === '/me/notifications')
                : ME_NAV
              ).map(navItem)}
            </div>
          </div>
        </nav>

        {/* Footer: theme + user + end session */}
        <div className="space-y-1.5 border-t border-white/10 p-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowTheme(!showTheme)}
              title="Change theme"
              className="flex h-7 flex-1 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 text-xs font-semibold text-slate-400 hover:bg-white/10 hover:text-slate-200 transition"
            >
              <Palette className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
              Themes
            </button>
            <button
              onClick={toggleMode}
              title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 transition"
            >
              {mode === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="flex items-start gap-2 py-0.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800 text-indigo-400">
              {avatarPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPath} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
              ) : (
                <UserRound className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="relative min-w-0 flex-1">
              <h5 className="truncate text-xs font-bold text-slate-200">{displayName ?? '…'}</h5>
              <div className="mt-0.5">
              {isPlatformStaff ? (
                <div className="flex h-7 w-full items-center rounded-md border border-white/10 bg-white/5 px-1.5 text-[8px] font-extrabold uppercase tracking-wide text-slate-400">
                  {platformRoles.join(', ').replace(/_/g, ' ')}
                </div>
              ) : activeOrg ? (
                heldRoleKeys.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setRoleMenuOpen((v) => !v)}
                      disabled={switchingRole}
                      className="flex h-7 w-full items-center justify-between rounded-md border border-white/10 bg-white/5 px-1.5 text-[8px] font-extrabold uppercase tracking-wide text-slate-400 hover:bg-white/10 hover:text-slate-200 disabled:opacity-60"
                    >
                      {switchingRole ? 'Switching…' : ORG_ROLE_LABELS[activeRoleKey ?? ''] ?? activeRoleKey ?? '…'}
                      <ChevronDown className="h-2.5 w-2.5" />
                    </button>
                    {roleMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setRoleMenuOpen(false)} />
                        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-40 overflow-hidden rounded-lg border border-white/10 bg-slate-900 py-1 shadow-xl">
                          <div className="px-2.5 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                            Switch role
                          </div>
                          {heldRoleKeys.map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => switchRole(k)}
                              className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs font-medium transition ${
                                k === activeRoleKey ? 'text-indigo-300' : 'text-slate-300 hover:bg-white/5'
                              }`}
                            >
                              {ORG_ROLE_LABELS[k] ?? k}
                              {k === activeRoleKey && <span className="text-[10px]">●</span>}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex h-7 w-full items-center rounded-md border border-white/10 bg-white/5 px-1.5 text-[8px] font-extrabold uppercase tracking-wide text-slate-400">
                    {ORG_ROLE_LABELS[activeRoleKey ?? ''] ?? activeRoleKey ?? '…'}
                  </div>
                )
              ) : (
                <div className="flex h-7 w-full items-center rounded-md border border-white/10 bg-white/5 px-1.5 text-[8px] font-extrabold uppercase tracking-wide text-slate-400">
                  {memberships.length === 0 ? 'Student / Guardian' : 'No workspace'}
                </div>
              )}
              </div>
            </div>

            <div className="relative mt-[18px] shrink-0">
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                title="Settings"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 transition"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
              {showSettings && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setShowSettings(false);
                      setWorkspaceExpanded(false);
                    }}
                  />
                  <div className="absolute bottom-full right-0 z-50 mb-1.5 w-56 overflow-visible rounded-lg border border-white/10 bg-slate-900 py-1 shadow-xl">
                    <div className="px-2.5 pb-1 pt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      Settings
                    </div>
                    {memberships.length > 0 && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setWorkspaceExpanded((v) => !v)}
                          className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs font-medium transition ${
                            workspaceExpanded ? 'bg-white/5 text-slate-200' : 'text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <LayoutGrid className="h-3.5 w-3.5 text-slate-400" />
                            Workspace
                          </span>
                          <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />
                        </button>
                        {workspaceExpanded && (
                          <div className="absolute bottom-0 left-full z-50 ml-1 w-56 overflow-hidden rounded-lg border border-white/10 bg-slate-900 py-1 shadow-xl">
                            {memberships.map((m) => (
                              <button
                                key={m.organizationId}
                                type="button"
                                onClick={() => switchWorkspace(m.organizationId)}
                                disabled={switchingWorkspace !== null}
                                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-slate-300 hover:bg-white/5 transition disabled:opacity-60"
                              >
                                <span className="flex items-center gap-2 overflow-hidden">
                                  <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                  <span className="truncate">
                                    {switchingWorkspace === m.organizationId ? 'Switching…' : m.organizationName}
                                  </span>
                                </span>
                                {m.organizationId === activeOrg?.organizationId && (
                                  <Check className="h-3 w-3 shrink-0 text-indigo-400" />
                                )}
                              </button>
                            ))}
                            <Link
                              href="/onboarding"
                              onClick={() => {
                                setShowSettings(false);
                                setWorkspaceExpanded(false);
                              }}
                              className="flex items-center gap-2 border-t border-white/10 px-2.5 py-1.5 text-xs font-medium text-indigo-400 hover:bg-white/5 transition"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add workspace
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-1 border-t border-white/10 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowSettings(false);
                          setWorkspaceExpanded(false);
                          endSession();
                        }}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-red-400 hover:bg-red-500/10 hover:text-red-300 transition"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        End Session
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 pt-16 md:h-screen md:overflow-y-auto md:pt-0 no-scrollbar">
        <div className="mx-auto w-full max-w-7xl flex-1 animate-in fade-in duration-300">{children}</div>
      </main>

      {showTheme && <ThemeSelector onClose={() => setShowTheme(false)} />}

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden" />
      )}
    </div>
  );
}
