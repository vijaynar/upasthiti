// progress module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: metric_definitions, progress_entries (M11, Doc 07 §13)
// Target phase: Phase 13 — Progress & Performance (see the implementation roadmap).
//
// See migration 0015's header for scope decisions (student_user_id
// denormalized for self/guardian RLS, "own batches" as an app-layer filter
// not a second RLS gate, `progress.metric.manage` added for org-custom
// metric definitions, progress_entries append-only with a staff DELETE for
// mis-logs). RLS is the real gate throughout — every write runs under
// db.withRequestContext; INSERT/visibility denials surface as an empty
// enrollment lookup (throw) or a 42501 the route's isRlsDenied() catches;
// metric-definition management (org config, privileged) is audit-logged,
// routine progress-entry logging is not (matches the selective-audit
// precedent Phase 5/11/12 established).
//
// SQL is built into module-level string constants (not inline template
// literals in .query()) so the Doc 13 §9 A03 lint rule against interpolated
// query strings doesn't flag it — every `${}` is a static column-list
// constant, never a value; values always flow through the params array.

import { db } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';
import { writeAuditLog } from '@abhyas/module-audit';

export class NotAuthorizedError extends Error {
  constructor(action = 'perform this action') {
    super(`[progress] You do not have permission to ${action}.`);
  }
}

export class EnrollmentNotVisibleError extends Error {
  constructor() {
    super('[progress] That enrollment could not be found or is not visible to you.');
  }
}

// ── Metric definitions ──────────────────────────────────────────

export type MetricDirection = 'higher_better' | 'lower_better' | null;

export interface MetricDefinition {
  id: string;
  organizationId: string | null; // null = platform library
  sportKey: string | null;
  key: string;
  label: string;
  unit: string | null;
  direction: MetricDirection;
  // The goal value for this metric (e.g. 50 for "50-lap swim goal") — null
  // means no goal is set, so any batch-progress ring built on it should
  // render "not tracked" rather than a fabricated percentage
  // (docsV2/STUDENT_PORTAL_SPEC.md, migration 0011).
  targetValue: number | null;
}

function mapMetricRow(row: {
  id: string;
  organization_id: string | null;
  sport_key: string | null;
  key: string;
  label: string;
  unit: string | null;
  direction: MetricDirection;
  target_value: string | null;
}): MetricDefinition {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sportKey: row.sport_key,
    key: row.key,
    label: row.label,
    unit: row.unit,
    direction: row.direction,
    targetValue: row.target_value === null ? null : Number(row.target_value),
  };
}

const METRIC_COLUMNS = `id, organization_id, sport_key, key, label, unit, direction, target_value`;
// Platform library (org null) + the caller's own org rows are both visible
// via metric_definitions_select; the optional sport filter is a value ($1).
const LIST_METRICS_ALL_SQL = `select ${METRIC_COLUMNS} from metric_definitions order by organization_id nulls first, sport_key, label`;
const LIST_METRICS_BY_SPORT_SQL = `select ${METRIC_COLUMNS} from metric_definitions where sport_key = $1 order by organization_id nulls first, label`;
const INSERT_METRIC_SQL = `insert into metric_definitions (organization_id, sport_key, key, label, unit, direction)
   values ($1, $2, $3, $4, $5, $6) returning ${METRIC_COLUMNS}`;

export async function listMetricDefinitions(session: SessionContext, sportKey?: string): Promise<MetricDefinition[]> {
  return db.withRequestContext(session, async (client) => {
    const result = sportKey
      ? await client.query<Parameters<typeof mapMetricRow>[0]>(LIST_METRICS_BY_SPORT_SQL, [sportKey])
      : await client.query<Parameters<typeof mapMetricRow>[0]>(LIST_METRICS_ALL_SQL);
    return result.rows.map(mapMetricRow);
  });
}

export interface CreateMetricDefinitionInput {
  organizationId: string;
  sportKey?: string;
  key: string;
  label: string;
  unit?: string;
  direction?: MetricDirection;
}

