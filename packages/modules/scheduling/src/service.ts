// scheduling module — public API (Doc 14 §2). Surfaces and other modules
// call only the functions exported here, never this module's tables
// directly.
//
// Scope: programs, batches, class_sessions, holidays (Doc 07 §7, migration
// 0009), plus batch_enrollments (Doc 07 §6, deferred from People/Phase 6)
// and coach_assignments' real write path (deferred from RBAC/Phase 4).
// Target phase: Phase 7 — Scheduling. See migration 0009's header for the
// scope decisions (program permission reuse, archive-perm trigger, "own
// batches" as an app-layer filter rather than a second RLS gate).

import { db, queue } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';
import { addDays, isoDayOfWeek, zonedTimeToUtc } from './tz';

// The rolling-window job (see materializeSessions below) is self-rescheduling
// once running, but nothing seeds its first run — this does, idempotently
// (queue.enqueue's ON CONFLICT DO NOTHING on idempotency_key), the first time
// any batch is created. Keying by date matches the handler's own re-enqueue
// key (apps/worker/src/registry.ts) so the two paths converge on one job/day
// instead of racing to create two.
async function ensureMaterializationJobScheduled(): Promise<void> {
  const runAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await queue.enqueue(
    'scheduling.materialize_sessions',
    {},
    { runAt, idempotencyKey: `scheduling.materialize_sessions:${runAt.toISOString().slice(0, 10)}` }
  );
}

export class NotAuthorizedError extends Error {
  constructor(action = 'perform this action') {
    super(`[scheduling] You do not have permission to ${action}.`);
  }
}

// ── Programs ────────────────────────────────────────────────────

export interface Program {
  id: string;
  organizationId: string;
  name: string;
  sportKey: string | null;
  description: string | null;
}

function mapProgramRow(row: { id: string; organization_id: string; name: string; sport_key: string | null; description: string | null }): Program {
  return { id: row.id, organizationId: row.organization_id, name: row.name, sportKey: row.sport_key, description: row.description };
}

const PROGRAM_COLUMNS = `id, organization_id, name, sport_key, description`;
const INSERT_PROGRAM_SQL = `insert into programs (organization_id, name, sport_key, description) values ($1, $2, $3, $4) returning ${PROGRAM_COLUMNS}`;
const LIST_PROGRAMS_SQL = `select ${PROGRAM_COLUMNS} from programs where organization_id = $1 order by name`;

export interface CreateProgramInput {
  organizationId: string;
  name: string;
  sportKey?: string;
  description?: string;
}

export async function createProgram(session: SessionContext, input: CreateProgramInput): Promise<Program> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapProgramRow>[0]>(INSERT_PROGRAM_SQL, [
      input.organizationId,
      input.name,
      input.sportKey ?? null,
      input.description ?? null,
    ]);
    return mapProgramRow(result.rows[0]);
  });
}

export async function listPrograms(session: SessionContext, organizationId: string): Promise<Program[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapProgramRow>[0]>(LIST_PROGRAMS_SQL, [organizationId]);
    return result.rows.map(mapProgramRow);
  });
}

// ── Batches ─────────────────────────────────────────────────────

export type BatchMode = 'in_person' | 'online' | 'hybrid';
export type BatchStatus = 'active' | 'archived';

export interface BatchSchedule {
  days: number[]; // ISO dow 1-7
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  startDate: string; // 'YYYY-MM-DD'
  endDate?: string | null;
}

export interface Batch {
  id: string;
  organizationId: string;
  branchId: string;
  programId: string | null;
  name: string;
  mode: BatchMode;
  capacity: number | null;
  status: BatchStatus;
  schedule: BatchSchedule;
  graceMinutes: number;
}

function mapBatchRow(row: {
  id: string;
  organization_id: string;
  branch_id: string;
  program_id: string | null;
  name: string;
  mode: BatchMode;
  capacity: number | null;
  status: BatchStatus;
  schedule: BatchSchedule;
  grace_minutes: number;
}): Batch {
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    programId: row.program_id,
    name: row.name,
    mode: row.mode,
    capacity: row.capacity,
    status: row.status,
    schedule: row.schedule,
    graceMinutes: row.grace_minutes,
  };
}

const BATCH_COLUMNS = `id, organization_id, branch_id, program_id, name, mode, capacity, status, schedule, grace_minutes`;

const INSERT_BATCH_SQL = `insert into batches (organization_id, branch_id, program_id, name, mode, capacity, schedule, grace_minutes)
   values ($1, $2, $3, $4, $5, $6, $7, $8)
   returning ${BATCH_COLUMNS}`;

