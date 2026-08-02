// dashboard module — public API (Doc 14 §2). Read-only aggregation for the
// role-specific home screens; owns no tables (see README). Every export runs
// under db.withRequestContext, so RLS is the real scope gate — an Owner reads
// the whole org, a Branch Admin only their branch, a Coach only what the
// batch/roster policies expose. No service-role anywhere in this file.
//
// SQL lives in module-level string constants (not inline template literals in
// .query()) so the Doc 13 §9 A03 lint rule against interpolated query strings
// doesn't flag it — every `${}` here is a static column list, never a value;
// values always flow through the params array.

import { db } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';

// ── Role resolution (dashboard routing) ──────────────────────────

// The caller's own active org role keys (e.g. ['owner'], ['coach']). Read
// under membership_roles_select_visible's self carve-out (migration 0006), so
// no permission gate is needed. Used by /dashboard to pick a dashboard.
const MY_ORG_ROLES_SQL = `
  select r.key
  from memberships m
  join membership_roles mr on mr.membership_id = m.id
  join roles r on r.id = mr.role_id
  where m.user_id = $1 and m.organization_id = $2 and m.status = 'active'`;

export async function getMyOrgRoles(session: SessionContext, organizationId: string): Promise<string[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ key: string }>(MY_ORG_ROLES_SQL, [session.userId, organizationId]);
    return result.rows.map((r) => r.key);
  });
}

// ── Owner / admin dashboard ──────────────────────────────────────

export interface OwnerDashboard {
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
  recentEnrollments: RecentEnrollment[];
}

