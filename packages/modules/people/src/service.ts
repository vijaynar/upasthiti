// people module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: enrollments (Doc 07 §6, migration 0008). batch_enrollments is NOT
// built here — it FKs into `batches`, which doesn't exist until Scheduling
// (Phase 7); see migration 0008's header for the full rationale.
// Guardianship/consent (users, guardianships, consents) belong to
// identity-auth, not this module — it already owned those tables since
// migration 0003 and gained the real guardian-adds-child flow
// (addWard/listWards) alongside this module in Phase 6.
// Target phase: Phase 6 — People & Enrollment.

import { db } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';

export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled';

// A plain UPDATE whose target row is filtered out by an RLS USING clause
// affects zero rows without raising (same landmine as tenancy-rbac's
// NotAuthorizedError comment) — checked explicitly below rather than
// reporting a silent no-op as success.
export class NotAuthorizedError extends Error {
  constructor(action = 'perform this action') {
    super(`[people] You do not have permission to ${action}.`);
  }
}

export interface EnrollStudentInput {
  organizationId: string;
  branchId: string;
  studentUserId: string;
  rollNumber?: string;
  profile?: Record<string, unknown>;
  startedOn: string; // ISO date
}

export interface Enrollment {
  id: string;
  organizationId: string;
  branchId: string;
  studentUserId: string;
  status: EnrollmentStatus;
  rollNumber: string | null;
  profile: Record<string, unknown>;
  startedOn: string;
  endedOn: string | null;
}

function mapEnrollmentRow(row: {
  id: string;
  organization_id: string;
  branch_id: string;
  student_user_id: string;
  status: EnrollmentStatus;
  roll_number: string | null;
  profile: Record<string, unknown>;
  started_on: string;
  ended_on: string | null;
}): Enrollment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    studentUserId: row.student_user_id,
    status: row.status,
    rollNumber: row.roll_number,
    profile: row.profile,
    startedOn: row.started_on,
    endedOn: row.ended_on,
  };
}

const ENROLLMENT_COLUMNS = `id, organization_id, branch_id, student_user_id, status, roll_number, profile, started_on, ended_on`;

// RLS-gated insert (enrollments_insert_staff, migration 0008) — a caller
// without people.student.update at branch scope gets a genuine 42501, no
// pre-check needed here (same pattern as invitations/feature-flags).
const INSERT_ENROLLMENT_SQL = `insert into enrollments (organization_id, branch_id, student_user_id, roll_number, profile, started_on)
   values ($1, $2, $3, $4, $5, $6)
   on conflict (organization_id, student_user_id, branch_id)
     do update set status = 'active', ended_on = null
   returning ${ENROLLMENT_COLUMNS}`;

export async function enrollStudent(session: SessionContext, input: EnrollStudentInput): Promise<Enrollment> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapEnrollmentRow>[0]>(INSERT_ENROLLMENT_SQL, [
      input.organizationId,
      input.branchId,
      input.studentUserId,
      input.rollNumber ?? null,
      input.profile ?? {},
      input.startedOn,
    ]);
    return mapEnrollmentRow(result.rows[0]);
  });
}

export interface UpdateEnrollmentInput {
  status?: EnrollmentStatus;
  rollNumber?: string | null;
  profile?: Record<string, unknown>;
  endedOn?: string | null;
}

export async function updateEnrollment(session: SessionContext, enrollmentId: string, patch: UpdateEnrollmentInput): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(
      `update enrollments set
         status = coalesce($1, status),
         roll_number = coalesce($2, roll_number),
         profile = coalesce($3, profile),
         ended_on = coalesce($4, ended_on)
       where id = $5`,
      [patch.status ?? null, patch.rollNumber ?? null, patch.profile ?? null, patch.endedOn ?? null, enrollmentId]
    );
    if (result.rowCount === 0) throw new NotAuthorizedError('update this enrollment');
  });
}

const SELECT_ENROLLMENT_BY_ID_SQL = `select ${ENROLLMENT_COLUMNS} from enrollments where id = $1`;

export async function getEnrollment(session: SessionContext, enrollmentId: string): Promise<Enrollment | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapEnrollmentRow>[0]>(SELECT_ENROLLMENT_BY_ID_SQL, [enrollmentId]);
    const row = result.rows[0];
    return row ? mapEnrollmentRow(row) : null;
  });
}

export interface ListEnrollmentsInput {
  organizationId: string;
  branchId?: string;
  status?: EnrollmentStatus;
}