export interface CreateBatchInput {
  organizationId: string;
  branchId: string;
  programId?: string;
  name: string;
  mode?: BatchMode;
  capacity?: number;
  schedule: BatchSchedule;
  graceMinutes?: number;
}

// RLS-gated insert (batches_insert_staff, migration 0009) — a genuine 42501
// surfaces for a caller without schedule.batch.create at branch scope.
// Materializes the first rolling-window of class_sessions immediately
// (service-role, see materializeBatchSessions) rather than waiting for the
// next scheduled job run — a coach/admin creating a batch expects to see its
// upcoming sessions right away.
export async function createBatch(session: SessionContext, input: CreateBatchInput): Promise<Batch> {
  const batch = await db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapBatchRow>[0]>(INSERT_BATCH_SQL, [
      input.organizationId,
      input.branchId,
      input.programId ?? null,
      input.name,
      input.mode ?? 'in_person',
      input.capacity ?? null,
      input.schedule,
      input.graceMinutes ?? 15,
    ]);
    return mapBatchRow(result.rows[0]);
  });
  await materializeBatchSessions(batch.id);
  await ensureMaterializationJobScheduled();
  return batch;
}

export interface UpdateBatchInput {
  name?: string;
  mode?: BatchMode;
  capacity?: number | null;
  status?: BatchStatus;
  schedule?: BatchSchedule;
  graceMinutes?: number;
}

const SELECT_BATCH_CAPACITY_SQL = `select capacity from batches where id = $1`;
const UPDATE_BATCH_SQL = `update batches set
     name = coalesce($1, name),
     mode = coalesce($2, mode),
     capacity = $3,
     status = coalesce($4, status),
     schedule = coalesce($5, schedule),
     grace_minutes = coalesce($6, grace_minutes)
   where id = $7`;

// Re-materializes when `schedule` changes (same reasoning as createBatch) —
// an edited recurrence should reflect in the upcoming-sessions view
// immediately, not after the next nightly job run.
export async function updateBatch(session: SessionContext, batchId: string, patch: UpdateBatchInput): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const hasCapacity = Object.prototype.hasOwnProperty.call(patch, 'capacity');
    let capacityValue: number | null = patch.capacity ?? null;
    if (!hasCapacity) {
      const current = await client.query<{ capacity: number | null }>(SELECT_BATCH_CAPACITY_SQL, [batchId]);
      capacityValue = current.rows[0]?.capacity ?? null;
    }

    const result = await client.query(UPDATE_BATCH_SQL, [
      patch.name ?? null,
      patch.mode ?? null,
      capacityValue,
      patch.status ?? null,
      patch.schedule ?? null,
      patch.graceMinutes ?? null,
      batchId,
    ]);
    if (result.rowCount === 0) throw new NotAuthorizedError('update this batch');
  });
  if (patch.schedule) await materializeBatchSessions(batchId);
}

const SELECT_BATCH_BY_ID_SQL = `select ${BATCH_COLUMNS} from batches where id = $1`;

export async function getBatch(session: SessionContext, batchId: string): Promise<Batch | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapBatchRow>[0]>(SELECT_BATCH_BY_ID_SQL, [batchId]);
    const row = result.rows[0];
    return row ? mapBatchRow(row) : null;
  });
}

export interface ListBatchesInput {
  organizationId: string;
  branchId?: string;
  status?: BatchStatus;
}

const LIST_BATCHES_SQL = `select ${BATCH_COLUMNS} from batches
   where organization_id = $1
     and ($2::uuid is null or branch_id = $2)
     and ($3::text is null or status = $3)
   order by name`;

// Staff listing (batches_select_staff, branch-scoped via schedule.calendar.read).
export async function listBatches(session: SessionContext, input: ListBatchesInput): Promise<Batch[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapBatchRow>[0]>(LIST_BATCHES_SQL, [
      input.organizationId,
      input.branchId ?? null,
      input.status ?? null,
    ]);
    return result.rows.map(mapBatchRow);
  });
}

const LIST_MY_BATCHES_SQL = `select ${BATCH_COLUMNS} from batches where id in (select my_batch_ids()) order by name`;

// "Own batches" (Doc 04 §6) — the coach-facing view. See migration 0009's
// header: this is an app-layer filter over my_batch_ids(), not a stricter
// RLS gate (matches migration 0008's enrollments_select_staff precedent).
export async function listMyBatches(session: SessionContext): Promise<Batch[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapBatchRow>[0]>(LIST_MY_BATCHES_SQL);
    return result.rows.map(mapBatchRow);
  });
}