export interface DashboardSession {
  sessionId: string;
  batchName: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface RecentEnrollment {
  enrollmentId: string;
  displayName: string | null;
  rollNumber: string | null;
  status: string;
  startedOn: string;
}

const OWNER_KPIS_SQL = `
  select
    (select default_currency from organizations where id = $1) as currency,
    (select count(*) from memberships where organization_id = $1 and status = 'active') as member_count,
    (select count(*) from enrollments where organization_id = $1 and status = 'active') as active_students,
    (select count(*) from batches where organization_id = $1 and status = 'active') as active_batches,
    (select count(*) from class_sessions where organization_id = $1 and session_date = current_date and status = 'scheduled') as sessions_today,
    (select count(*) from join_requests where organization_id = $1 and status = 'pending') as pending_join_requests,
    (select count(*) from leads where organization_id = $1 and status = 'new') as new_leads,
    (select count(*) from payments where organization_id = $1 and status = 'pending_verification') as pending_payments,
    (select coalesce(sum(amount_minor), 0) from charges where organization_id = $1 and status in ('open', 'pending_verification')) as outstanding_minor,
    (select coalesce(sum(amount_minor), 0) from payments where organization_id = $1 and status = 'succeeded' and created_at >= date_trunc('month', now())) as collected_month_minor`;

const OWNER_TODAY_SESSIONS_SQL = `
  select cs.id as session_id, b.name as batch_name, cs.starts_at, cs.ends_at, cs.status
  from class_sessions cs
  join batches b on b.id = cs.batch_id
  where cs.organization_id = $1 and cs.session_date = current_date
  order by cs.starts_at
  limit 12`;

const OWNER_RECENT_ENROLLMENTS_SQL = `
  select e.id as enrollment_id, u.display_name, e.roll_number, e.status, e.started_on
  from enrollments e
  left join users u on u.id = e.student_user_id
  where e.organization_id = $1
  order by e.created_at desc
  limit 6`;

export async function getOwnerDashboard(session: SessionContext, organizationId: string): Promise<OwnerDashboard> {
  return db.withRequestContext(session, async (client) => {
    const kpis = await client.query<{
      currency: string | null;
      member_count: string;
      active_students: string;
      active_batches: string;
      sessions_today: string;
      pending_join_requests: string;
      new_leads: string;
      pending_payments: string;
      outstanding_minor: string;
      collected_month_minor: string;
    }>(OWNER_KPIS_SQL, [organizationId]);
    const row = kpis.rows[0];

    const sessions = await client.query<{
      session_id: string;
      batch_name: string;
      starts_at: string;
      ends_at: string;
      status: string;
    }>(OWNER_TODAY_SESSIONS_SQL, [organizationId]);

    const enrollments = await client.query<{
      enrollment_id: string;
      display_name: string | null;
      roll_number: string | null;
      status: string;
      started_on: string;
    }>(OWNER_RECENT_ENROLLMENTS_SQL, [organizationId]);

    return {
      currency: row?.currency ?? 'INR',
      memberCount: Number(row?.member_count ?? 0),
      activeStudents: Number(row?.active_students ?? 0),
      activeBatches: Number(row?.active_batches ?? 0),
      sessionsToday: Number(row?.sessions_today ?? 0),
      pendingJoinRequests: Number(row?.pending_join_requests ?? 0),
      newLeads: Number(row?.new_leads ?? 0),
      pendingPayments: Number(row?.pending_payments ?? 0),
      outstandingMinor: Number(row?.outstanding_minor ?? 0),
      collectedThisMonthMinor: Number(row?.collected_month_minor ?? 0),
      todaysSessions: sessions.rows.map((s) => ({
        sessionId: s.session_id,
        batchName: s.batch_name,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        status: s.status,
      })),
      recentEnrollments: enrollments.rows.map((e) => ({
        enrollmentId: e.enrollment_id,
        displayName: e.display_name,
        rollNumber: e.roll_number,
        status: e.status,
        startedOn: e.started_on,
      })),
    };
  });
}

// ── Coach dashboard ──────────────────────────────────────────────

export interface CoachDashboard {
  assignedBatches: number;
  sessionsToday: number;
  rosterCount: number;
  pendingReviews: number;
  progressLoggedThisMonth: number;
  todaysSessions: DashboardSession[];
  myBatches: CoachBatch[];
}

export interface CoachBatch {
  batchId: string;
  name: string;
  rosterCount: number;
  nextSessionAt: string | null;
}

// my_batch_ids() resolves against current_org()/current_user_id() (the GUCs
// withRequestContext sets), so it already scopes to the caller's assigned
// batches in the active org — no explicit org filter needed on it, but the
// review-queue/progress counts still filter by organization_id for clarity.
const COACH_KPIS_SQL = `
  select
    (select count(*) from batches where id in (select my_batch_ids()) and status = 'active') as assigned_batches,
    (select count(*) from class_sessions where batch_id in (select my_batch_ids()) and session_date = current_date and status = 'scheduled') as sessions_today,
    (select count(*) from batch_enrollments where batch_id in (select my_batch_ids()) and status = 'active') as roster_count,
    (select count(*) from attendance_review_queue where organization_id = $1 and status = 'pending') as pending_reviews,
    (select count(*) from progress_entries where organization_id = $1 and recorded_by = $2 and created_at >= date_trunc('month', now())) as progress_logged`;

const COACH_TODAY_SESSIONS_SQL = `
  select cs.id as session_id, b.name as batch_name, cs.starts_at, cs.ends_at, cs.status
  from class_sessions cs
  join batches b on b.id = cs.batch_id
  where cs.batch_id in (select my_batch_ids()) and cs.session_date = current_date
  order by cs.starts_at
  limit 12`;

const COACH_MY_BATCHES_SQL = `
  select b.id as batch_id, b.name,
    (select count(*) from batch_enrollments be where be.batch_id = b.id and be.status = 'active') as roster_count,
    (select min(cs.starts_at) from class_sessions cs where cs.batch_id = b.id and cs.starts_at >= now() and cs.status = 'scheduled') as next_session_at
  from batches b
  where b.id in (select my_batch_ids()) and b.status = 'active'
  order by b.name`;

export async function getCoachDashboard(session: SessionContext, organizationId: string): Promise<CoachDashboard> {
  return db.withRequestContext(session, async (client) => {
    const kpis = await client.query<{
      assigned_batches: string;
      sessions_today: string;
      roster_count: string;
      pending_reviews: string;
      progress_logged: string;
    }>(COACH_KPIS_SQL, [organizationId, session.userId]);
    const row = kpis.rows[0];

    const sessions = await client.query<{
      session_id: string;
      batch_name: string;
      starts_at: string;
      ends_at: string;
      status: string;
    }>(COACH_TODAY_SESSIONS_SQL, []);

    const batches = await client.query<{
      batch_id: string;
      name: string;
      roster_count: string;
      next_session_at: string | null;
    }>(COACH_MY_BATCHES_SQL, []);

    return {
      assignedBatches: Number(row?.assigned_batches ?? 0),
      sessionsToday: Number(row?.sessions_today ?? 0),
      rosterCount: Number(row?.roster_count ?? 0),
      pendingReviews: Number(row?.pending_reviews ?? 0),
      progressLoggedThisMonth: Number(row?.progress_logged ?? 0),
      todaysSessions: sessions.rows.map((s) => ({
        sessionId: s.session_id,
        batchName: s.batch_name,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        status: s.status,
      })),
      myBatches: batches.rows.map((b) => ({
        batchId: b.batch_id,
        name: b.name,
        rosterCount: Number(b.roster_count),
        nextSessionAt: b.next_session_at,
      })),
    };
  });
}

// ── Student dashboard (docsV2/STUDENT_PORTAL_SPEC.md Tier 1) ─────
// Same "owns no tables, RLS is the real gate" shape as Owner/Coach above —
// every table queried here belongs to another module (scheduling/people/
// progress/attendance/finance/notifications); this module only aggregates
// reads across them for the student home screen and "My Batches" list. The
// batch/coach/program/announcement joins below only return real data
// because migration 0011 added the matching student-read RLS carve-outs
// (coach_assignments_select_student, users_select_org_coach_of_mine,
// programs_select_student, org_announcements_select_student) — without
// those this would be another instance of the "silent-empty-join" pattern
// flagged throughout this schema's history, not a bug in this file.

export interface BatchProgress {
  // false when the batch has no primaryMetricKey set — render "not tracked
  // yet", never a fabricated percentage (this spec's resolved open question:
  // progress is goal-based on ONE staff-picked metric per batch, not
  // inferred).
  tracked: boolean;
  metricLabel: string | null;
  unit: string | null;
  targetValue: number | null;
  latestValue: number | null;
  pct: number | null; // null when untracked, no goal set, or no entries yet
}

export interface BatchSummary {
  batchId: string;
  batchName: string;
  // 'left' batches are the "Completed" tab (docsV2/STUDENT_PORTAL_SPEC.md's
  // resolved open question) — batch_enrollments has no separate "finished
  // the program" vs. "withdrew" state, so this is deliberately the same
  // bucket for both.
  enrollmentStatus: 'active' | 'left';
  programName: string | null;
  mode: string;
  schedule: { days: number[]; startTime: string; endTime: string; startDate: string; endDate?: string | null };
  coachName: string | null;
  attendancePct: number | null; // null = nothing recorded yet, not 0%
  nextSessionAt: string | null;
  progress: BatchProgress;
}

interface BatchSummaryRow {
  batch_id: string;
  batch_name: string;
  enrollment_status: 'active' | 'left';
  mode: string;
  schedule: BatchSummary['schedule'];
  primary_metric_key: string | null;
  program_name: string | null;
  coach_name: string | null;
  attendance_total: string;
  attendance_present: string;
  next_session_at: string | null;
  metric_label: string | null;
  metric_unit: string | null;
  metric_direction: 'higher_better' | 'lower_better' | null;
  metric_target: string | null;
  latest_value: string | null;
}

function resolveBatchProgress(row: BatchSummaryRow): BatchProgress {
  if (!row.primary_metric_key || row.metric_label === null) {
    return { tracked: false, metricLabel: null, unit: null, targetValue: null, latestValue: null, pct: null };
  }
  const target = row.metric_target === null ? null : Number(row.metric_target);
  const latest = row.latest_value === null ? null : Number(row.latest_value);
  let pct: number | null = null;
  if (target !== null && target > 0 && latest !== null) {
    const raw = row.metric_direction === 'lower_better' ? (latest > 0 ? (target / latest) * 100 : 0) : (latest / target) * 100;
    pct = Math.max(0, Math.min(100, Math.round(raw)));
  }
  return { tracked: true, metricLabel: row.metric_label, unit: row.metric_unit, targetValue: target, latestValue: latest, pct };
}

// One row per active batch enrollment, with attendance % and progress %
// resolved via LATERAL subqueries rather than separate round-trips — the
// per-student batch count is small (a handful), so this stays cheap.
const MY_BATCH_SUMMARIES_SQL = `
  select
    b.id as batch_id, b.name as batch_name, be.status as enrollment_status, b.mode, b.schedule, b.primary_metric_key,
    p.name as program_name,
    coach.display_name as coach_name,
    coalesce(att.total, 0) as attendance_total,
    coalesce(att.present_like, 0) as attendance_present,
    nxt.starts_at as next_session_at,
    md.label as metric_label, md.unit as metric_unit, md.direction as metric_direction, md.target_value as metric_target,
    latest.value as latest_value
  from batch_enrollments be
  join batches b on b.id = be.batch_id
  join enrollments e on e.id = be.enrollment_id
  left join programs p on p.id = b.program_id
  left join lateral (
    select u.display_name
    from coach_assignments ca
    join memberships m on m.id = ca.membership_id
    join users u on u.id = m.user_id
    where ca.batch_id = b.id
    order by (ca.role = 'primary') desc
    limit 1
  ) coach on true
  left join lateral (
    select count(*) as total, count(*) filter (where ae.status in ('present','late')) as present_like
    from attendance_events ae
    join class_sessions cs on cs.id = ae.class_session_id
    where cs.batch_id = b.id and ae.enrollment_id = be.enrollment_id and ae.superseded_by is null
  ) att on true
  left join lateral (
    select cs.starts_at from class_sessions cs
    where cs.batch_id = b.id and cs.starts_at >= now() and cs.status = 'scheduled'
    order by cs.starts_at
    limit 1
  ) nxt on true
  left join lateral (
    select target_value, label, unit, direction
    from metric_definitions
    where key = b.primary_metric_key and (organization_id = b.organization_id or organization_id is null)
    order by organization_id nulls last
    limit 1
  ) md on b.primary_metric_key is not null
  left join lateral (
    select value from progress_entries
    where enrollment_id = be.enrollment_id and metric_key = b.primary_metric_key
    order by recorded_on desc, created_at desc
    limit 1
  ) latest on b.primary_metric_key is not null
  where e.student_user_id = $1 and e.organization_id = $2 and be.status in ('active', 'left')
  order by (be.status = 'active') desc, b.name`;

export async function listMyBatchSummaries(session: SessionContext, organizationId: string): Promise<BatchSummary[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<BatchSummaryRow>(MY_BATCH_SUMMARIES_SQL, [session.userId, organizationId]);
    return result.rows.map((row) => {
      const total = Number(row.attendance_total);
      const present = Number(row.attendance_present);
      return {
        batchId: row.batch_id,
        batchName: row.batch_name,
        enrollmentStatus: row.enrollment_status,
        programName: row.program_name,
        mode: row.mode,
        schedule: row.schedule,
        coachName: row.coach_name,
        attendancePct: total > 0 ? Math.round((present / total) * 100) : null,
        nextSessionAt: row.next_session_at,
        progress: resolveBatchProgress(row),
      };
    });
  });
}

