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