// ── Coach assignments ───────────────────────────────────────────

export interface CoachAssignment {
  membershipId: string;
  batchId: string;
  role: 'primary' | 'assistant';
  days: number[] | null;
}

function mapCoachAssignmentRow(row: { membership_id: string; batch_id: string; role: 'primary' | 'assistant'; days: number[] | null }): CoachAssignment {
  return { membershipId: row.membership_id, batchId: row.batch_id, role: row.role, days: row.days };
}

const COACH_ASSIGNMENT_COLUMNS = `membership_id, batch_id, role, days`;
const INSERT_COACH_ASSIGNMENT_SQL = `insert into coach_assignments (membership_id, batch_id, role, days)
   values ($1, $2, $3, $4)
   on conflict (membership_id, batch_id) do update set role = excluded.role, days = excluded.days
   returning ${COACH_ASSIGNMENT_COLUMNS}`;
const LIST_COACH_ASSIGNMENTS_SQL = `select ${COACH_ASSIGNMENT_COLUMNS} from coach_assignments where batch_id = $1`;
const DELETE_COACH_ASSIGNMENT_SQL = `delete from coach_assignments where batch_id = $1 and membership_id = $2`;

export interface AssignCoachInput {
  batchId: string;
  membershipId: string;
  role?: 'primary' | 'assistant';
  days?: number[] | null;
}

// RLS-gated (coach_assignments_insert_staff, migration 0009) — requires
// schedule.batch.update at the batch's branch scope.
export async function assignCoach(session: SessionContext, input: AssignCoachInput): Promise<CoachAssignment> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapCoachAssignmentRow>[0]>(INSERT_COACH_ASSIGNMENT_SQL, [
      input.membershipId,
      input.batchId,
      input.role ?? 'primary',
      input.days ?? null,
    ]);
    return mapCoachAssignmentRow(result.rows[0]);
  });
}

export async function listCoachAssignments(session: SessionContext, batchId: string): Promise<CoachAssignment[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapCoachAssignmentRow>[0]>(LIST_COACH_ASSIGNMENTS_SQL, [batchId]);
    return result.rows.map(mapCoachAssignmentRow);
  });
}

export async function removeCoachAssignment(session: SessionContext, batchId: string, membershipId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(DELETE_COACH_ASSIGNMENT_SQL, [batchId, membershipId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('remove this coach assignment');
  });
}

// ── Batch roster (batch_enrollments) ────────────────────────────

export type BatchEnrollmentStatus = 'active' | 'left';

export interface BatchEnrollment {
  enrollmentId: string;
  batchId: string;
  status: BatchEnrollmentStatus;
  joinedOn: string;
  leftOn: string | null;
}

function mapBatchEnrollmentRow(row: {
  enrollment_id: string;
  batch_id: string;
  status: BatchEnrollmentStatus;
  joined_on: string;
  left_on: string | null;
}): BatchEnrollment {
  return { enrollmentId: row.enrollment_id, batchId: row.batch_id, status: row.status, joinedOn: row.joined_on, leftOn: row.left_on };
}

const BATCH_ENROLLMENT_COLUMNS = `enrollment_id, batch_id, status, joined_on, left_on`;
const INSERT_BATCH_ENROLLMENT_SQL = `insert into batch_enrollments (enrollment_id, batch_id)
   values ($1, $2)
   on conflict (enrollment_id, batch_id) do update set status = 'active', left_on = null
   returning ${BATCH_ENROLLMENT_COLUMNS}`;
const LIST_BATCH_ROSTER_SQL = `select ${BATCH_ENROLLMENT_COLUMNS} from batch_enrollments where batch_id = $1 order by joined_on`;
const UPDATE_BATCH_ENROLLMENT_SQL = `update batch_enrollments set status = $1, left_on = $2 where enrollment_id = $3 and batch_id = $4`;

// RLS-gated (batch_enrollments_insert_staff) — requires schedule.batch.update
// at the batch's branch scope.
export async function addToBatchRoster(session: SessionContext, enrollmentId: string, batchId: string): Promise<BatchEnrollment> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapBatchEnrollmentRow>[0]>(INSERT_BATCH_ENROLLMENT_SQL, [enrollmentId, batchId]);
    return mapBatchEnrollmentRow(result.rows[0]);
  });
}