export interface StudentAnnouncement {
  id: string;
  title: string;
  body: string;
  tag: string;
  publishedAt: string | null;
}

export interface StudentDashboard {
  currency: string;
  activeBatchesCount: number;
  attendancePct: number | null; // null = no attendance recorded yet, not 0%
  attendanceTrendDelta: number | null; // this month's % minus last month's, in points
  streakDays: number;
  upcomingPaymentsMinor: number;
  upcomingPaymentsCount: number;
  // Batch-join requests awaiting a coach's decision + payment proofs
  // awaiting staff verification — the two real "a human needs to act on
  // this" states that exist for a student today (resolved open question).
  pendingApprovalsCount: number;
  todaysSessions: DashboardSession[];
  announcements: StudentAnnouncement[];
}

const STUDENT_KPIS_SQL = `
  select
    (select default_currency from organizations where id = $1) as currency,
    (select count(*) from batch_enrollments be join enrollments e on e.id = be.enrollment_id
       where e.student_user_id = $2 and e.organization_id = $1 and be.status = 'active') as active_batches,
    (select coalesce(sum(c.amount_minor), 0) from charges c join enrollments e on e.id = c.enrollment_id
       where e.student_user_id = $2 and e.organization_id = $1 and c.status = 'open' and c.due_on >= current_date) as upcoming_minor,
    (select count(*) from charges c join enrollments e on e.id = c.enrollment_id
       where e.student_user_id = $2 and e.organization_id = $1 and c.status = 'open' and c.due_on >= current_date) as upcoming_count,
    (select count(*) from batch_join_requests bjr join enrollments e on e.id = bjr.enrollment_id
       where e.student_user_id = $2 and bjr.status = 'pending') as pending_join_requests,
    (select count(*) from payments where payer_user_id = $2 and organization_id = $1 and status = 'pending_verification') as pending_payment_proofs`;

