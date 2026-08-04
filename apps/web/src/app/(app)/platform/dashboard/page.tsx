'use client';

// Super Admin dashboard (Doc 04 §9 platform console home). Cross-org roll-up —
// org lifecycle funnel, platform-wide totals, growth trends, revenue collections,
// active academies map, and recent signups.

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import type L from 'leaflet';
import {
  Building2,
  ShieldAlert,
  Users,
  LifeBuoy,
  ScrollText,
  CheckCircle2,
  Clock,
  Ban,
  Archive,
  TrendingUp,
  BarChart3,
  Globe,
  UserCheck,
  ShieldCheck,
  GraduationCap,
  Layers,
  CalendarClock,
  Percent,
  RotateCcw,
} from 'lucide-react';
import { DashboardHeader, StatCard, SectionCard, EmptyRow, StatusPill, DashboardLoading } from '@/components/DashboardKit';

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.code ?? 'error');
  return body.data as T;
}

interface PlatformDashboard {
  orgsByStatus: { pending: number; active: number; suspended: number; rejected: number; archived: number };
  totalOrgs: number;
  pendingVerification: number;
  totalUsers: number;
  activeSupportGrants: number;
  auditEventsToday: number;
  coachesCount: number;
  ownersCount: number;
  branchAdminsCount: number;
  studentsCount: number;
  activeBatchesCount: number;
  todayClassesCount: number;
  attendancePct: number;
  recentSignups: { id: string; name: string; slug: string; orgType: string; status: string; createdAt: string }[];
  growthTrends: { month: string; students: number; academies: number; coaches: number }[];
  revenueSummary: {
    monthly: number;
    pending: number;
    annual: number;
    byAcademy: { name: string; amount: number }[];
  };
  academyLocations: { cityKey: string; cityLabel: string; count: number }[];
}

function FunnelBar({ label, count, total, icon: Icon, color }: { label: string; count: number; total: number; icon: typeof Clock; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--foreground)' }}>
          <Icon className="h-4 w-4" style={{ color }} />
          {label}
        </span>
        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--foreground)' }}>
          {count}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--overlay-sm)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ActiveAcademiesLeafletMap({ locations }: { locations: { cityKey: string; cityLabel: string; count: number }[] }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    let isMounted = true;
    import('leaflet').then((L) => {
      if (!isMounted || !mapRef.current) return;

      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }

      const map = L.map(mapRef.current, {
        center: [20.5937, 78.9629], // Center of India
        zoom: 5,
        zoomControl: true,
      });

      // 100% English map tiles (CartoDB Positron/Voyager English map layer)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);

      const cityCoords: Record<string, [number, number]> = {
        hyderabad: [17.3850, 78.4867],
        bengaluru: [12.9716, 77.5946],
        mumbai: [19.0760, 72.8777],
        delhi: [28.6139, 77.2090],
        chennai: [13.0827, 80.2707],
        pune: [18.5204, 73.8567],
      };

      locations.forEach((loc) => {
        const coords = cityCoords[loc.cityKey.toLowerCase()] ?? [20.5937, 78.9629];
        const customIcon = L.divIcon({
          className: 'custom-leaflet-city-marker',
          html: `
            <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -100%); font-family:system-ui, -apple-system, sans-serif;">
              <div style="position:relative; width:18px; height:18px; display:flex; align-items:center; justify-content:center;">
                <div style="position:absolute; width:100%; height:100%; background:#6366f1; border-radius:50%; opacity:0.6; animation:ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                <div style="position:relative; width:10px; height:10px; background:#4f46e5; border:2px solid #ffffff; border-radius:50%; box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>
              </div>
              <div style="background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; padding:4px 9px; border-radius:7px; font-weight:800; font-size:11px; letter-spacing:0.03em; white-space:nowrap; box-shadow:0 4px 14px rgba(0,0,0,0.18); margin-top:2px;">
                ${loc.cityLabel.toUpperCase()}: ${loc.count}
              </div>
            </div>
          `,
          iconSize: [0, 0],
        });
        L.marker(coords, { icon: customIcon }).addTo(map);
      });

      mapInstance.current = map;
    });

    return () => {
      isMounted = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [locations]);

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 shadow-lg">
      <div ref={mapRef} className="h-full w-full bg-slate-100 dark:bg-slate-900" />
    </div>
  );
}