export async function listBatchRoster(session: SessionContext, batchId: string): Promise<BatchEnrollment[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapBatchEnrollmentRow>[0]>(LIST_BATCH_ROSTER_SQL, [batchId]);
    return result.rows.map(mapBatchEnrollmentRow);
  });
}

export async function removeFromBatchRoster(session: SessionContext, enrollmentId: string, batchId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(UPDATE_BATCH_ENROLLMENT_SQL, ['left', new Date().toISOString().slice(0, 10), enrollmentId, batchId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('update this batch roster entry');
  });
}

// ── Holidays ─────────────────────────────────────────────────────

export interface Holiday {
  id: string;
  organizationId: string;
  branchId: string | null;
  onDate: string;
  label: string;
}

function mapHolidayRow(row: { id: string; organization_id: string; branch_id: string | null; on_date: string; label: string }): Holiday {
  return { id: row.id, organizationId: row.organization_id, branchId: row.branch_id, onDate: row.on_date, label: row.label };
}

const HOLIDAY_COLUMNS = `id, organization_id, branch_id, on_date, label`;
const INSERT_HOLIDAY_SQL = `insert into holidays (organization_id, branch_id, on_date, label) values ($1, $2, $3, $4) returning ${HOLIDAY_COLUMNS}`;
const LIST_HOLIDAYS_SQL = `select ${HOLIDAY_COLUMNS} from holidays where organization_id = $1 order by on_date`;
const DELETE_HOLIDAY_SQL = `delete from holidays where id = $1`;

export interface CreateHolidayInput {
  organizationId: string;
  branchId?: string | null;
  onDate: string;
  label: string;
}

export async function createHoliday(session: SessionContext, input: CreateHolidayInput): Promise<Holiday> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapHolidayRow>[0]>(INSERT_HOLIDAY_SQL, [
      input.organizationId,
      input.branchId ?? null,
      input.onDate,
      input.label,
    ]);
    return mapHolidayRow(result.rows[0]);
  });
}

export async function listHolidays(session: SessionContext, organizationId: string): Promise<Holiday[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapHolidayRow>[0]>(LIST_HOLIDAYS_SQL, [organizationId]);
    return result.rows.map(mapHolidayRow);
  });
}

export async function deleteHoliday(session: SessionContext, holidayId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(DELETE_HOLIDAY_SQL, [holidayId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('delete this holiday');
  });
}

// ── Class sessions ──────────────────────────────────────────────

export type ClassSessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'holiday';

export interface ClassSession {
  id: string;
  organizationId: string;
  branchId: string;
  batchId: string;
  sessionDate: string;
  startsAt: string;
  endsAt: string;
  status: ClassSessionStatus;
}

function mapClassSessionRow(row: {
  id: string;
  organization_id: string;
  branch_id: string;
  batch_id: string;
  session_date: string;
  starts_at: string;
  ends_at: string;
  status: ClassSessionStatus;
}): ClassSession {
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    batchId: row.batch_id,
    sessionDate: row.session_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  };
}

const CLASS_SESSION_COLUMNS = `id, organization_id, branch_id, batch_id, session_date, starts_at, ends_at, status`;
const LIST_CLASS_SESSIONS_SQL = `select ${CLASS_SESSION_COLUMNS} from class_sessions
   where batch_id = $1 and session_date between $2 and $3
   order by starts_at`;
const UPDATE_CLASS_SESSION_STATUS_SQL = `update class_sessions set status = $1 where id = $2`;

export async function listClassSessions(session: SessionContext, batchId: string, fromDate: string, toDate: string): Promise<ClassSession[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapClassSessionRow>[0]>(LIST_CLASS_SESSIONS_SQL, [batchId, fromDate, toDate]);
    return result.rows.map(mapClassSessionRow);
  });
}

// RLS-gated (class_sessions_update_staff) — requires schedule.calendar.manage
// at the session's branch scope. Used for ad-hoc cancellations; holiday
// status is set by materializeSessions() instead.
export async function setClassSessionStatus(session: SessionContext, classSessionId: string, status: ClassSessionStatus): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(UPDATE_CLASS_SESSION_STATUS_SQL, [status, classSessionId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('update this class session');
  });
}

// ── Materialization job (Doc 07 §7 "rolling 30-day window job") ────
//
// Service-role: this is background/system work with no single caller's
// session to scope RLS to (same category as apps/worker's other jobs, see
// SERVICE_ROLE_MANIFEST). Runs across every active batch in every org, not
// one org's request context.