const STUDENT_TODAY_SESSIONS_SQL = `
  select cs.id as session_id, b.name as batch_name, cs.starts_at, cs.ends_at, cs.status
  from class_sessions cs
  join batch_enrollments be on be.batch_id = cs.batch_id and be.status = 'active'
  join enrollments e on e.id = be.enrollment_id
  join batches b on b.id = cs.batch_id
  where e.student_user_id = $1 and e.organization_id = $2 and cs.session_date = current_date
  order by cs.starts_at
  limit 12`;

const STUDENT_ANNOUNCEMENTS_SQL = `
  select id, title, body, tag, published_at
  from org_announcements
  where organization_id = $1
  order by published_at desc nulls last
  limit 6`;

// Bounded to the last 180 days — enough to compute a meaningful streak and
// month-over-month trend without scanning a student's entire history.
// superseded_by is null so a correction (attendance.override) is reflected
// once, not double-counted alongside the event it replaced (same filter
// listMyAttendance already applies).
const STUDENT_ATTENDANCE_HISTORY_SQL = `
  select ae.status, cs.session_date::text as session_date
  from attendance_events ae
  join class_sessions cs on cs.id = ae.class_session_id
  where ae.enrollment_id in (select id from enrollments where student_user_id = $1 and organization_id = $2)
    and ae.superseded_by is null
    and cs.session_date >= current_date - interval '180 days'
  order by cs.session_date desc`;

