'use client';

// Global app shell for every authenticated V2 surface (/platform, /people,
// /scheduling, /attendance, /finance, /notifications, /marketplace,
// /family, /workspace, /me/*) — before this, each of those routes rendered
// bare (no logo, no workspace context, no theme control, no way to sign
// out) because V2 never got its own version of V1's admin sidebar
// (apps/web/src/app/admin/layout.tsx, still on V1's Supabase-direct-client
// auth and schema, out of scope to extend further). This is that sidebar,
// rebuilt on V2's real session (cookie JWT via /api/v1/me, not
// supabase.auth) and mounted once per route tree via a thin layout.tsx.
//
// Nav is intentionally coarse (no per-permission item hiding) — every V2
// page already does its own access check server-side (see /platform's
// accessDenied state) and 403s gracefully, so a shown-but-inapplicable nav
// link costs nothing. Building a full RBAC-aware nav tree is real scope,
// not a chrome fix.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  LayoutGrid,
  Gauge,
  Users,
  CalendarClock,
  ScanFace,
  Wallet,
  Bell,
  Store,
  ShieldCheck,
  UserCog,
  Briefcase,
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
} from 'lucide-react';
import ThemeSelector from '@/app/admin/components/ThemeSelector';
import { useTheme } from '@/lib/theme';

interface Membership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
}

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

const ORG_NAV = [
  { label: 'People', href: '/people', icon: Users },
  { label: 'Scheduling', href: '/scheduling', icon: CalendarClock },
  { label: 'Attendance', href: '/attendance', icon: ScanFace },
  { label: 'Progress', href: '/progress', icon: TrendingUp },
  { label: 'Finance', href: '/finance', icon: Wallet },
  { label: 'Staff HR', href: '/staff', icon: UserCog },
  { label: 'Marketplace', href: '/marketplace', icon: Store },
  { label: 'Notifications', href: '/notifications', icon: Bell },
];

