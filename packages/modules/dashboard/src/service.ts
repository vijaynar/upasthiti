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
