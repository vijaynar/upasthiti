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
  Flame,
  ScanFace,
  Trophy,
  Award,
} from 'lucide-react';
import { getSportBadge } from '@/lib/sport-badges';
import {
  DashboardHeader,
  StatCard,
  SectionCard,
  EmptyRow,
  StatusPill,
  DashboardLoading,
  ProgressRing,
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
  organizationName?: string;
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

interface BatchProgress {
  tracked: boolean;
  metricLabel: string | null;
  unit: string | null;
  targetValue: number | null;
  latestValue: number | null;
  pct: number | null;
}

interface BatchSummary {
  batchId: string;
  batchName: string;
  enrollmentStatus: 'active' | 'left';
  organizationId: string;
  organizationName: string;
  programName: string | null;
  mode: string;
  coachName: string | null;
  attendancePct: number | null;
  nextSessionAt: string | null;
  progress: BatchProgress;
}

interface StudentAnnouncement {
  id: string;
  title: string;
  body: string;
  tag: string;
  publishedAt: string | null;
  organizationName: string;
}

interface StudentDashboard {
  currency: string;
  activeBatchesCount: number;
  activeOrgsCount: number;
  activeCoachesCount: number;
  attendancePct: number | null;
  attendanceTrendDelta: number | null;
  streakDays: number;
  upcomingPaymentsMinor: number;
  upcomingPaymentsCount: number;
  pendingApprovalsCount: number;
  todaysSessions: DashboardSession[];
  announcements: StudentAnnouncement[];
}

function TodaySchedule({ sessions }: { sessions: DashboardSession[] }) {
  if (sessions.length === 0) return <EmptyRow>No sessions scheduled today.</EmptyRow>;
  return (
    <ul className="space-y-2.5">
      {sessions.map((s) => {
        const badge = getSportBadge(s.batchName);
        const BadgeIcon = badge.icon;
        return (
          <li
            key={s.sessionId}
            className="flex items-center justify-between rounded-2xl border p-3.5 transition-all"
            style={{ backgroundColor: 'var(--overlay-xs)', borderColor: 'var(--panel-border)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                style={{ backgroundColor: badge.bgColor, borderColor: badge.borderColor, color: badge.color }}
              >
                <BadgeIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                  {s.batchName}
                </p>
                <p className="truncate text-xs" style={{ color: 'var(--foreground-muted)' }}>
                  {s.organizationName ?? 'Academy'}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--primary)' }}>
                {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}
              </span>
            </div>
          </li>
        );
      })}
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
        <StatCard
          label="Active students"
          value={data.activeStudents}
          icon={GraduationCap}
          tone="primary"
          hint={data.pendingJoinRequests > 0 ? `${data.pendingJoinRequests} new request${data.pendingJoinRequests === 1 ? '' : 's'}` : 'Across all batches'}
          href="/people"
        />
        <StatCard label="Active batches" value={data.activeBatches} icon={CalendarClock} tone="accent" hint="Recurring schedules" href="/scheduling" />
        <StatCard label="Team members" value={data.memberCount} icon={Users} tone="primary" hint="Coaches & staff" href="/people" />
        <StatCard label="Sessions today" value={data.sessionsToday} icon={ListChecks} tone="success" hint="Scheduled today" href="/scheduling" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Outstanding fees"
          value={fmtMoney(data.outstandingMinor, data.currency)}
          icon={Wallet}
          tone={data.outstandingMinor > 0 ? 'warning' : 'success'}
          hint="Pending collection"
          href="/finance"
        />
        <StatCard
          label="Collected this month"
          value={fmtMoney(data.collectedThisMonthMinor, data.currency)}
          icon={TrendingUp}
          tone="success"
          hint="This month"
          href="/finance"
        />
        <StatCard label="Payment proofs" value={data.pendingPayments} icon={ClipboardCheck} tone={data.pendingPayments > 0 ? 'warning' : 'primary'} hint="Awaiting verification" href="/finance" />
        <StatCard label="New leads" value={data.newLeads} icon={Store} tone={data.newLeads > 0 ? 'accent' : 'primary'} hint="From marketplace" href="/marketplace" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Today's sessions" action={{ label: 'Scheduling', href: '/scheduling' }}>
          <TodaySchedule sessions={data.todaysSessions} />
        </SectionCard>

        <SectionCard title="Recent enrollments" action={{ label: 'Students', href: '/people' }}>
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
        <StatCard label="My batches" value={data.assignedBatches} icon={CalendarClock} tone="primary" hint="Assigned to you" href="/scheduling" />
        <StatCard label="Sessions today" value={data.sessionsToday} icon={ListChecks} tone="success" hint="Scheduled today" href="/scheduling" />
        <StatCard label="Athletes coached" value={data.rosterCount} icon={GraduationCap} tone="accent" hint="Across your batches" href="/progress" />
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

function StudentBatchCard({ batch }: { batch: BatchSummary }) {
  const badge = getSportBadge(batch.batchName);
  const BadgeIcon = badge.icon;
  return (
    <Link
      href={`/me/batches/${batch.batchId}`}
      className="glass-panel glass-panel-hover flex flex-col justify-between rounded-2xl border p-4.5 transition-all duration-200"
      style={{ borderColor: 'var(--panel-border)' }}
    >
      <div>
        <div className="flex items-start gap-3 mb-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
            style={{ backgroundColor: badge.bgColor, borderColor: badge.borderColor, color: badge.color }}
          >
            <BadgeIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-bold" style={{ color: 'var(--foreground)' }}>
              {batch.batchName}
            </h4>
            <p className="truncate text-xs" style={{ color: 'var(--foreground-muted)' }}>
              {batch.organizationName}
            </p>
            <p className="truncate text-xs" style={{ color: 'var(--foreground-subtle)' }}>
              {batch.coachName ? `Coach ${batch.coachName}` : 'No coach'}
            </p>
          </div>
        </div>

        <div className="my-3 flex items-center justify-between gap-3 rounded-xl p-3" style={{ backgroundColor: 'var(--overlay-xs)' }}>
          <div className="flex flex-col items-center gap-1">
            <ProgressRing pct={batch.attendancePct} label="Attend." size={54} tone="primary" />
          </div>
          <div className="flex-1 space-y-1.5 pl-2 border-l border-white/10">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--foreground-muted)' }}>Progress</span>
              <span className="font-bold" style={{ color: 'var(--foreground)' }}>{batch.progress.pct !== null ? `${batch.progress.pct}%` : '—'}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--overlay-md)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, batch.progress.pct ?? 0))}%`, backgroundColor: badge.color }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs" style={{ color: 'var(--foreground-subtle)' }}>
        <span>Next Session</span>
        <span className="font-semibold" style={{ color: 'var(--foreground-muted)' }}>
          {batch.nextSessionAt ? fmtTime(batch.nextSessionAt) : 'No upcoming'}
        </span>
      </div>
    </Link>
  );
}

function AnnouncementsList({ items }: { items: StudentAnnouncement[] }) {
  if (items.length === 0) return <EmptyRow>No announcements yet.</EmptyRow>;
  return (
    <ul className="space-y-2.5">
      {items.map((a) => {
        const badge = getSportBadge(a.title);
        const BadgeIcon = badge.icon;
        const relativeTime = a.publishedAt
          ? Math.abs(Date.now() - new Date(a.publishedAt).getTime()) < 86400000
            ? `${Math.max(1, Math.floor((Date.now() - new Date(a.publishedAt).getTime()) / 3600000))}h ago`
            : `${Math.floor((Date.now() - new Date(a.publishedAt).getTime()) / 86400000)}d ago`
          : '';
        return (
          <li key={a.id} className="flex items-start gap-3 rounded-2xl border p-3 transition-all" style={{ backgroundColor: 'var(--overlay-xs)', borderColor: 'var(--panel-border)' }}>
            <div
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs"
              style={{ backgroundColor: badge.bgColor, borderColor: badge.borderColor, color: badge.color }}
            >
              <BadgeIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold" style={{ color: 'var(--foreground)' }}>
                  {a.title}
                </span>
                {relativeTime && (
                  <span className="shrink-0 text-[10px] font-medium" style={{ color: 'var(--foreground-subtle)' }}>
                    {relativeTime}
                  </span>
                )}
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs" style={{ color: 'var(--foreground-muted)' }}>
                {a.body}
              </p>
              <p className="mt-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {a.organizationName}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StudentView() {
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [batches, setBatches] = useState<BatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<StudentDashboard>('/api/v1/me/dashboard').then(setData).catch((e) => setError(e.message));
    api<BatchSummary[]>('/api/v1/me/batches').then(setBatches).catch(() => setBatches([]));
  }, []);

  if (error) return <div className="mx-6 rounded-lg border p-4 text-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-glow)' }}>{error}</div>;
  if (!data) return <DashboardLoading />;

  const attendanceHint =
    data.attendanceTrendDelta === null ? undefined : `${data.attendanceTrendDelta >= 0 ? '+' : ''}${data.attendanceTrendDelta}% this month`;
  const activeBatches = batches?.filter((b) => b.enrollmentStatus === 'active') ?? null;
  const batchesHint =
    data.activeCoachesCount > 0
      ? `Across ${data.activeCoachesCount} coach${data.activeCoachesCount === 1 ? '' : 'es'}${
          data.activeOrgsCount > 1 ? `, ${data.activeOrgsCount} academies` : ''
        }`
      : undefined;

  return (
    <div className="space-y-6">
      {/* 5 Top Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Overall attendance"
          value={data.attendancePct === null ? '—' : `${data.attendancePct}%`}
          icon={ScanFace}
          tone="primary"
          hint={attendanceHint}
          href="/me/attendance"
        />
        <StatCard label="Current streak" value={`${data.streakDays} day${data.streakDays === 1 ? '' : 's'}`} icon={Flame} tone="accent" hint="Keep it up!" href="/me/attendance" />
        <StatCard label="Active batches" value={data.activeBatchesCount} icon={CalendarClock} tone="primary" hint={batchesHint} href="/me/batches" />
        <StatCard
          label="Upcoming payments"
          value={fmtMoney(data.upcomingPaymentsMinor, data.currency)}
          icon={Wallet}
          tone={data.upcomingPaymentsMinor > 0 ? 'warning' : 'success'}
          hint={data.upcomingPaymentsCount > 0 ? `${data.upcomingPaymentsCount} due` : undefined}
          href="/me/payments"
        />
        <StatCard
          label="Pending approvals"
          value={data.pendingApprovalsCount}
          icon={ClipboardCheck}
          tone={data.pendingApprovalsCount > 0 ? 'warning' : 'primary'}
          hint={data.pendingApprovalsCount > 0 ? 'Action required' : undefined}
          href="/me/batches"
        />
      </div>

      {/* Middle Section: Today's Schedule & My Active Batches */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionCard title="Today's Schedule" action={{ label: 'View Calendar', href: '/me/schedule' }}>
            <TodaySchedule sessions={data.todaysSessions} />
          </SectionCard>
        </div>

        <div className="lg:col-span-8">
          <SectionCard title="My Active Batches" action={{ label: 'View All', href: '/me/batches' }}>
            {activeBatches === null ? (
              <EmptyRow>Loading…</EmptyRow>
            ) : activeBatches.length === 0 ? (
              <EmptyRow>You&apos;re not enrolled in any batches yet.</EmptyRow>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeBatches.map((b) => (
                  <StudentBatchCard key={b.batchId} batch={b} />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Bottom Section: Recent Coach Feedback, Achievements & Announcements */}
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Recent Coach Feedback">
          <div className="glass-panel flex flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: 'var(--panel-border)' }}>
            <Award className="mb-2 h-8 w-8 text-amber-400 opacity-80" />
            <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>Coming soon...</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--foreground-subtle)' }}>Coach feedback and ratings will appear here soon.</p>
          </div>
        </SectionCard>

        <SectionCard title="Achievements">
          <div className="glass-panel flex flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: 'var(--panel-border)' }}>
            <Trophy className="mb-2 h-8 w-8 text-amber-400 opacity-80" />
            <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>Coming soon...</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--foreground-subtle)' }}>Badges & milestones tracking coming soon.</p>
          </div>
        </SectionCard>

        <SectionCard title="Announcements" action={{ label: 'View All', href: '/me/announcements' }}>
          <AnnouncementsList items={data.announcements} />
        </SectionCard>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [view, setView] = useState<'owner' | 'coach' | null>(null);
  const [userName, setUserName] = useState<string>('');
  // Independent of the active workspace — a student belongs to N unrelated
  // orgs at once and has no "workspace" of their own (see StudentView's
  // backing endpoints), so this checks for student status directly rather
  // than waiting on orgId/roles in the active workspace.
  const [hasStudentBatches, setHasStudentBatches] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ displayName?: string }>('/api/v1/me')
      .then((p) => {
        if (p?.displayName) setUserName(p.displayName);
      })
      .catch(() => {});
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace')
      .then((w) => setOrgId(w.activeOrgId))
      .catch(() => setOrgId(null));
    api<BatchSummary[]>('/api/v1/me/batches')
      .then((b) => setHasStudentBatches(b.length > 0))
      .catch(() => setHasStudentBatches(false));
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const tod = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return userName ? `${tod}, ${userName} 👋` : `${tod} 👋`;
  }, [userName]);

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

  const stillResolving = orgId === undefined || hasStudentBatches === null || (orgId ? roles === null : false);
  if (stillResolving) return <DashboardLoading />;

  // Staff role in the active workspace wins (they're mid-task in that org);
  // otherwise, if the caller is a student anywhere, that's an org-agnostic
  // view regardless of whatever workspace happens to be active.
  if (!isMgmt && !isCoach && hasStudentBatches) {
    return (
      <div className="p-6 md:p-8">
        <DashboardHeader badge="Overview" icon={LayoutGrid} title={greeting} subtitle="Your batches and progress at a glance." />
        <StudentView />
      </div>
    );
  }

  if (!orgId || view === null) {
    return (
      <div className="p-8">
        <DashboardHeader badge="Overview" icon={LayoutGrid} title={greeting} subtitle="Select a workspace to see its dashboard." />
        <Link href="/workspace" className="btn-premium inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">
          <LayoutGrid className="h-4 w-4" /> Choose a workspace
        </Link>
      </div>
    );
  }

  const subtitle =
    view === 'owner' ? 'Your academy at a glance for today.' : 'Your batches and athletes for today.';

  return (
    <div className="p-6 md:p-8">
      <DashboardHeader
        badge="Overview"
        icon={LayoutGrid}
        title={greeting}
        subtitle={subtitle}
        action={
          isMgmt && isCoach ? (
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
          ) : undefined
        }
      />

      {view === 'owner' ? <OwnerView orgId={orgId} /> : <CoachView orgId={orgId} />}
    </div>
  );
}