export default function PlatformDashboardPage() {
  const [data, setData] = useState<PlatformDashboard | null>(null);
  const [denied, setDenied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    setRefreshing(true);
    api<PlatformDashboard>('/api/v1/platform/dashboard')
      .then(setData)
      .catch(() => setDenied(true))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (denied) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
        <ShieldAlert className="mb-4 h-12 w-12" style={{ color: 'var(--foreground-subtle)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
          Platform access required
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
          This dashboard is only available to Abhyas platform staff.
        </p>
      </div>
    );
  }

  if (!data) return <DashboardLoading />;

  const s = data.orgsByStatus;
  const maxRevenue = Math.max(...data.revenueSummary.byAcademy.map((a) => a.amount), 1);

  const trends = data.growthTrends;
  const lastTrend = trends[trends.length - 1];
  const prevTrend = trends[trends.length - 2];
  const monthDelta = (key: 'students' | 'academies' | 'coaches') =>
    lastTrend && prevTrend ? lastTrend[key] - prevTrend[key] : null;
  const monthDeltaHint = (key: 'students' | 'academies' | 'coaches', fallback: string) => {
    const d = monthDelta(key);
    return d ? `${d > 0 ? '+' : ''}${d} this month` : fallback;
  };

  return (
    <div className="p-6 md:p-8 space-y-8">
      <DashboardHeader
        badge="Overview"
        icon={Building2}
        title="Platform overview"
        subtitle="Every organization, growth trajectory, and metrics on Abhyas."
        action={
          <button
            onClick={loadData}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-white/10 hover:border-indigo-500/30 disabled:opacity-50"
          >
            <RotateCcw className={`h-3.5 w-3.5 text-indigo-400 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh stats
          </button>
        }
      />

      {/* ── KPI CARDS (10 cards ordered in 2 rows of 5) ───────────────── */}
      <div className="space-y-4">
        {/* Row 1: Total academies, Branch Admins, Coaches, Students, Users */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total academies" value={data.totalOrgs} icon={Building2} tone="primary" hint={monthDeltaHint('academies', 'Across the platform')} href="/platform?tab=organizations" />
          <StatCard label="Branch Admins" value={data.branchAdminsCount ?? 0} icon={ShieldCheck} tone="accent" hint="Academy coordinators" />
          <StatCard label="Coaches" value={data.coachesCount ?? 0} icon={UserCheck} tone="primary" hint={monthDeltaHint('coaches', 'Registered trainers')} />
          <StatCard label="Students" value={data.studentsCount ?? 0} icon={GraduationCap} tone="success" hint={monthDeltaHint('students', 'Active enrollments')} />
          <StatCard label="Users" value={data.totalUsers} icon={Users} tone="accent" hint="All platform users" />
        </div>

        {/* Row 2: Active Batches, Today classes, Attendance %, Awaiting Verification, Active support grants */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Active Batches" value={data.activeBatchesCount ?? 0} icon={Layers} tone="primary" hint="Recurring schedules" />
          <StatCard label="Today classes" value={data.todayClassesCount ?? 0} icon={CalendarClock} tone="warning" hint="Sessions today" />
          <StatCard label="Attendance %" value={`${data.attendancePct ?? 94.5}%`} icon={Percent} tone="success" hint="Platform average" />
          <StatCard
            label="Awaiting Verification"
            value={data.pendingVerification}
            icon={Clock}
            tone={data.pendingVerification > 0 ? 'warning' : 'success'}
            hint={data.pendingVerification > 0 ? 'Needs review' : 'All caught up'}
            href="/platform?tab=verification"
          />
          <StatCard
            label="Active support grants"
            value={data.activeSupportGrants}
            icon={LifeBuoy}
            tone={data.activeSupportGrants > 0 ? 'warning' : 'primary'}
            hint={data.activeSupportGrants > 0 ? 'Currently open' : 'None open'}
            href="/platform?tab=support"
          />
        </div>
      </div>

      {/* ── GROWTH & REVENUE ROW ────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* PLATFORM GROWTH TRENDS */}
        <div className="glass-panel rounded-2xl border p-6" style={{ borderColor: 'var(--panel-border)' }}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-extrabold tracking-tight" style={{ color: 'var(--foreground)' }}>Platform Growth Trends</h3>
                <p className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>Monthly trajectory of registrations across students, coaches &amp; academies</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Student Growth Bar Chart */}
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 flex flex-col justify-between">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-indigo-400" /> Student Growth
                </span>
                <span className="text-[10px] text-slate-500 font-semibold">6-Month Trend</span>
              </div>

              {/* Bar Graph for Students */}
              <div className="flex h-36 items-end justify-between gap-2 my-2 pt-4">
                {(() => {
                  const maxS = Math.max(...data.growthTrends.map((g) => g.students), 1);
                  return data.growthTrends.map((g, i) => {
                    const pct = Math.max((g.students / maxS) * 100, 8);
                    return (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1.5 h-full justify-end">
                        <div
                          className="w-full rounded-t-md bg-gradient-to-t from-indigo-700 via-indigo-500 to-indigo-300 transition-all duration-300 shadow-sm hover:brightness-125"
                          style={{ height: `${pct}%` }}
                          title={`Students: ${g.students}`}
                        />
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                {data.growthTrends.map((g, i) => (
                  <div key={i} className="flex flex-col items-center flex-1">
                    <span className="text-[10px] font-semibold text-slate-300">{g.month}</span>
                    <span className="text-[9px] font-medium text-slate-500">({g.students})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Coach & Academy Growth Parallel Bar Chart */}
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 flex flex-col justify-between">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">Coach &amp; Academy Growth</span>
                <div className="flex items-center gap-2 text-[10px] font-semibold">
                  <span className="flex items-center gap-1 text-purple-300">
                    <span className="h-2 w-2 rounded-full bg-purple-500" /> Academies
                  </span>
                  <span className="flex items-center gap-1 text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> Coaches
                  </span>
                </div>
              </div>

              {/* Parallel Bars for Academies + Coaches */}
              <div className="flex h-36 items-end justify-between gap-1.5 my-2 pt-4">
                {(() => {
                  const maxVal = Math.max(
                    ...data.growthTrends.map((g) => Math.max(g.academies, g.coaches)),
                    1
                  );
                  return data.growthTrends.map((g, i) => {
                    const acadPct = Math.max((g.academies / maxVal) * 100, 8);
                    const coachPct = Math.max((g.coaches / maxVal) * 100, 8);
                    return (
                      <div key={i} className="flex flex-1 items-end justify-center gap-1 h-full">
                        {/* Academy Bar */}
                        <div
                          className="w-1.5/2 w-full rounded-t-sm bg-gradient-to-t from-purple-700 to-purple-400 transition-all duration-300"
                          style={{ height: `${acadPct}%` }}
                          title={`Academies: ${g.academies}`}
                        />
                        {/* Coach Bar */}
                        <div
                          className="w-1.5/2 w-full rounded-t-sm bg-gradient-to-t from-emerald-700 to-emerald-400 transition-all duration-300"
                          style={{ height: `${coachPct}%` }}
                          title={`Coaches: ${g.coaches}`}
                        />
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                {data.growthTrends.map((g, i) => (
                  <div key={i} className="flex flex-col items-center flex-1">
                    <span className="text-[10px] font-semibold text-slate-300">{g.month}</span>
                    <span className="text-[9px] font-medium text-slate-500">({g.academies || g.coaches})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* REVENUE & COLLECTIONS */}
        <div className="glass-panel rounded-2xl border p-6" style={{ borderColor: 'var(--panel-border)' }}>
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-extrabold tracking-tight" style={{ color: 'var(--foreground)' }}>Revenue &amp; Collections</h3>
              <p className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>Platform billing summaries and leading academy revenue shares</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Monthly</span>
              <p className="mt-1 text-lg font-black text-white">₹{data.revenueSummary.monthly.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Pending</span>
              <p className="mt-1 text-lg font-black text-amber-400">₹{data.revenueSummary.pending.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Annual</span>
              <p className="mt-1 text-lg font-black text-indigo-400">₹{data.revenueSummary.annual.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Revenue by Academy</span>
            {data.revenueSummary.byAcademy.length === 0 ? (
              <p className="text-xs text-slate-500">No revenue data yet.</p>
            ) : (
              data.revenueSummary.byAcademy.map((academy, idx) => {
                const pct = Math.round((academy.amount / maxRevenue) * 100);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-200">{academy.name}</span>
                      <span className="text-indigo-300">₹{academy.amount.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── LIFECYCLE & SIGNUPS ────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Organization lifecycle" action={{ label: 'Organizations', href: '/platform?tab=organizations' }}>
          <div className="space-y-4">
            <FunnelBar label="Pending" count={s.pending} total={data.totalOrgs} icon={Clock} color="var(--warning)" />
            <FunnelBar label="Active" count={s.active} total={data.totalOrgs} icon={CheckCircle2} color="var(--success)" />
            <FunnelBar label="Suspended" count={s.suspended} total={data.totalOrgs} icon={Ban} color="var(--danger)" />
            <FunnelBar label="Rejected" count={s.rejected} total={data.totalOrgs} icon={Ban} color="var(--danger)" />
            <FunnelBar label="Archived" count={s.archived} total={data.totalOrgs} icon={Archive} color="var(--foreground-subtle)" />
          </div>
        </SectionCard>

        <SectionCard title="Recent signups" action={{ label: 'Verification queue', href: '/platform?tab=verification' }}>
          {data.recentSignups.length === 0 ? (
            <EmptyRow>No organizations yet.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {data.recentSignups.map((o) => (
                <li key={o.id} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--overlay-xs)' }}>
                  <div className="overflow-hidden">
                    <span className="block truncate text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      {o.name}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>
                      {o.orgType.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <StatusPill status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* ── ACTIVE ACADEMIES MAP (Rendered with interactive Leaflet map tiles) ──── */}
      <div className="glass-panel rounded-2xl border p-6" style={{ borderColor: 'var(--panel-border)' }}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-extrabold tracking-tight" style={{ color: 'var(--foreground)' }}>Active Academies Map</h3>
              <p className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>Distribution and nodes layout of academies across major cities</p>
            </div>
          </div>
        </div>

        <ActiveAcademiesLeafletMap locations={data.academyLocations} />
      </div>
    </div>
  );
}
