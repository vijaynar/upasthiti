// attendance module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: face_enrollments (128-dim, see migration 0010's header on the
// future 512-dim path), attendance_events, attendance_review_queue,
// staff_attendance_events (Doc 07 §8 + §21.2). Target phase: Phase 8 —
// Attendance. See migration 0010's header for the scope decisions (nullable
// embedding for tombstone-on-withdrawal, match_face()'s session-derived org
// fixing the V1 tenant-parameter gap, "own batches" as an app-layer filter).

import { db, queue } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';

export class NotAuthorizedError extends Error {
  constructor(action = 'perform this action') {
    super(`[attendance] You do not have permission to ${action}.`);
  }
}

// historical_backdating feature flag (migration 0007_seed_historical_backdating.sql)
// — see scheduling's backfillBatchSessions for the full rationale. Attendance's
// own base permissions (attendance.record/.override) still gate the write
// itself via RLS; this only additionally gates the recordedAt OVERRIDE param.
export class FeatureDisabledError extends Error {
  constructor(flagKey: string) {
    super(`[attendance] The "${flagKey}" feature is not enabled for this organization.`);
  }
}


// Same thresholds the archived V1 face-scan UI used (packages/common's
// FACE_MATCH_THRESHOLD_CONFIDENT/_REVIEW) — this phase reuses that UI's
// face-api.js integration wholesale (see migration 0010's header), so the
// thresholds it was tuned against carry over rather than being re-guessed.
export const FACE_MATCH_THRESHOLD_CONFIDENT = 0.75;
export const FACE_MATCH_THRESHOLD_REVIEW = 0.65;
export const FACE_EMBEDDING_DIMENSIONS = 128;

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

// ── Face enrollments ────────────────────────────────────────────

export interface FaceEnrollment {
  id: string;
  organizationId: string;
  enrollmentId: string | null;
  membershipId: string | null;
  consentId: string;
  qualityScore: number | null;
  sourcePath: string | null;
  createdAt: string;
}

function mapFaceEnrollmentRow(row: {
  id: string;
  organization_id: string;
  enrollment_id: string | null;
  membership_id: string | null;
  consent_id: string;
  quality_score: number | null;
  source_path: string | null;
  created_at: string;
}): FaceEnrollment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    enrollmentId: row.enrollment_id,
    membershipId: row.membership_id,
    consentId: row.consent_id,
    qualityScore: row.quality_score,
    sourcePath: row.source_path,
    createdAt: row.created_at,
  };
}

const FACE_ENROLLMENT_COLUMNS = `id, organization_id, enrollment_id, membership_id, consent_id, quality_score, source_path, created_at`;

const INSERT_FACE_ENROLLMENT_SQL = `insert into face_enrollments (organization_id, enrollment_id, membership_id, consent_id, embedding, quality_score, source_path)
   values ($1, $2, $3, $4, $5, $6, $7)
   returning ${FACE_ENROLLMENT_COLUMNS}`;

const SELECT_FACE_ENROLLMENTS_SQL = `select ${FACE_ENROLLMENT_COLUMNS} from face_enrollments
   where deleted_at is null
     and ($1::uuid is null or enrollment_id = $1)
     and ($2::uuid is null or membership_id = $2)
   order by created_at desc`;

export interface CreateFaceEnrollmentInput {
  organizationId: string;
  enrollmentId?: string;
  membershipId?: string;
  consentId: string;
  embedding: number[];
  qualityScore?: number;
  sourcePath?: string;
}