const ME_NAV = [
  { label: 'My Profile', href: '/me/profile', icon: UserCog },
  { label: 'Family', href: '/family', icon: UserRound },
  { label: 'My progress', href: '/me/progress', icon: TrendingUp },
  { label: 'My HR', href: '/me/staff', icon: Briefcase },
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
    <div className="mt-1 space-y-1 pl-6">
      {PLATFORM_TABS.map(({ key, label }) => {
        const active = pathname === '/platform' && activeTab === key;
        return (
          <Link
            key={key}
            href={`/platform?tab=${key}`}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-4 h-9 text-[13px] font-medium transition-all duration-200 group ${
              active ? 'bg-indigo-500/5 font-bold text-indigo-400' : 'text-slate-500 hover:bg-white/[0.02] hover:text-slate-300'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-indigo-400' : 'bg-slate-700 group-hover:bg-slate-500'}`} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [orgRoleKeys, setOrgRoleKeys] = useState<string[]>([]);
  const [platformRoles, setPlatformRoles] = useState<string[]>([]);
  const [activeOrg, setActiveOrg] = useState<Membership | null | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [platformExpanded, setPlatformExpanded] = useState(false);
  const { mode, toggleMode } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith('/platform')) setPlatformExpanded(true);
  }, [pathname]);

  useEffect(() => {
    // Not the shared api() helper: that swallows status codes, and a 401
    // here specifically means middleware's silent refresh (middleware.ts)
    // already tried and failed — the refresh token itself is gone too, a
    // real logout, not a transient blip. Every page under this shell reads
    // its own identity/workspace data independently and has no way to tell
    // "still loading" apart from "will never load" (see middleware.ts's
    // header) — this redirect is what actually resolves that for the
    // shell's own name/role/avatar fetch instead of leaving it on "…"
    // forever.
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
    Promise.all([
      api<{ activeOrgId: string | null }>('/api/v1/me/workspace'),
      api<Membership[]>('/api/v1/orgs'),
    ]).then(([w, orgs]) => {
      const org = w?.activeOrgId ? orgs?.find((o) => o.organizationId === w.activeOrgId) ?? null : null;
      setActiveOrg(org);
      // The sidebar badge used to hardcode "Coach" vs "Member" based only on
      // whether a coach_profile existed — "Member" isn't a real role (the
      // system's actual org roles are owner/org_admin/branch_admin/coach/
      // assistant_coach/front_desk/accountant/student, migration 0006), so
      // an Owner or Org Admin with no coach profile was shown as "Member"
      // regardless of their real, much broader access. Read the caller's
      // actual role key(s) for this org instead.
      if (org) {
        api<{ roleKeys: string[] }>(`/api/v1/orgs/${org.organizationId}/me/roles`)
          .then((r) => setOrgRoleKeys(r?.roleKeys ?? []))
          .catch(() => setOrgRoleKeys([]));
      }
    });
  }, []);

  async function endSession() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.push('/auth/login');
    router.refresh();
  }

  const isPlatformStaff = platformRoles.length > 0;

  function navItem(item: { label: string; href: string; icon: typeof Users }) {
    const Icon = item.icon;
    const active = pathname === item.href || pathname.startsWith(item.href + '/');
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center gap-3 rounded-xl px-4 h-10 text-sm font-medium transition-all duration-200 group ${
          active
            ? 'bg-indigo-600 text-white font-semibold border border-indigo-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <Icon className={`h-4.5 w-4.5 ${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'}`} />
        {item.label}
      </Link>
    );
  }

  return (
    <div className="relative flex min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <div className="radial-mesh-bg" />

      {/* ── Mobile header ── */}
      <header className="glass-panel fixed left-0 top-0 z-40 flex h-16 w-full items-center justify-between border-b border-white/10 px-4 md:hidden">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Abhyas" className="h-7 w-auto object-contain" />
          <span className="text-sm font-black tracking-widest text-indigo-400">ABHYAS</span>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-lg border border-white/10 bg-white/5 p-1.5 hover:bg-white/10"
        >
          <Menu className="h-5 w-5 text-slate-200" />
        </button>
      </header>

      {/* ── Sidebar ── */}
      <aside
        className={`glass-panel fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full transform flex-col border-r border-white/10 transition-transform duration-300 md:static md:h-screen md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : ''
        }`}
      >
        {/* Brand header */}
        <div className="relative flex h-16 items-center justify-between border-b border-white/10 px-6">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Abhyas" className="h-8 w-auto shrink-0 object-contain" />
            <div className="flex flex-col leading-tight">
              <span className="bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-base font-extrabold tracking-wider text-transparent">
                ABHYAS
              </span>
              <span className="text-[9px] font-medium uppercase tracking-widest text-slate-500">
                Operating system for coaching &amp; learning
              </span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="rounded-md p-1 text-slate-400 hover:text-white md:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Active workspace card */}
        <Link
          href="/workspace"
          className="mx-4 mt-4 flex items-center gap-3 rounded-2xl border border-indigo-500/10 bg-indigo-950/20 p-4 hover:border-indigo-500/25"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="overflow-hidden">
            <h4 className="truncate text-xs font-bold tracking-wide text-slate-300">
              {isPlatformStaff ? 'Abhyas Platform' : activeOrg ? activeOrg.organizationName : 'No workspace selected'}
            </h4>
            <p className="truncate text-[10px] text-slate-500">
              {isPlatformStaff ? 'platform.abhyas.app' : activeOrg ? `${activeOrg.organizationSlug}.abhyas.app` : 'Choose a workspace →'}
            </p>
          </div>
        </Link>

        {/* Nav */}
        <nav className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-6">
          <div className="space-y-1">
            {activeOrg && navItem({ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard })}
            {navItem({ label: 'Workspace', href: '/workspace', icon: LayoutGrid })}
          </div>

          {activeOrg && (
            <div>
              <div className="my-3 h-px bg-white/10" />
              <span className="mb-2 block px-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Manage</span>
              <div className="space-y-1">{ORG_NAV.map(navItem)}</div>
            </div>
          )}

          {isPlatformStaff && (
            <div>
              <div className="my-3 h-px bg-white/10" />
              <span className="mb-2 block px-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Administration</span>
              <div className="space-y-1">
                {navItem({ label: 'Dashboard', href: '/platform/dashboard', icon: Gauge })}
                <button
                  type="button"
                  onClick={() => setPlatformExpanded(!platformExpanded)}
                  className={`group flex h-10 w-full items-center justify-between rounded-xl px-4 text-sm font-medium transition-all duration-200 ${
                    pathname === '/platform'
                      ? 'border border-indigo-500/20 bg-indigo-600/15 text-indigo-300'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ShieldCheck
                      className={`h-4.5 w-4.5 ${pathname === '/platform' ? 'text-indigo-400' : 'text-slate-400 group-hover:text-indigo-400'}`}
                    />
                    Platform console
                  </div>
                  {platformExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300" />
                  )}
                </button>
                {platformExpanded && (
                  <Suspense fallback={<div className="py-1 pl-6 text-xs text-slate-500">Loading…</div>}>
                    <PlatformSubmenuList pathname={pathname} setSidebarOpen={setSidebarOpen} />
                  </Suspense>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="my-3 h-px bg-white/10" />
            <span className="mb-2 block px-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Me</span>
            <div className="space-y-1">{ME_NAV.map(navItem)}</div>
          </div>
        </nav>

        {/* Footer: theme + user + end session */}
        <div className="space-y-3 border-t border-white/10 p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTheme(!showTheme)}
              title="Change theme"
              className="flex h-9 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-400 hover:bg-white/10 hover:text-slate-200"
            >
              <Palette className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
              Themes
            </button>
            <button
              onClick={toggleMode}
              title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            >
              {mode === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800 text-indigo-400">
              {avatarPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPath} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
              ) : (
                <UserRound className="h-5 w-5" />
              )}
            </div>
            <div className="overflow-hidden">
              <h5 className="truncate text-xs font-bold text-slate-200">{displayName ?? '…'}</h5>
              <span className="mt-0.5 inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-indigo-300">
                {isPlatformStaff
                  ? platformRoles.join(', ').replace(/_/g, ' ')
                  : activeOrg
                    ? orgRoleKeys.map((k) => ORG_ROLE_LABELS[k] ?? k).join(', ') || '…'
                    : 'No workspace'}
              </span>
            </div>
          </div>

          <button
            onClick={endSession}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-500/10 bg-red-500/5 text-xs font-semibold text-red-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5" /> End Session
          </button>
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