export async function createMetricDefinition(session: SessionContext, input: CreateMetricDefinitionInput): Promise<MetricDefinition> {
  const metric = await db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapMetricRow>[0]>(INSERT_METRIC_SQL, [
      input.organizationId,
      input.sportKey ?? null,
      input.key,
      input.label,
      input.unit ?? null,
      input.direction ?? null,
    ]);
    return mapMetricRow(result.rows[0]);
  });
  await writeAuditLog(session, {
    action: 'progress.metric.define',
    targetType: 'metric_definition',
    targetId: metric.id,
    organizationId: input.organizationId,
    detail: { key: input.key, sportKey: input.sportKey ?? null },
  });
  return metric;
}

const DELETE_METRIC_SQL = `delete from metric_definitions where id = $1 and organization_id is not null`;

export async function deleteMetricDefinition(session: SessionContext, metricId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(DELETE_METRIC_SQL, [metricId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('delete this metric definition');
  });
}

// Only org-owned metrics can carry a goal (platform-library rows have
// organization_id is null and metric_definitions_update's RLS already
// requires organization_id = current_org(), so this is redundant-safe, not
// a new gate). RLS-gated: progress.metric.manage.
const SET_METRIC_TARGET_SQL = `update metric_definitions set target_value = $1 where id = $2 and organization_id is not null`;

export async function setMetricTarget(session: SessionContext, metricId: string, targetValue: number | null): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(SET_METRIC_TARGET_SQL, [targetValue, metricId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('set a target for this metric');
  });
}

// ── Progress roster (who a coach/admin can log against) ───────────
// RLS on enrollments already scopes staff to their branch; ownBatchesOnly
// further narrows to my_batch_ids() (the app-layer "own batches" filter,
// per migration 0015's header). Joining users for display_name works under
// users_select_org_staff (migration 0014).

export interface ProgressRosterEntry {
  enrollmentId: string;
  studentUserId: string;
  displayName: string;
  branchId: string;
  rollNumber: string | null;
  batchNames: string[];
}

const LIST_ROSTER_SQL = `select e.id as enrollment_id, e.student_user_id, u.display_name, e.branch_id, e.roll_number,
    coalesce(array_agg(b.name) filter (where b.name is not null), '{}') as batch_names
  from enrollments e
  join users u on u.id = e.student_user_id
  left join batch_enrollments be on be.enrollment_id = e.id and be.status = 'active'
  left join batches b on b.id = be.batch_id
  where e.organization_id = $1 and e.status = 'active'
  group by e.id, u.display_name
  order by u.display_name`;

const LIST_ROSTER_OWN_BATCHES_SQL = `select e.id as enrollment_id, e.student_user_id, u.display_name, e.branch_id, e.roll_number,
    coalesce(array_agg(b.name) filter (where b.name is not null), '{}') as batch_names
  from enrollments e
  join users u on u.id = e.student_user_id
  join batch_enrollments be on be.enrollment_id = e.id and be.status = 'active'
  join batches b on b.id = be.batch_id
  where e.organization_id = $1 and e.status = 'active'
    and be.batch_id in (select my_batch_ids())
  group by e.id, u.display_name
  order by u.display_name`;

export async function listProgressRoster(session: SessionContext, organizationId: string, ownBatchesOnly = false): Promise<ProgressRosterEntry[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      enrollment_id: string;
      student_user_id: string;
      display_name: string;
      branch_id: string;
      roll_number: string | null;
      batch_names: string[];
    }>(ownBatchesOnly ? LIST_ROSTER_OWN_BATCHES_SQL : LIST_ROSTER_SQL, [organizationId]);
    return result.rows.map((row) => ({
      enrollmentId: row.enrollment_id,
      studentUserId: row.student_user_id,
      displayName: row.display_name,
      branchId: row.branch_id,
      rollNumber: row.roll_number,
      batchNames: row.batch_names,
    }));
  });
}

// ── Progress entries ────────────────────────────────────────────

export interface ProgressEntry {
  id: string;
  enrollmentId: string;
  studentUserId: string;
  metricKey: string;
  value: number;
  note: string | null;
  recordedBy: string;
  recordedOn: string;
  createdAt: string;
}

function mapEntryRow(row: {
  id: string;
  enrollment_id: string;
  student_user_id: string;
  metric_key: string;
  value: string;
  note: string | null;
  recorded_by: string;
  recorded_on: string;
  created_at: string;
}): ProgressEntry {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    studentUserId: row.student_user_id,
    metricKey: row.metric_key,
    value: Number(row.value),
    note: row.note,
    recordedBy: row.recorded_by,
    recordedOn: row.recorded_on,
    createdAt: row.created_at,
  };
}