// RLS-gated (face_enrollments_insert_staff, migration 0010) — requires
// attendance.face.enroll at the subject's branch scope. The consent check
// (subject must hold an active biometric_face consent) is DB-enforced by
// face_enrollments_enforce_consent, not re-checked here.
export async function enrollFace(session: SessionContext, input: CreateFaceEnrollmentInput): Promise<FaceEnrollment> {
  if (input.embedding.length !== FACE_EMBEDDING_DIMENSIONS) {
    throw new Error(`embedding must have exactly ${FACE_EMBEDDING_DIMENSIONS} dimensions, got ${input.embedding.length}`);
  }
  if (input.embedding.some((v) => !Number.isFinite(v))) {
    throw new Error('embedding contains non-finite values (NaN or Infinity)');
  }
  if (Boolean(input.enrollmentId) === Boolean(input.membershipId)) {
    throw new Error('exactly one of enrollmentId or membershipId must be set');
  }

  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapFaceEnrollmentRow>[0]>(
      INSERT_FACE_ENROLLMENT_SQL,
      [
        input.organizationId,
        input.enrollmentId ?? null,
        input.membershipId ?? null,
        input.consentId,
        toVectorLiteral(input.embedding),
        input.qualityScore ?? null,
        input.sourcePath ?? null,
      ]
    );
    const enrollment = mapFaceEnrollmentRow(result.rows[0]);
    await ensurePurgeJobScheduled();
    return enrollment;
  });
}

export async function listFaceEnrollments(session: SessionContext, input: { enrollmentId?: string; membershipId?: string }): Promise<FaceEnrollment[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapFaceEnrollmentRow>[0]>(SELECT_FACE_ENROLLMENTS_SQL, [
      input.enrollmentId ?? null,
      input.membershipId ?? null,
    ]);
    return result.rows.map(mapFaceEnrollmentRow);
  });
}

// ── Face-bio status summary (Students page) ─────────────────────────
// One row per enrollment with at least one non-tombstoned face sample —
// avoids an N+1 listFaceEnrollments call per row in the Students table.
// Same silent-empty-join caveat as finance's getFeeStatusSummary: a caller
// without attendance.face.enroll at a branch sees every one of that
// branch's face_enrollments filtered out by RLS, so this reads as "every
// student missing face bio" rather than raising an authorization error.
const FACE_BIO_STATUS_SUMMARY_SQL = `select e.id as enrollment_id, bool_or(fe.id is not null) as enrolled
  from enrollments e
  left join face_enrollments fe on fe.enrollment_id = e.id and fe.deleted_at is null
  where e.organization_id = $1 and ($2::uuid is null or e.branch_id = $2)
  group by e.id`;

export interface FaceBioStatusEntry {
  enrollmentId: string;
  enrolled: boolean;
}

export async function getFaceBioStatusSummary(session: SessionContext, organizationId: string, branchId?: string): Promise<FaceBioStatusEntry[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ enrollment_id: string; enrolled: boolean }>(FACE_BIO_STATUS_SUMMARY_SQL, [organizationId, branchId ?? null]);
    return result.rows.map((row) => ({ enrollmentId: row.enrollment_id, enrolled: row.enrolled }));
  });
}

// Revokes one bad/stale sample (re-enrollment case) — distinct from the
// consent-withdrawal purge job, which is the compliance-driven path.
export async function deleteFaceEnrollment(session: SessionContext, faceEnrollmentId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(
      `update face_enrollments set deleted_at = now(), embedding = null where id = $1 and deleted_at is null`,
      [faceEnrollmentId]
    );
    if (result.rowCount === 0) throw new NotAuthorizedError('delete this face enrollment');
  });
}

// ── Face matching + check-in ────────────────────────────────────

export interface FaceMatch {
  enrollmentId: string;
  similarity: number;
}

// match_face() (migration 0010) is SECURITY DEFINER and derives org from
// current_org() — no tenant/org parameter here to pass through, closing the
// V1 gap where match_face_embedding took a caller-supplied p_tenant_id.
export async function matchFace(session: SessionContext, batchId: string, embedding: number[]): Promise<FaceMatch[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ enrollment_id: string; similarity: number }>(
      `select enrollment_id, similarity from match_face($1, $2, 3)`,
      [batchId, toVectorLiteral(embedding)]
    );
    return result.rows.map((r) => ({ enrollmentId: r.enrollment_id, similarity: r.similarity }));
  });
}

export type FaceCheckInOutcome =
  | { outcome: 'recorded'; event: AttendanceEvent }
  | { outcome: 'queued_for_review'; reviewQueueId: string; candidateEnrollmentId: string | null; confidence: number | null }
  | { outcome: 'no_match' };