function isPresentLike(status: string): boolean {
  return status === 'present' || status === 'late';
}

// Computed in JS off one bounded query rather than three separate SQL
// aggregates — the row count is small enough (≤180 days of sessions) that
// this is simpler to read than duplicating the month-window logic per stat.
function computeAttendanceStats(rows: { status: string; session_date: string }[]): {
  pct: number | null;
  trendDelta: number | null;
  streakDays: number;
} {
  if (rows.length === 0) return { pct: null, trendDelta: null, streakDays: 0 };

  const pctOf = (arr: typeof rows): number | null =>
    arr.length === 0 ? null : Math.round((arr.filter((r) => isPresentLike(r.status)).length / arr.length) * 100);

  const pct = pctOf(rows);

  const now = new Date();
  const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);

  const thisMonthPct = pctOf(rows.filter((r) => r.session_date >= thisMonthStart));
  const lastMonthPct = pctOf(rows.filter((r) => r.session_date >= lastMonthStart && r.session_date < thisMonthStart));
  const trendDelta = thisMonthPct !== null && lastMonthPct !== null ? thisMonthPct - lastMonthPct : null;

  // Streak: a calendar day "hits" if ANY event that day was present/late
  // (across all batches), "misses" only if every event that day was
  // absent/excused. Walk from the most recent recorded date backward,
  // stopping at the first miss.
  const byDate = new Map<string, boolean>();
  for (const r of rows) {
    const hit = isPresentLike(r.status);
    byDate.set(r.session_date, (byDate.get(r.session_date) ?? false) || hit);
  }
  const datesDesc = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : -1));
  let streakDays = 0;
  for (const d of datesDesc) {
    if (byDate.get(d)) streakDays++;
    else break;
  }

  return { pct, trendDelta, streakDays };
}

export async function getStudentDashboard(session: SessionContext, organizationId: string): Promise<StudentDashboard> {
  return db.withRequestContext(session, async (client) => {
    const kpis = await client.query<{
      currency: string | null;
      active_batches: string;
      upcoming_minor: string;
      upcoming_count: string;
      pending_join_requests: string;
      pending_payment_proofs: string;
    }>(STUDENT_KPIS_SQL, [organizationId, session.userId]);
    const row = kpis.rows[0];

    const attendanceHistory = await client.query<{ status: string; session_date: string }>(STUDENT_ATTENDANCE_HISTORY_SQL, [
      session.userId,
      organizationId,
    ]);
    const attendance = computeAttendanceStats(attendanceHistory.rows);

    const sessions = await client.query<{
      session_id: string;
      batch_name: string;
      starts_at: string;
      ends_at: string;
      status: string;
    }>(STUDENT_TODAY_SESSIONS_SQL, [session.userId, organizationId]);

    const announcements = await client.query<{
      id: string;
      title: string;
      body: string;
      tag: string;
      published_at: string | null;
    }>(STUDENT_ANNOUNCEMENTS_SQL, [organizationId]);

    return {
      currency: row?.currency ?? 'INR',
      activeBatchesCount: Number(row?.active_batches ?? 0),
      attendancePct: attendance.pct,
      attendanceTrendDelta: attendance.trendDelta,
      streakDays: attendance.streakDays,
      upcomingPaymentsMinor: Number(row?.upcoming_minor ?? 0),
      upcomingPaymentsCount: Number(row?.upcoming_count ?? 0),
      pendingApprovalsCount: Number(row?.pending_join_requests ?? 0) + Number(row?.pending_payment_proofs ?? 0),
      todaysSessions: sessions.rows.map((s) => ({
        sessionId: s.session_id,
        batchName: s.batch_name,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        status: s.status,
      })),
      announcements: announcements.rows.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        tag: a.tag,
        publishedAt: a.published_at,
      })),
    };
  });
}
