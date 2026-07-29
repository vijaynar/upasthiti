'use client';

// Role-aware org home screen (Doc 01 PRD role dashboards, Doc 05 §7 post-login
// landing). Resolves the caller's own role in the active workspace and renders
// the Owner/Admin dashboard or the Coach dashboard accordingly. If the caller
// holds both a management role and a coaching role, a small switcher lets them
// flip between the two views. Plain-fetch client component, same style as
// /people, /scheduling, /progress.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  GraduationCap,
  CalendarClock,
  Wallet,
  UserPlus,
  Sparkles,
  ClipboardCheck,
  TrendingUp,
  ListChecks,
  Store,
  LayoutGrid,
} from 'lucide-react';
import {
  DashboardHeader,
  StatCard,
  SectionCard,
  EmptyRow,
  StatusPill,
  DashboardLoading,
  fmtTime,
  fmtMoney,
} from '@/components/DashboardKit';

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface DashboardSession {
  sessionId: string;
  batchName: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface OwnerDashboard {
  currency: string;
  memberCount: number;
  activeStudents: number;
  activeBatches: number;
  sessionsToday: number;
  pendingJoinRequests: number;
  newLeads: number;
  pendingPayments: number;
  outstandingMinor: number;
  collectedThisMonthMinor: number;
  todaysSessions: DashboardSession[];
  recentEnrollments: { enrollmentId: string; displayName: string | null; rollNumber: string | null; status: string; startedOn: string }[];
}

interface CoachDashboard {
  assignedBatches: number;
  sessionsToday: number;
  rosterCount: number;
  pendingReviews: number;
  progressLoggedThisMonth: number;
  todaysSessions: DashboardSession[];
  myBatches: { batchId: string; name: string; rosterCount: number; nextSessionAt: string | null }[];
}

const MGMT_ROLES = ['owner', 'org_admin', 'branch_admin', 'front_desk'];
const COACH_ROLES = ['coach', 'assistant_coach'];

function TodaySchedule({ sessions }: { sessions: DashboardSession[] }) {
  if (sessions.length === 0) return <EmptyRow>No sessions scheduled today.</EmptyRow>;
  return (
    <ul className="space-y-2">
      {sessions.map((s) => (
        <li
          key={s.sessionId}
          className="flex items-center justify-between rounded-xl px-3 py-2.5"
          style={{ backgroundColor: 'var(--overlay-xs)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--primary)' }}>
              {fmtTime(s.startsAt)}
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              {s.batchName}
            </span>
          </div>
          <StatusPill status={s.status} />
        </li>
      ))}
    </ul>
  );
}

function OwnerView({ orgId }: { orgId: string }) {
  const [data, setData] = useState<OwnerDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OwnerDashboard>(`/api/v1/orgs/${orgId}/dashboard/owner`).then(setData).catch((e) => setError(e.message));
  }, [orgId]);

  if (error) return <div className="mx-6 rounded-lg border p-4 text-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-glow)' }}>{error}</div>;
  if (!data) return <DashboardLoading />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active students" value={data.activeStudents} icon={GraduationCap} tone="primary" href="/people" />
        <StatCard label="Active batches" value={data.activeBatches} icon={CalendarClock} tone="accent" href="/scheduling" />
        <StatCard label="Team members" value={data.memberCount} icon={Users} tone="primary" href="/people" />
        <StatCard label="Sessions today" value={data.sessionsToday} icon={ListChecks} tone="success" href="/scheduling" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Outstanding fees"
          value={fmtMoney(data.outstandingMinor, data.currency)}
          icon={Wallet}
          tone={data.outstandingMinor > 0 ? 'warning' : 'success'}
          href="/finance"
        />
        <StatCard
          label="Collected this month"
          value={fmtMoney(data.collectedThisMonthMinor, data.currency)}
          icon={TrendingUp}
          tone="success"
          href="/finance"
        />
        <StatCard label="Payment proofs" value={data.pendingPayments} icon={ClipboardCheck} tone={data.pendingPayments > 0 ? 'warning' : 'primary'} hint="Awaiting verification" href="/finance" />
        <StatCard label="New leads" value={data.newLeads} icon={Store} tone={data.newLeads > 0 ? 'accent' : 'primary'} href="/marketplace" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Today's sessions" action={{ label: 'Scheduling', href: '/scheduling' }}>
          <TodaySchedule sessions={data.todaysSessions} />
        </SectionCard>

        <SectionCard title="Recent enrollments" action={{ label: 'People', href: '/people' }}>
          {data.recentEnrollments.length === 0 ? (
            <EmptyRow>No enrollments yet.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {data.recentEnrollments.map((e) => (
                <li key={e.enrollmentId} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--overlay-xs)' }}>
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      {e.displayName ?? 'Student'}
                    </span>
                    {e.rollNumber && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--foreground-subtle)' }}>
                        #{e.rollNumber}
                      </span>
                    )}
                  </div>
                  <StatusPill status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {data.pendingJoinRequests > 0 && (
        <SectionCard title="Needs your attention">
          <Link href="/people" className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--warning-glow)' }}>
            <UserPlus className="h-5 w-5" style={{ color: 'var(--warning)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              {data.pendingJoinRequests} pending join request{data.pendingJoinRequests === 1 ? '' : 's'} to review
            </span>
          </Link>
        </SectionCard>
      )}
    </div>
  );
}

function CoachView({ orgId }: { orgId: string }) {
  const [data, setData] = useState<CoachDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CoachDashboard>(`/api/v1/orgs/${orgId}/dashboard/coach`).then(setData).catch((e) => setError(e.message));
  }, [orgId]);

  if (error) return <div className="mx-6 rounded-lg border p-4 text-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-glow)' }}>{error}</div>;
  if (!data) return <DashboardLoading />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="My batches" value={data.assignedBatches} icon={CalendarClock} tone="primary" href="/scheduling" />
        <StatCard label="Sessions today" value={data.sessionsToday} icon={ListChecks} tone="success" href="/scheduling" />
        <StatCard label="Athletes coached" value={data.rosterCount} icon={GraduationCap} tone="accent" href="/progress" />
        <StatCard
          label="Attendance reviews"
          value={data.pendingReviews}
          icon={ClipboardCheck}
          tone={data.pendingReviews > 0 ? 'warning' : 'primary'}
          hint="Awaiting your review"
          href="/attendance"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Today's sessions" action={{ label: 'Attendance', href: '/attendance' }}>
          <TodaySchedule sessions={data.todaysSessions} />
        </SectionCard>

        <SectionCard title="My batches" action={{ label: 'Log progress', href: '/progress' }}>
          {data.myBatches.length === 0 ? (
            <EmptyRow>You have no assigned batches yet.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {data.myBatches.map((b) => (
                <li key={b.batchId} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--overlay-xs)' }}>
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      {b.name}
                    </span>
                    <span className="ml-2 text-xs" style={{ color: 'var(--foreground-subtle)' }}>
                      {b.rosterCount} athlete{b.rosterCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                    {b.nextSessionAt ? `Next ${fmtTime(b.nextSessionAt)}` : 'No upcoming'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="This month">
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--overlay-xs)' }}>
          <Sparkles className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          <span className="text-sm" style={{ color: 'var(--foreground)' }}>
            <strong>{data.progressLoggedThisMonth}</strong> progress {data.progressLoggedThisMonth === 1 ? 'entry' : 'entries'} logged this month
          </span>
        </div>
      </SectionCard>
    </div>
  );
}

export default function DashboardPage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [view, setView] = useState<'owner' | 'coach' | null>(null);

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace')
      .then((w) => setOrgId(w.activeOrgId))
      .catch(() => setOrgId(null));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    api<{ roleKeys: string[] }>(`/api/v1/orgs/${orgId}/me/roles`)
      .then((r) => setRoles(r.roleKeys))
      .catch(() => setRoles([]));
  }, [orgId]);

  const { isMgmt, isCoach } = useMemo(() => {
    const r = roles ?? [];
    return {
      isMgmt: r.some((k) => MGMT_ROLES.includes(k)),
      isCoach: r.some((k) => COACH_ROLES.includes(k)),
    };
  }, [roles]);

  useEffect(() => {
    if (roles === null) return;
    setView(isMgmt ? 'owner' : isCoach ? 'coach' : null);
  }, [roles, isMgmt, isCoach]);

  if (orgId === undefined) return <DashboardLoading />;

  if (!orgId) {
    return (
      <div className="p-8">
        <DashboardHeader title="Dashboard" subtitle="Select a workspace to see its dashboard." />
        <Link href="/workspace" className="btn-premium inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">
          <LayoutGrid className="h-4 w-4" /> Choose a workspace
        </Link>
      </div>
    );
  }

  if (roles === null || view === null) {
    if (roles !== null && !isMgmt && !isCoach) {
      // A member with no management/coaching role — point them at their own surfaces.
      return (
        <div className="p-8">
          <DashboardHeader title="Welcome" subtitle="Here's where to find what matters to you." />
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="My schedule" value="View" icon={CalendarClock} tone="primary" href="/me/progress" />
            <StatCard label="My progress" value="View" icon={TrendingUp} tone="accent" href="/me/progress" />
            <StatCard label="Family" value="Manage" icon={Users} tone="success" href="/family" />
          </div>
        </div>
      );
    }
    return <DashboardLoading />;
  }

  const subtitle =
    view === 'owner' ? 'Your academy at a glance for today.' : 'Your batches and athletes for today.';

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>
            Dashboard
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
            {subtitle}
          </p>
        </div>
        {isMgmt && isCoach && (
          <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: 'var(--overlay-sm)' }}>
            {(['owner', 'coach'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all"
                style={
                  view === v
                    ? { backgroundColor: 'var(--primary)', color: '#fff' }
                    : { color: 'var(--foreground-muted)' }
                }
              >
                {v === 'owner' ? 'Management' : 'Coaching'}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'owner' ? <OwnerView orgId={orgId} /> : <CoachView orgId={orgId} />}
    </div>
  );
}