const LIST_ENROLLMENTS_SQL = `select ${ENROLLMENT_COLUMNS} from enrollments
   where organization_id = $1
     and ($2::uuid is null or branch_id = $2)
     and ($3::text is null or status = $3)
   order by created_at desc`;

// Staff listing (enrollments_select_staff, branch-scoped via
// has_perm_branch('people.student.read', ...)).
export async function listEnrollments(session: SessionContext, input: ListEnrollmentsInput): Promise<Enrollment[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapEnrollmentRow>[0]>(LIST_ENROLLMENTS_SQL, [
      input.organizationId,
      input.branchId ?? null,
      input.status ?? null,
    ]);
    return result.rows.map(mapEnrollmentRow);
  });
}

const LIST_ENROLLMENTS_BY_STUDENT_SQL = `select ${ENROLLMENT_COLUMNS} from enrollments where student_user_id = $1 order by created_at desc`;

// Self (enrollments_select_self) — a student's own enrollments across every
// org they're enrolled in.
export async function listMyEnrollments(session: SessionContext): Promise<Enrollment[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapEnrollmentRow>[0]>(LIST_ENROLLMENTS_BY_STUDENT_SQL, [session.userId]);
    return result.rows.map(mapEnrollmentRow);
  });
}

// A guardian's wards' enrollments (enrollments_select_guardian, is_my_ward()).
export async function listWardEnrollments(session: SessionContext, wardUserId: string): Promise<Enrollment[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapEnrollmentRow>[0]>(LIST_ENROLLMENTS_BY_STUDENT_SQL, [wardUserId]);
    return result.rows.map(mapEnrollmentRow);
  });
}

// ── Detailed roster (Students page) ────────────────────────────────
// Same "join users for display_name, works under users_select_org_student"
// precedent as module-progress's listProgressRoster — that RLS policy
// (migration 0004) is exactly what makes this join visible to staff.

export interface DetailedEnrollment extends Enrollment {
  studentDisplayName: string;
  studentAvatarPath: string | null;
  studentDob: string | null;
  studentGender: string | null;
  studentPhone: string | null;
  batches: { batchId: string; batchName: string }[];
}

const LIST_ENROLLMENTS_DETAILED_SQL = `select e.id, e.organization_id, e.branch_id, e.student_user_id, e.status, e.roll_number, e.profile, e.started_on, e.ended_on,
    u.display_name as student_display_name, u.avatar_path as student_avatar_path, u.dob as student_dob, u.gender as student_gender, u.phone as student_phone,
    coalesce(json_agg(json_build_object('batchId', b.id, 'batchName', b.name)) filter (where b.id is not null), '[]') as batches
  from enrollments e
  join users u on u.id = e.student_user_id
  left join batch_enrollments be on be.enrollment_id = e.id and be.status = 'active'
  left join batches b on b.id = be.batch_id
  where e.organization_id = $1
    and ($2::uuid is null or e.branch_id = $2)
    and ($3::text is null or e.status = $3)
  group by e.id, u.display_name, u.avatar_path, u.dob, u.gender, u.phone
  order by e.created_at desc`;

export async function listEnrollmentsDetailed(session: SessionContext, input: ListEnrollmentsInput): Promise<DetailedEnrollment[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      organization_id: string;
      branch_id: string;
      student_user_id: string;
      status: EnrollmentStatus;
      roll_number: string | null;
      profile: Record<string, unknown>;
      started_on: string;
      ended_on: string | null;
      student_display_name: string;
      student_avatar_path: string | null;
      student_dob: string | null;
      student_gender: string | null;
      student_phone: string | null;
      batches: { batchId: string; batchName: string }[];
    }>(LIST_ENROLLMENTS_DETAILED_SQL, [input.organizationId, input.branchId ?? null, input.status ?? null]);
    return result.rows.map((row) => ({
      ...mapEnrollmentRow(row),
      studentDisplayName: row.student_display_name,
      studentAvatarPath: row.student_avatar_path,
      studentDob: row.student_dob,
      studentGender: row.student_gender,
      studentPhone: row.student_phone,
      batches: row.batches,
    }));
  });
}