// The core attendance engine (US-3): match against the batch's enrolled
// faces, then branch on confidence. >= CONFIDENT writes attendance_events
// directly; >= REVIEW (but below CONFIDENT) goes to attendance_review_queue
// and never auto-fines (US-3 AC2); below REVIEW is treated as no match
// (US-3 AC4 — the scanner falls back to "manual check-in required").
export async function checkInByFace(session: SessionContext, classSessionId: string, batchId: string, embedding: number[]): Promise<FaceCheckInOutcome> {
  const matches = await matchFace(session, batchId, embedding);
  const best = matches[0];

  if (!best || best.similarity < FACE_MATCH_THRESHOLD_REVIEW) {
    return { outcome: 'no_match' };
  }

  if (best.similarity >= FACE_MATCH_THRESHOLD_CONFIDENT) {
    const event = await recordAttendance(session, {
      classSessionId,
      enrollmentId: best.enrollmentId,
      status: 'present',
      method: 'face',
      confidence: best.similarity,
    });
    return { outcome: 'recorded', event };
  }

  return db.withRequestContext(session, async (client) => {
    const sessionRow = await client.query<{ organization_id: string; branch_id: string }>(
      `select organization_id, branch_id from class_sessions where id = $1`,
      [classSessionId]
    );
    const s = sessionRow.rows[0];
    if (!s) throw new Error('class session not found');

    const result = await client.query<{ id: string }>(
      `insert into attendance_review_queue (organization_id, branch_id, class_session_id, candidate_enrollment_id, confidence)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [s.organization_id, s.branch_id, classSessionId, best.enrollmentId, best.similarity]
    );
    return {
      outcome: 'queued_for_review',
      reviewQueueId: result.rows[0].id,
      candidateEnrollmentId: best.enrollmentId,
      confidence: best.similarity,
    };
  });
}

// ── Attendance events ────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export type AttendanceMethod = 'face' | 'qr' | 'manual' | 'override' | 'geofence';

export interface AttendanceEvent {
  id: string;
  organizationId: string;
  branchId: string;
  classSessionId: string;
  enrollmentId: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  confidence: number | null;
  recordedBy: string | null;
  recordedAt: string;
  supersededBy: string | null;
}

function mapAttendanceEventRow(row: {
  id: string;
  organization_id: string;
  branch_id: string;
  class_session_id: string;
  enrollment_id: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  confidence: number | null;
  recorded_by: string | null;
  recorded_at: string;
  superseded_by: string | null;
}): AttendanceEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    classSessionId: row.class_session_id,
    enrollmentId: row.enrollment_id,
    status: row.status,
    method: row.method,
    confidence: row.confidence,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
    supersededBy: row.superseded_by,
  };
}

const ATTENDANCE_EVENT_COLUMNS = `id, organization_id, branch_id, class_session_id, enrollment_id, status, method, confidence, recorded_by, recorded_at, superseded_by`;
const ATTENDANCE_EVENT_COLUMNS_AE = `ae.${ATTENDANCE_EVENT_COLUMNS.split(', ').join(', ae.')}`;

const SELECT_CLASS_SESSION_SCOPE_SQL = `select organization_id, branch_id from class_sessions where id = $1`;

const INSERT_ATTENDANCE_EVENT_SQL = `insert into attendance_events (organization_id, branch_id, class_session_id, enrollment_id, status, method, confidence, recorded_by, recorded_at)
   values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, now()))
   returning ${ATTENDANCE_EVENT_COLUMNS}`;

const INSERT_ATTENDANCE_OVERRIDE_SQL = `insert into attendance_events (organization_id, branch_id, class_session_id, enrollment_id, status, method, recorded_by, recorded_at)
   values ($1, $2, $3, $4, $5, 'override', $6, coalesce($7, now()))
   returning ${ATTENDANCE_EVENT_COLUMNS}`;

const SUPERSEDE_ATTENDANCE_EVENTS_SQL = `update attendance_events set superseded_by = $1
   where class_session_id = $2 and enrollment_id = $3 and superseded_by is null and id <> $1`;

const LIST_ATTENDANCE_EVENTS_SQL = `select ${ATTENDANCE_EVENT_COLUMNS} from attendance_events
   where class_session_id = $1 and superseded_by is null
   order by recorded_at`;

const LIST_ATTENDANCE_BY_STUDENT_SQL = `select ${ATTENDANCE_EVENT_COLUMNS_AE} from attendance_events ae
   join class_sessions cs on cs.id = ae.class_session_id
   where ae.enrollment_id in (select id from enrollments where student_user_id = $1)
     and ae.superseded_by is null
     and cs.session_date between $2 and $3
   order by ae.recorded_at desc`;

export interface RecordAttendanceInput {
  classSessionId: string;
  enrollmentId: string;
  status: AttendanceStatus;
  method: Exclude<AttendanceMethod, 'override'>;
  confidence?: number;
  // historical_backdating feature flag only (see FeatureDisabledError above) —
  // omit for normal real-time recording, zero extra query in that path.
  recordedAt?: string;
}

// RLS-gated (attendance_events_insert_staff, migration 0010) — requires
// attendance.record at the session's branch scope for method != 'override'.
// First-time record only; use overrideAttendance to correct an existing one.
export async function recordAttendance(session: SessionContext, input: RecordAttendanceInput): Promise<AttendanceEvent> {
  return db.withRequestContext(session, async (client) => {
    const sessionRow = await client.query<{ organization_id: string; branch_id: string }>(SELECT_CLASS_SESSION_SCOPE_SQL, [input.classSessionId]);
    const s = sessionRow.rows[0];
    if (!s) throw new Error('class session not found');

    if (input.recordedAt && !(await db.isOrgFeatureEnabled(s.organization_id, 'historical_backdating'))) {
      throw new FeatureDisabledError('historical_backdating');
    }

    const result = await client.query<Parameters<typeof mapAttendanceEventRow>[0]>(INSERT_ATTENDANCE_EVENT_SQL, [
      s.organization_id,
      s.branch_id,
      input.classSessionId,
      input.enrollmentId,
      input.status,
      input.method,
      input.confidence ?? null,
      session.userId,
      input.recordedAt ?? null,
    ]);
    const event = mapAttendanceEventRow(result.rows[0]);
    await ensureAbsenceEvalJobScheduled();
    return event;
  });
}

export interface OverrideAttendanceInput {
  classSessionId: string;
  enrollmentId: string;
  status: AttendanceStatus;
  recordedAt?: string; // historical_backdating feature flag only, see above
}

// Append-only correction (Doc 07 §8: "corrections append, never edit"):
// inserts a new method='override' row, then points every currently-live row
// for this (session, enrollment) at it via superseded_by. Requires
// attendance.override on both the insert and the update (migration 0010).
export async function overrideAttendance(session: SessionContext, input: OverrideAttendanceInput): Promise<AttendanceEvent> {
  return db.withRequestContext(session, async (client) => {
    const sessionRow = await client.query<{ organization_id: string; branch_id: string }>(SELECT_CLASS_SESSION_SCOPE_SQL, [input.classSessionId]);
    const s = sessionRow.rows[0];
    if (!s) throw new Error('class session not found');

    if (input.recordedAt && !(await db.isOrgFeatureEnabled(s.organization_id, 'historical_backdating'))) {
      throw new FeatureDisabledError('historical_backdating');
    }

    const inserted = await client.query<Parameters<typeof mapAttendanceEventRow>[0]>(INSERT_ATTENDANCE_OVERRIDE_SQL, [
      s.organization_id,
      s.branch_id,
      input.classSessionId,
      input.enrollmentId,
      input.status,
      session.userId,
      input.recordedAt ?? null,
    ]);
    const newEvent = inserted.rows[0];

    await client.query(SUPERSEDE_ATTENDANCE_EVENTS_SQL, [newEvent.id, input.classSessionId, input.enrollmentId]);

    return mapAttendanceEventRow(newEvent);
  });
}

export async function listAttendanceEvents(session: SessionContext, classSessionId: string): Promise<AttendanceEvent[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapAttendanceEventRow>[0]>(LIST_ATTENDANCE_EVENTS_SQL, [classSessionId]);
    return result.rows.map(mapAttendanceEventRow);
  });
}

export async function listMyAttendance(session: SessionContext, fromDate: string, toDate: string): Promise<AttendanceEvent[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapAttendanceEventRow>[0]>(LIST_ATTENDANCE_BY_STUDENT_SQL, [session.userId, fromDate, toDate]);
    return result.rows.map(mapAttendanceEventRow);
  });
}

export async function listWardAttendance(session: SessionContext, wardUserId: string, fromDate: string, toDate: string): Promise<AttendanceEvent[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapAttendanceEventRow>[0]>(LIST_ATTENDANCE_BY_STUDENT_SQL, [wardUserId, fromDate, toDate]);
    return result.rows.map(mapAttendanceEventRow);
  });
}

// ── Review queue ─────────────────────────────────────────────────

export type ReviewQueueStatus = 'pending' | 'confirmed' | 'rejected';

export interface ReviewQueueItem {
  id: string;
  organizationId: string;
  branchId: string;
  classSessionId: string;
  candidateEnrollmentId: string | null;
  confidence: number;
  sourcePath: string | null;
  status: ReviewQueueStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

function mapReviewQueueRow(row: {
  id: string;
  organization_id: string;
  branch_id: string;
  class_session_id: string;
  candidate_enrollment_id: string | null;
  confidence: number;
  source_path: string | null;
  status: ReviewQueueStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}): ReviewQueueItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    classSessionId: row.class_session_id,
    candidateEnrollmentId: row.candidate_enrollment_id,
    confidence: row.confidence,
    sourcePath: row.source_path,
    status: row.status,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

const REVIEW_QUEUE_COLUMNS = `id, organization_id, branch_id, class_session_id, candidate_enrollment_id, confidence, source_path, status, resolved_by, resolved_at, created_at`;
const SELECT_REVIEW_QUEUE_SQL = `select ${REVIEW_QUEUE_COLUMNS} from attendance_review_queue where organization_id = $1 and status = $2 order by created_at`;
const SELECT_REVIEW_QUEUE_ITEM_SQL = `select ${REVIEW_QUEUE_COLUMNS} from attendance_review_queue where id = $1 and status = 'pending'`;
const RESOLVE_REVIEW_QUEUE_ITEM_SQL = `update attendance_review_queue set status = $1, resolved_by = $2, resolved_at = now()
   where id = $3 and status = 'pending'
   returning ${REVIEW_QUEUE_COLUMNS}`;
const INSERT_ATTENDANCE_FROM_REVIEW_SQL = `insert into attendance_events (organization_id, branch_id, class_session_id, enrollment_id, status, method, confidence, recorded_by)
   values ($1, $2, $3, $4, 'present', 'face', $5, $6)`;

export async function listReviewQueue(session: SessionContext, organizationId: string, status: ReviewQueueStatus = 'pending'): Promise<ReviewQueueItem[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapReviewQueueRow>[0]>(SELECT_REVIEW_QUEUE_SQL, [organizationId, status]);
    return result.rows.map(mapReviewQueueRow);
  });
}

export interface ResolveReviewQueueInput {
  reviewQueueId: string;
  decision: 'confirmed' | 'rejected';
  enrollmentId?: string; // override the candidate if the resolver picks a different student
}

// Confirming writes the real attendance_events row (US-3 AC2: only a human
// confirmation turns a low-confidence match into a recorded present) —
// rejecting just closes the queue item, leaving the student unmarked (the
// grace-period absence job will pick them up as absent if nothing else
// records them).
export async function resolveReviewQueueItem(session: SessionContext, input: ResolveReviewQueueInput): Promise<ReviewQueueItem> {
  return db.withRequestContext(session, async (client) => {
    const itemResult = await client.query<Parameters<typeof mapReviewQueueRow>[0]>(SELECT_REVIEW_QUEUE_ITEM_SQL, [input.reviewQueueId]);
    const item = itemResult.rows[0];
    if (!item) throw new NotAuthorizedError('resolve this review queue item');

    const resolvedEnrollmentId = input.enrollmentId ?? item.candidate_enrollment_id;
    if (input.decision === 'confirmed' && !resolvedEnrollmentId) {
      throw new Error('an enrollmentId is required to confirm this item (no candidate was matched)');
    }

    const updateResult = await client.query<Parameters<typeof mapReviewQueueRow>[0]>(RESOLVE_REVIEW_QUEUE_ITEM_SQL, [
      input.decision,
      session.userId,
      input.reviewQueueId,
    ]);
    if (updateResult.rowCount === 0) throw new NotAuthorizedError('resolve this review queue item');

    if (input.decision === 'confirmed' && resolvedEnrollmentId) {
      await client.query(INSERT_ATTENDANCE_FROM_REVIEW_SQL, [
        item.organization_id,
        item.branch_id,
        item.class_session_id,
        resolvedEnrollmentId,
        item.confidence,
        session.userId,
      ]);
    }

    return mapReviewQueueRow(updateResult.rows[0]);
  });
}

// ── Staff self-attendance (Doc 07 §21.2) ─────────────────────────

export type StaffAttendanceKind = 'check_in' | 'check_out';
export type StaffAttendanceMethod = 'selfie_face' | 'manual' | 'admin_override';

export interface StaffAttendanceEvent {
  id: string;
  organizationId: string;
  branchId: string;
  membershipId: string;
  kind: StaffAttendanceKind;
  method: StaffAttendanceMethod;
  confidence: number | null;
  recordedBy: string | null;
  recordedAt: string;
}

function mapStaffAttendanceRow(row: {
  id: string;
  organization_id: string;
  branch_id: string;
  membership_id: string;
  kind: StaffAttendanceKind;
  method: StaffAttendanceMethod;
  confidence: number | null;
  recorded_by: string | null;
  recorded_at: string;
}): StaffAttendanceEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    membershipId: row.membership_id,
    kind: row.kind,
    method: row.method,
    confidence: row.confidence,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
  };
}

const STAFF_ATTENDANCE_COLUMNS = `id, organization_id, branch_id, membership_id, kind, method, confidence, recorded_by, recorded_at`;
const INSERT_STAFF_ATTENDANCE_SQL = `insert into staff_attendance_events (organization_id, branch_id, membership_id, kind, method, confidence, recorded_by)
   values ($1, $2, $3, $4, $5, $6, $7)
   returning ${STAFF_ATTENDANCE_COLUMNS}`;
const LIST_STAFF_ATTENDANCE_SQL = `select ${STAFF_ATTENDANCE_COLUMNS} from staff_attendance_events where membership_id = $1 order by recorded_at desc`;

export interface RecordStaffAttendanceInput {
  organizationId: string;
  branchId: string;
  membershipId: string;
  kind: StaffAttendanceKind;
  method: StaffAttendanceMethod;
  confidence?: number;
}

// RLS branches on method (migration 0010): self-insert (own membership,
// attendance.self_record) for selfie_face/manual, or attendance.override
// for admin_override.
export async function recordStaffAttendance(session: SessionContext, input: RecordStaffAttendanceInput): Promise<StaffAttendanceEvent> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapStaffAttendanceRow>[0]>(INSERT_STAFF_ATTENDANCE_SQL, [
      input.organizationId,
      input.branchId,
      input.membershipId,
      input.kind,
      input.method,
      input.confidence ?? null,
      session.userId,
    ]);
    return mapStaffAttendanceRow(result.rows[0]);
  });
}

export async function listStaffAttendance(session: SessionContext, membershipId: string): Promise<StaffAttendanceEvent[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapStaffAttendanceRow>[0]>(LIST_STAFF_ATTENDANCE_SQL, [membershipId]);
    return result.rows.map(mapStaffAttendanceRow);
  });
}

// ── Background jobs (service-role — see migration 0010's header) ────

// Absence evaluation (Doc 07 §7's grace_minutes, Doc 14 §8's "absence-alert
// evaluation (grace-period expiry)" job). Self-rescheduling every 5 minutes
// (Doc 14 §8: "time-critical absence alerts get a dedicated per-5-min
// cron") — the tight interval is what keeps the PRD's <5min parent-alert
// latency target reachable once Notifications (Phase 10) consumes the
// attendance.absence_confirmed event this emits.
const DUE_SESSIONS_SQL = `
  select cs.id as class_session_id, cs.organization_id, cs.branch_id, cs.batch_id
  from class_sessions cs
  join batches b on b.id = cs.batch_id
  where cs.status in ('scheduled', 'completed')
    and cs.starts_at + (b.grace_minutes || ' minutes')::interval <= now()
`;

const UNMARKED_ROSTER_SQL = `
  select be.enrollment_id
  from batch_enrollments be
  where be.batch_id = $1 and be.status = 'active'
    and not exists (
      select 1 from attendance_events ae
      where ae.class_session_id = $2 and ae.enrollment_id = be.enrollment_id and ae.superseded_by is null
    )
`;

export async function evaluateAbsences(): Promise<{ sessionsChecked: number; absencesMarked: number }> {
  const client = await db.getServiceClient();
  try {
    const sessionsResult = await client.query<{ class_session_id: string; organization_id: string; branch_id: string; batch_id: string }>(DUE_SESSIONS_SQL);
    let absencesMarked = 0;

    for (const s of sessionsResult.rows) {
      const unmarkedResult = await client.query<{ enrollment_id: string }>(UNMARKED_ROSTER_SQL, [s.batch_id, s.class_session_id]);
      for (const row of unmarkedResult.rows) {
        const inserted = await client.query<{ id: string }>(
          `insert into attendance_events (organization_id, branch_id, class_session_id, enrollment_id, status, method)
           values ($1, $2, $3, $4, 'absent', 'override')
           on conflict do nothing
           returning id`,
          [s.organization_id, s.branch_id, s.class_session_id, row.enrollment_id]
        );
        if (inserted.rows[0]) {
          absencesMarked += 1;
          await queue.enqueue('attendance.absence_confirmed', {
            organizationId: s.organization_id,
            branchId: s.branch_id,
            classSessionId: s.class_session_id,
            enrollmentId: row.enrollment_id,
            attendanceEventId: inserted.rows[0].id,
          });
        }
      }
    }

    return { sessionsChecked: sessionsResult.rows.length, absencesMarked };
  } finally {
    client.release();
  }
}

// Consent-withdrawal embedding purge (Doc 07 §8 prose: "Consent withdrawal
// of biometric_face triggers embedding deletion — enforced by a job,
// recorded in audit"; Doc 14 §8's "consent-withdrawal deletion (24h SLA)").
// Self-rescheduling every 6 hours — comfortably inside the 24h SLA even
// accounting for a missed/delayed run.
const WITHDRAWN_FACE_ENROLLMENTS_SQL = `
  select fe.id, fe.organization_id
  from face_enrollments fe
  join consents c on c.id = fe.consent_id
  where c.kind = 'biometric_face' and c.withdrawn_at is not null
    and fe.embedding is not null
`;

export async function purgeWithdrawnFaceEmbeddings(): Promise<{ purged: number }> {
  const client = await db.getServiceClient();
  try {
    const rows = await client.query<{ id: string; organization_id: string }>(WITHDRAWN_FACE_ENROLLMENTS_SQL);
    for (const row of rows.rows) {
      await client.query(`update face_enrollments set embedding = null, deleted_at = coalesce(deleted_at, now()) where id = $1`, [row.id]);
      await client.query(`select write_audit_log($1, $2, $3, $4)`, [
        'attendance.face_enrollment.purged',
        'face_enrollment',
        row.id,
        row.organization_id,
      ]);
    }
    return { purged: rows.rows.length };
  } finally {
    client.release();
  }
}

export async function ensureAbsenceEvalJobScheduled(): Promise<void> {
  const runAt = new Date(Date.now() + 5 * 60 * 1000);
  await queue.enqueue('attendance.evaluate_absences', {}, { runAt, idempotencyKey: `attendance.evaluate_absences:${runAt.toISOString().slice(0, 16)}` });
}

export async function ensurePurgeJobScheduled(): Promise<void> {
  const runAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
  await queue.enqueue('attendance.purge_withdrawn_face_embeddings', {}, {
    runAt,
    idempotencyKey: `attendance.purge_withdrawn_face_embeddings:${runAt.toISOString().slice(0, 13)}`,
  });
}
