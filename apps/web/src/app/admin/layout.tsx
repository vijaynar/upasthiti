'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase';
import {
  BookOpen,
  Calendar,
  IndianRupee,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Palette,
  Settings,
  Shield,
  Sparkles,
  Sun,
  User,
  Users,
  UserCog,
  X,
  BarChart2,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Camera,
  Megaphone
} from 'lucide-react';
import ThemeSelector from './components/ThemeSelector';
import { useTheme } from '@/lib/theme';

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  available_roles: string[];
  tenants: {
    name: string;
    slug: string;
  };
  roles?: {
    role_permissions: Array<{
      permissions: {
        module: string;
        action: string;
      } | null;
    }>;
  } | null;
}

function ReportsSubmenuList({
  items,
  pathname,
  setSidebarOpen,
}: {
  items: Array<{ name: string; href: string }>;
  pathname: string;
  setSidebarOpen: (open: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'batch';

  return (
    <div className="pl-6 space-y-1 mt-1 animate-in slide-in-from-top-1 duration-150">
      {items.map((subItem) => {
        let active = false;
        if (subItem.href === '/admin/fines') {
          active = pathname === '/admin/fines';
        } else {
          const targetTab = subItem.href.split('tab=')[1] || 'batch';
          active = pathname === '/admin/reports' && activeTab === targetTab;
        }

        return (
          <Link
            key={subItem.name}
            href={subItem.href}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-4 h-9 rounded-lg text-[13px] font-medium transition-all duration-200 group
            ${active 
              ? 'text-indigo-400 font-bold bg-indigo-500/5' 
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-indigo-400 glow-indigo' : 'bg-slate-700 group-hover:bg-slate-500'}`} />
            {subItem.name}
          </Link>
        );
      })}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [coachStatus, setCoachStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const { mode, toggleMode } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createBrowserClient();
  const [reportsExpanded, setReportsExpanded] = useState(false);

  useEffect(() => {
    if (pathname === '/admin/fines' || pathname.startsWith('/admin/reports')) {
      setReportsExpanded(true);
    }
  }, [pathname]);

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push('/auth/login');
          return;
        }

        // Fetch user profile, joined tenant info, and permissions
        const { data: userProfile, error: dbError } = await supabase
          .from('users')
          .select(`
            id,
            email,
            first_name,
            last_name,
            role,
            available_roles,
            tenants(name, slug),
            roles(
              role_permissions(
                permissions(
                  module,
                  action
                )
              )
            )
          `)
          .eq('id', user.id)
          .single();

        if (dbError || !userProfile) {
          console.error('Error fetching admin profile:', dbError);
          router.push('/auth/login');
          return;
        }

        if (userProfile.role !== 'admin' && userProfile.role !== 'superadmin' && userProfile.role !== 'coach') {
          // If not admin/coach, eject to student dashboard
          router.push('/student/dashboard');
          return;
        }

        let status = null;
        if (userProfile.role === 'coach') {
          const { data: coachData } = await supabase
            .from('coaches')
            .select('account_status')
            .eq('id', user.id)
            .single();
          if (coachData) {
            status = coachData.account_status;
          }
        }
        setCoachStatus(status);
        setProfile(userProfile as unknown as UserProfile);
      } catch (err) {
        console.error('Failed to authenticate admin:', err);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  const handleSwitchRole = async (targetRole: string) => {
    try {
      const res = await fetch('/api/v1/users/switch-role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: targetRole }),
      });
      if (res.ok) {
        if (targetRole === 'student' || targetRole === 'parent') {
          window.location.href = '/student/dashboard';
        } else {
          window.location.href = '/admin/dashboard';
        }
      } else {
        console.error('Failed to switch role:', await res.text());
      }
    } catch (err) {
      console.error('Error switching role:', err);
    }
  };

  const isCoach = profile?.role === 'coach';
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
  const isCoachActive = !isCoach || coachStatus === 'Active';
  // A Paused coach keeps a valid session and should still see Dashboard and
  // Fines & Payments — only Attendance/Leaves/Announcements/Reports stay
  // blocked, same as any other non-Active status (isCoachActive below).
  const isCoachPaused = isCoach && coachStatus === 'Paused';

  const coachActions = isCoachActive ? [
    { name: 'Mark Attendance', href: '/admin/attendance', icon: Camera },
    { name: 'Upload Group Photo', href: '/admin/attendance/group-scan', icon: Camera },
  ] : [];

  const isFinesPath = pathname === '/admin/fines' || pathname.startsWith('/admin/fines/');

  const isBlockedPath = isCoach && coachStatus !== 'Active' && !(isCoachPaused && isFinesPath) && (
    pathname === '/admin/attendance' ||
    pathname.startsWith('/admin/attendance/') ||
    pathname === '/admin/leaves' ||
    pathname.startsWith('/admin/leaves/') ||
    pathname === '/admin/announcements' ||
    pathname.startsWith('/admin/announcements/') ||
    pathname === '/admin/reports' ||
    pathname.startsWith('/admin/reports/') ||
    isFinesPath
  );

  const hasPermission = (module: string, action: string) => {
    if (!profile) return false;
    if (profile.role === 'superadmin') {
      if (module === 'attendance' || module === 'payments' || module === 'reports') {
        return false;
      }
      return true;
    }
    const rolesObj: any = profile.roles;
    const rolePermissions = Array.isArray(rolesObj)
      ? rolesObj[0]?.role_permissions
      : rolesObj?.role_permissions;
    if (!rolePermissions) return false;
    return rolePermissions.some((rp: any) => {
      const p = rp.permissions;
      return p && p.module === module && p.action === action;
    });
  };

  const topItems = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    ...(!isCoach && hasPermission('attendance', 'view') ? [{ name: 'Attendance', href: '/admin/attendance', icon: FileText }] : []),
    ...(isCoach ? [{ name: 'My Profile', href: '/admin/profile', icon: User }] : []),
  ];

  const manageItems = [
    ...(hasPermission('batches', 'view') ? [{ name: 'Batches', href: '/admin/batches', icon: Calendar }] : []),
    ...(isAdmin && hasPermission('coaches', 'view') ? [{ name: 'Coaches', href: '/admin/coaches', icon: UserCog }] : []),
    ...(hasPermission('students', 'view') ? [{ name: 'Students', href: '/admin/students', icon: Users }] : []),
    ...(isCoach && isCoachActive ? [
      { name: 'Leaves', href: '/admin/leaves', icon: Calendar },
      { name: 'Announcements', href: '/admin/announcements', icon: Megaphone }
    ] : []),
  ];

  const reportsSubItems = [
    ...((isCoachActive || isCoachPaused) && hasPermission('payments', 'view') ? [{ name: 'Fines & Payments', href: '/admin/fines' }] : []),
    ...(isCoachActive && hasPermission('reports', 'view') ? [
      { name: 'Batch attendance', href: '/admin/reports?tab=batch' },
      { name: 'Coach Performance', href: '/admin/reports?tab=coach' },
      { name: 'Student Progress', href: '/admin/reports?tab=student' },
      { name: 'Fine collection', href: '/admin/reports?tab=collection' },
    ] : []),
  ];

  const isReportsActive = pathname === '/admin/fines' || pathname.startsWith('/admin/reports');

  const renderReportsMenu = () => {
    if (reportsSubItems.length === 0) return null;

    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setReportsExpanded(!reportsExpanded)}
          className={`w-full flex items-center justify-between px-4 h-10 rounded-xl text-sm font-medium transition-all duration-200 group
          ${isReportsActive 
            ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/20' 
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
        >
          <div className="flex items-center gap-3">
            <BarChart2 className={`w-4.5 h-4.5 transition-transform group-hover:scale-105 ${isReportsActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-indigo-400'}`} />
            <span>Reports</span>
          </div>
          {reportsExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
          )}
        </button>

        {reportsExpanded && (
          <Suspense fallback={<div className="pl-6 text-xs text-slate-500 py-1">Loading...</div>}>
            <ReportsSubmenuList
              items={reportsSubItems}
              pathname={pathname}
              setSidebarOpen={setSidebarOpen}
            />
          </Suspense>
        )}
      </div>
    );
  };

  const adminItems = [
    ...(profile?.role === 'superadmin' ? [{ name: 'Academies', href: '/admin/superadmin', icon: ShieldAlert }] : []),
    ...(isAdmin && hasPermission('roles', 'manage') ? [{ name: 'Roles & Permissions', href: '/admin/governance/roles', icon: Shield }] : []),
    ...(isAdmin && hasPermission('users', 'view') ? [{ name: 'User Directory', href: '/admin/governance/users', icon: Users }] : []),
    ...(isAdmin ? [{ name: 'Leave Approvals', href: '/admin/leaves/approvals', icon: Calendar }] : []),
    ...(isAdmin && hasPermission('audit_logs', 'view') ? [{ name: 'Audit Logs', href: '/admin/governance/audit-logs', icon: History }] : []),
    ...(isAdmin && hasPermission('settings', 'manage')
      ? [{
          name: profile?.role === 'superadmin' ? 'Global Settings' : 'Academy Settings',
          href: '/admin/settings',
          icon: Settings
        }]
      : []),
  ];

  const renderNavItem = (item: { name: string; href: string; icon: any }) => {
    const Icon = item.icon;
    const active = pathname === item.href;
    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center gap-3 px-4 h-10 rounded-xl text-sm font-medium transition-all duration-200 group
        ${active 
          ? 'bg-indigo-600 text-white font-semibold glow-indigo border border-indigo-500/30' 
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
      >
        <Icon className={`w-4.5 h-4.5 transition-transform group-hover:scale-105 ${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'}`} />
        {item.name}
      </Link>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative" style={{ backgroundColor: 'var(--background)' }}>
        <div className="radial-mesh-bg" />
        <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin glow-indigo" />
        <p className="text-slate-400 text-xs font-semibold tracking-widest mt-4 uppercase">
          Securing Workspace...
        </p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen flex relative" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Background Animated Blobs */}
      <div className="radial-mesh-bg" />
      <div className="absolute top-10 left-10 w-96 h-96 rounded-full bg-indigo-600/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-purple-600/5 blur-3xl pointer-events-none" />

      {/* ── Mobile Header Drawer Toggle ── */}
      <header className="md:hidden w-full h-16 flex items-center justify-between px-4 border-b border-white/10 glass-panel fixed top-0 left-0 z-40">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="Abhyas" className="h-7 w-auto object-contain" />
          <span className="text-sm font-black tracking-widest text-indigo-400">ABHYAS</span>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
        >
          <Menu className="w-5 h-5 text-slate-200" />
        </button>
      </header>

      {/* ── Collapsible / Overlay Sidebar for Mobile & Desktop ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 glass-panel border-r border-white/10 flex flex-col transition-transform duration-300 transform 
        md:translate-x-0 md:static md:h-screen
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 relative">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Abhyas" className="h-8 w-auto object-contain flex-shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="font-extrabold text-base tracking-wider bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">
                ABHYAS
              </span>
              <span className="text-[9px] text-slate-500 font-medium tracking-widest uppercase">Operating System for Coaching &amp; Learning</span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 rounded-md text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Tenant Workspace Profile */}
        <div className="p-4 mx-4 mt-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <h4 className="text-xs font-bold text-slate-300 truncate tracking-wide">
              {profile.role === 'superadmin' ? 'Abhyas Platform' : profile.tenants.name}
            </h4>
            <p className="text-[10px] text-slate-500 truncate">
              {profile.role === 'superadmin' ? 'platform.abhyas.app' : `${profile.tenants.slug}.abhyas.app`}
            </p>
          </div>
        </div>

        {/* Sidebar Menu Links */}
        <nav className="flex-1 px-4 py-6 space-y-4 overflow-y-auto no-scrollbar">
          {/* Section 1: Dashboard */}
          <div className="space-y-1">
            {topItems.map((item) => renderNavItem(item))}
          </div>
          {/* Section 1.5: Coach Actions */}
          {isCoach && (
            <div>
              <div className="h-px bg-white/10 my-3" />
              <div className="space-y-1">
                <span className="px-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block mb-2">
                  Actions
                </span>
                {coachActions.map((item) => renderNavItem(item))}
              </div>
            </div>
          )}
          {/* Section 2: Manage */}
          {manageItems.length > 0 && (
            <div>
              <div className="h-px bg-white/10 my-3" />
              <div className="space-y-1">
                <span className="px-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block mb-2">
                  Manage
                </span>
                {manageItems.map((item) => renderNavItem(item))}
              </div>
            </div>
          )}

          {/* Section 3: Reports */}
          {reportsSubItems.length > 0 && (
            <div>
              <div className="h-px bg-white/10 my-3" />
              <div className="space-y-1">
                <span className="px-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block mb-2">
                  Reports & Analytics
                </span>
                {renderReportsMenu()}
              </div>
            </div>
          )}

          {/* Section 4: Administration */}
          {adminItems.length > 0 && (
            <div>
              <div className="h-px bg-white/10 my-3" />
              <div className="space-y-1">
                <span className="px-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block mb-2">
                  Administration
                </span>
                {adminItems.map((item) => renderNavItem(item))}
              </div>
            </div>
          )}
        </nav>

        {/* Sidebar Bottom Profile & Logout Footer */}
        <div className="p-4 border-t border-white/10 space-y-3">
          {/* Theme + Mode quick controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTheme(!showTheme)}
              title="Change theme"
              className="flex-1 flex items-center gap-2 h-9 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-all"
            >
              <Palette className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
              Themes
            </button>
            <button
              onClick={toggleMode}
              title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-all flex-shrink-0"
            >
              {mode === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-indigo-400">
              <User className="w-5 h-5" />
            </div>
            <div className="overflow-hidden">
              <h5 className="text-xs font-bold text-slate-200 truncate">
                {profile.first_name} {profile.last_name}
              </h5>
              {profile.available_roles && profile.available_roles.length > 1 ? (
                <div className="mt-1">
                  <select
                    value={profile.role}
                    onChange={(e) => handleSwitchRole(e.target.value)}
                    className="role-switcher-select border border-indigo-500/30 text-[10px] font-extrabold rounded-lg px-2 py-0.5 uppercase tracking-wider outline-none cursor-pointer transition-colors duration-200"
                  >
                    {profile.available_roles.map((r) => (
                      <option key={r} value={r}>
                        {r === 'superadmin' ? 'Super Admin' : r}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wide uppercase bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 mt-0.5">
                  {profile.role}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full h-10 rounded-xl border border-red-500/10 hover:border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 font-semibold text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            {profile.role === 'coach' 
              ? 'End Coach Session' 
              : profile.role === 'superadmin' 
              ? 'End Super Admin Session' 
              : 'End Admin Session'}
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-1 flex flex-col md:h-screen md:overflow-y-auto no-scrollbar pt-16 md:pt-0">
        <div className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-300">
          {isBlockedPath ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="max-w-md w-full glass-panel p-8 rounded-3xl text-center border border-rose-500/20 shadow-lg shadow-rose-500/5">
                <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto mb-5 animate-pulse">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-black text-white tracking-tight mb-2">Access Restricted</h2>
                <p className="text-xs text-slate-400 leading-relaxed mb-6">
                  Your coach profile status is currently <span className="text-rose-400 font-bold">"{coachStatus || 'Pending'}"</span>. 
                  Access to attendance, leaves, announcements, and reports is disabled until your account is activated by an administrator.
                </p>
                <button
                  onClick={() => router.push('/admin/dashboard')}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  Go back to Dashboard
                </button>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </main>

      {/* Theme Selector Panel */}
      {showTheme && <ThemeSelector onClose={() => setShowTheme(false)} />}

      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
        />
      )}
    </div>
  );
}