const GET_ENROLLMENT_DETAILED_SQL = `select e.id, e.organization_id, e.branch_id, e.student_user_id, e.status, e.roll_number, e.profile, e.started_on, e.ended_on,
    u.display_name as student_display_name, u.avatar_path as student_avatar_path, u.dob as student_dob, u.gender as student_gender, u.phone as student_phone,
    coalesce(json_agg(json_build_object('batchId', b.id, 'batchName', b.name)) filter (where b.id is not null), '[]') as batches
  from enrollments e
  join users u on u.id = e.student_user_id
  left join batch_enrollments be on be.enrollment_id = e.id and be.status = 'active'
  left join batches b on b.id = be.batch_id
  where e.id = $1
  group by e.id, u.display_name, u.avatar_path, u.dob, u.gender, u.phone`;

// Single-row counterpart to listEnrollmentsDetailed — the Students page's
// "Register Face Key" page needs the student's name for its header on a
// fresh page load (no roster list in memory to look it up from).
export async function getEnrollmentDetailed(session: SessionContext, enrollmentId: string): Promise<DetailedEnrollment | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      organization_id: string;
      branch_id: string;
      student_user_id: string;
      status: EnrollmentStatus;
      roll_number: string | null;
      profile: Record<string, unknown>;
      started_on: string;
      ended_on: string | null;
      student_display_name: string;
      student_avatar_path: string | null;
      student_dob: string | null;
      student_gender: string | null;
      student_phone: string | null;
      batches: { batchId: string; batchName: string }[];
    }>(GET_ENROLLMENT_DETAILED_SQL, [enrollmentId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...mapEnrollmentRow(row),
      studentDisplayName: row.student_display_name,
      studentAvatarPath: row.student_avatar_path,
      studentDob: row.student_dob,
      studentGender: row.student_gender,
      studentPhone: row.student_phone,
      batches: row.batches,
    };
  });
}

// ── Email -> user lookup (Students page "Add by userID or email") ──────
// auth_methods is self-only RLS, so this goes through the SECURITY DEFINER
// find_user_by_verified_email() function (migration 0010) rather than a
// direct table read — see that migration's header for why.

export interface FoundUser {
  id: string;
  displayName: string;
  avatarPath: string | null;
}

const FIND_USER_BY_EMAIL_SQL = `select * from find_user_by_verified_email($1)`;

export async function findUserByEmail(session: SessionContext, email: string): Promise<FoundUser | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ id: string; display_name: string; avatar_path: string | null }>(FIND_USER_BY_EMAIL_SQL, [email]);
    const row = result.rows[0];
    return row ? { id: row.id, displayName: row.display_name, avatarPath: row.avatar_path } : null;
  });
}

// ── Student notes (Students page "Notes" tab / "Add Note" quick action) ─

export interface StudentNote {
  id: string;
  enrollmentId: string;
  authorUserId: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
}

const LIST_NOTES_SQL = `select n.id, n.enrollment_id, n.author_user_id, u.display_name as author_display_name, n.body, n.created_at
  from student_notes n
  join users u on u.id = n.author_user_id
  where n.enrollment_id = $1
  order by n.created_at desc`;

const INSERT_NOTE_SQL = `with inserted as (
    insert into student_notes (organization_id, enrollment_id, author_user_id, body)
    values ($1, $2, $3, $4)
    returning id, enrollment_id, author_user_id, body, created_at
  )
  select i.id, i.enrollment_id, i.author_user_id, u.display_name as author_display_name, i.body, i.created_at
  from inserted i join users u on u.id = i.author_user_id`;

export async function listStudentNotes(session: SessionContext, enrollmentId: string): Promise<StudentNote[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      enrollment_id: string;
      author_user_id: string;
      author_display_name: string;
      body: string;
      created_at: string;
    }>(LIST_NOTES_SQL, [enrollmentId]);
    return result.rows.map((row) => ({
      id: row.id,
      enrollmentId: row.enrollment_id,
      authorUserId: row.author_user_id,
      authorDisplayName: row.author_display_name,
      body: row.body,
      createdAt: row.created_at,
    }));
  });
}

export interface AddStudentNoteInput {
  organizationId: string;
  enrollmentId: string;
  body: string;
}

export async function addStudentNote(session: SessionContext, input: AddStudentNoteInput): Promise<StudentNote> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      id: string;
      enrollment_id: string;
      author_user_id: string;
      author_display_name: string;
      body: string;
      created_at: string;
    }>(INSERT_NOTE_SQL, [input.organizationId, input.enrollmentId, session.userId, input.body]);
    const row = result.rows[0];
    return {
      id: row.id,
      enrollmentId: row.enrollment_id,
      authorUserId: row.author_user_id,
      authorDisplayName: row.author_display_name,
      body: row.body,
      createdAt: row.created_at,
    };
  });
}