interface BatchForMaterialization {
  id: string;
  organization_id: string;
  branch_id: string;
  schedule: BatchSchedule;
  timezone: string;
}

const ACTIVE_BATCHES_SQL = `select b.id, b.organization_id, b.branch_id, b.schedule, o.timezone
   from batches b join organizations o on o.id = b.organization_id
   where b.status = 'active'`;

const HOLIDAYS_IN_RANGE_SQL = `select on_date::text as on_date from holidays
   where organization_id = $1 and (branch_id is null or branch_id = $2)
     and on_date between $3 and $4`;

const UPSERT_CLASS_SESSIONS_SQL = `insert into class_sessions (organization_id, branch_id, batch_id, session_date, starts_at, ends_at, status)
   select $1, $2, $3, d.session_date, d.starts_at, d.ends_at, d.status
   from unnest($4::date[], $5::timestamptz[], $6::timestamptz[], $7::text[]) as d(session_date, starts_at, ends_at, status)
   on conflict (batch_id, session_date, starts_at) do update set
     status = case when class_sessions.status in ('cancelled', 'completed') then class_sessions.status else excluded.status end`;

async function materializeOneBatch(
  client: Awaited<ReturnType<typeof db.getServiceClient>>,
  batch: BatchForMaterialization,
  today: string,
  windowEnd: string
): Promise<number> {
  const schedule = batch.schedule;
  const rangeStart = schedule.startDate > today ? schedule.startDate : today;
  const rangeEnd = schedule.endDate && schedule.endDate < windowEnd ? schedule.endDate : windowEnd;
  if (rangeStart > rangeEnd) return 0;

  const holidaysResult = await client.query<{ on_date: string }>(HOLIDAYS_IN_RANGE_SQL, [
    batch.organization_id,
    batch.branch_id,
    rangeStart,
    rangeEnd,
  ]);
  const holidaySet = new Set(holidaysResult.rows.map((r) => r.on_date));

  const sessionDates: string[] = [];
  const startsAts: Date[] = [];
  const endsAts: Date[] = [];
  const statuses: ClassSessionStatus[] = [];

  let cursor = rangeStart;
  while (cursor <= rangeEnd) {
    if (schedule.days.includes(isoDayOfWeek(cursor))) {
      sessionDates.push(cursor);
      startsAts.push(zonedTimeToUtc(cursor, schedule.startTime, batch.timezone));
      endsAts.push(zonedTimeToUtc(cursor, schedule.endTime, batch.timezone));
      statuses.push(holidaySet.has(cursor) ? 'holiday' : 'scheduled');
    }
    cursor = addDays(cursor, 1);
  }

  if (sessionDates.length === 0) return 0;

  await client.query(UPSERT_CLASS_SESSIONS_SQL, [batch.organization_id, batch.branch_id, batch.id, sessionDates, startsAts, endsAts, statuses]);
  return sessionDates.length;
}

export async function materializeSessions(windowDays = 30): Promise<{ batchesProcessed: number; sessionsUpserted: number }> {
  const client = await db.getServiceClient();
  try {
    const today = new Date().toISOString().slice(0, 10);
    const windowEnd = addDays(today, windowDays - 1);

    const batchesResult = await client.query<BatchForMaterialization>(ACTIVE_BATCHES_SQL);
    let sessionsUpserted = 0;
    for (const batch of batchesResult.rows) {
      sessionsUpserted += await materializeOneBatch(client, batch, today, windowEnd);
    }

    return { batchesProcessed: batchesResult.rows.length, sessionsUpserted };
  } finally {
    client.release();
  }
}

const ONE_BATCH_FOR_MATERIALIZATION_SQL = `select b.id, b.organization_id, b.branch_id, b.schedule, o.timezone
   from batches b join organizations o on o.id = b.organization_id
   where b.id = $1 and b.status = 'active'`;

// Immediate materialization for a single just-created/just-updated batch
// (called by createBatch/updateBatch) so sessions exist right away instead
// of waiting for the next rolling-window job run.
export async function materializeBatchSessions(batchId: string, windowDays = 30): Promise<number> {
  const client = await db.getServiceClient();
  try {
    const result = await client.query<BatchForMaterialization>(ONE_BATCH_FOR_MATERIALIZATION_SQL, [batchId]);
    const batch = result.rows[0];
    if (!batch) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const windowEnd = addDays(today, windowDays - 1);
    return materializeOneBatch(client, batch, today, windowEnd);
  } finally {
    client.release();
  }
}