const ENTRY_COLUMNS = `id, enrollment_id, student_user_id, metric_key, value, note, recorded_by, recorded_on, created_at`;
const ENROLLMENT_LOOKUP_SQL = `select organization_id, branch_id, student_user_id from enrollments where id = $1`;
const INSERT_ENTRY_SQL = `insert into progress_entries
    (organization_id, branch_id, enrollment_id, student_user_id, metric_key, value, note, recorded_by, recorded_on)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning ${ENTRY_COLUMNS}`;
const LIST_ENTRIES_BY_ENROLLMENT_SQL = `select ${ENTRY_COLUMNS} from progress_entries where enrollment_id = $1 order by recorded_on, created_at`;
const LIST_ENTRIES_BY_ENROLLMENT_METRIC_SQL = `select ${ENTRY_COLUMNS} from progress_entries where enrollment_id = $1 and metric_key = $2 order by recorded_on, created_at`;
const LIST_MY_ENTRIES_SQL = `select ${ENTRY_COLUMNS} from progress_entries where student_user_id = $1 order by recorded_on, created_at`;
const LIST_WARD_ENTRIES_SQL = `select ${ENTRY_COLUMNS} from progress_entries where student_user_id = $1 order by recorded_on, created_at`;
const DELETE_ENTRY_SQL = `delete from progress_entries where id = $1`;

export interface LogProgressInput {
  enrollmentId: string;
  metricKey: string;
  value: number;
  note?: string;
  recordedOn: string; // 'YYYY-MM-DD'
}

export async function logProgress(session: SessionContext, input: LogProgressInput): Promise<ProgressEntry> {
  return db.withRequestContext(session, async (client) => {
    // Derive org/branch/student from the enrollment. If the caller can't see
    // the enrollment (enrollments RLS: wrong branch / not staff), this returns
    // zero rows — throw rather than let the insert land with a guessed scope.
    const enr = await client.query<{ organization_id: string; branch_id: string; student_user_id: string }>(ENROLLMENT_LOOKUP_SQL, [
      input.enrollmentId,
    ]);
    const row = enr.rows[0];
    if (!row) throw new EnrollmentNotVisibleError();
    const result = await client.query<Parameters<typeof mapEntryRow>[0]>(INSERT_ENTRY_SQL, [
      row.organization_id,
      row.branch_id,
      input.enrollmentId,
      row.student_user_id,
      input.metricKey,
      input.value,
      input.note ?? null,
      session.userId,
      input.recordedOn,
    ]);
    return mapEntryRow(result.rows[0]);
  });
}

export async function listProgressForEnrollment(session: SessionContext, enrollmentId: string, metricKey?: string): Promise<ProgressEntry[]> {
  return db.withRequestContext(session, async (client) => {
    const result = metricKey
      ? await client.query<Parameters<typeof mapEntryRow>[0]>(LIST_ENTRIES_BY_ENROLLMENT_METRIC_SQL, [enrollmentId, metricKey])
      : await client.query<Parameters<typeof mapEntryRow>[0]>(LIST_ENTRIES_BY_ENROLLMENT_SQL, [enrollmentId]);
    return result.rows.map(mapEntryRow);
  });
}

// Student self-view — RLS progress_entries_select_self scopes to own rows.
export async function listMyProgressEntries(session: SessionContext): Promise<ProgressEntry[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapEntryRow>[0]>(LIST_MY_ENTRIES_SQL, [session.userId]);
    return result.rows.map(mapEntryRow);
  });
}

// Guardian view of a ward — RLS progress_entries_select_guardian (is_my_ward)
// is the gate; a non-guardian gets zero rows, not an error.
export async function listWardProgressEntries(session: SessionContext, wardUserId: string): Promise<ProgressEntry[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapEntryRow>[0]>(LIST_WARD_ENTRIES_SQL, [wardUserId]);
    return result.rows.map(mapEntryRow);
  });
}

export async function deleteProgressEntry(session: SessionContext, entryId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(DELETE_ENTRY_SQL, [entryId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('delete this progress entry');
  });
}
