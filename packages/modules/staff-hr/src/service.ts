// staff-hr module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: staff_profiles, staff_documents, staff_availability, leave_requests, payout_settings, coach onboarding paths (M10, Doc 07 §12)
// Target phase: Phase 12 — Coach & Staff HR (see the implementation roadmap).
//
// See migration 0014's header for scope decisions (two permission keys
// added beyond the Doc 04 §4 catalogue, document review not gating role
// activation, leave withdrawal-by-delete instead of a status trigger).
// RLS is the real gate throughout — every write here runs under
// db.withRequestContext(session, ...), same pattern as scheduling/finance;
// UPDATE/DELETE denials surface as rowCount === 0 (RLS filters rows rather
// than throwing), INSERT denials throw Postgres 42501 for the route's
// isRlsDenied() to catch.

import { db } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';
import { writeAuditLog } from '@abhyas/module-audit';

export class NotAuthorizedError extends Error {
  constructor(action = 'perform this action') {
    super(`[staff-hr] You do not have permission to ${action}.`);
  }
}

export class StaffStateError extends Error {
  constructor(reason: string) {
    super(`[staff-hr] ${reason}`);
  }
}

// ── Staff profiles ──────────────────────────────────────────────

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'volunteer';
export type StaffStatus = 'active' | 'on_leave' | 'offboarded';

export interface StaffProfile {
  id: string;
  organizationId: string;
  branchId: string | null;
  membershipId: string;
  userId: string;
  displayName: string;
  designation: string | null;
  employmentType: EmploymentType;
  status: StaffStatus;
  notes: string | null;
  createdAt: string;
}

function mapStaffProfileRow(row: {
  id: string;
  organization_id: string;
  branch_id: string | null;
  membership_id: string;
  user_id: string;
  display_name: string;
  designation: string | null;
  employment_type: EmploymentType;
  status: StaffStatus;
  notes: string | null;
  created_at: string;
}): StaffProfile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    membershipId: row.membership_id,
    userId: row.user_id,
    displayName: row.display_name,
    designation: row.designation,
    employmentType: row.employment_type,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

const STAFF_PROFILE_COLUMNS = `sp.id, sp.organization_id, sp.branch_id, sp.membership_id, sp.user_id,
  u.display_name, sp.designation, sp.employment_type, sp.status, sp.notes, sp.created_at`;

// Built in variables, not inline in the .query() calls, so the lint rule
// against interpolated .query() template literals (Doc 13 §9 A03) doesn't
// flag it — every `${}` piece here is a static column-list constant, never
// a value; every actual value still flows through the params array.
const LIST_STAFF_PROFILES_SQL = `select ${STAFF_PROFILE_COLUMNS} from staff_profiles sp join users u on u.id = sp.user_id
   where sp.organization_id = $1 order by u.display_name`;

export async function listStaffProfiles(session: SessionContext, organizationId: string): Promise<StaffProfile[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapStaffProfileRow>[0]>(LIST_STAFF_PROFILES_SQL, [organizationId]);
    return result.rows.map(mapStaffProfileRow);
  });
}

const GET_MY_STAFF_PROFILE_SQL = `select ${STAFF_PROFILE_COLUMNS} from staff_profiles sp join users u on u.id = sp.user_id
   where sp.user_id = $1 and sp.organization_id = $2`;

export async function getMyStaffProfile(session: SessionContext): Promise<StaffProfile | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapStaffProfileRow>[0]>(GET_MY_STAFF_PROFILE_SQL, [session.userId, session.orgId]);
    return result.rows[0] ? mapStaffProfileRow(result.rows[0]) : null;
  });
}

export interface OnboardableMember {
  membershipId: string;
  userId: string;
  displayName: string;
  branchId: string | null;
  roleKeys: string[];
}

// Active org members with no staff_profiles row yet — the picker behind
// "onboard staff" (org-initiated onboarding path 1, Doc 04 §8; the invite
// itself already happened via tenancy-rbac in an earlier phase). roleKeys
// lets the UI decide whether to follow up with the coach-profile wizard
// (Doc 04 §8 unification, migration 0016) for a coach/assistant_coach member.
export async function listOnboardableMembers(session: SessionContext, organizationId: string): Promise<OnboardableMember[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ membership_id: string; user_id: string; display_name: string; branch_id: string | null; role_keys: string[] }>(
      `select m.id as membership_id, m.user_id, u.display_name, m.branch_id,
         coalesce(array_agg(r.key) filter (where r.key is not null), '{}') as role_keys
       from memberships m
       join users u on u.id = m.user_id
       left join staff_profiles sp on sp.membership_id = m.id
       left join membership_roles mr on mr.membership_id = m.id
       left join roles r on r.id = mr.role_id
       where m.organization_id = $1 and m.status = 'active' and sp.id is null
       group by m.id, u.display_name, m.branch_id
       order by u.display_name`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      membershipId: row.membership_id,
      userId: row.user_id,
      displayName: row.display_name,
      branchId: row.branch_id,
      roleKeys: row.role_keys ?? [],
    }));
  });
}

export interface OnboardStaffInput {
  organizationId: string;
  membershipId: string;
  designation?: string;
  employmentType?: EmploymentType;
  notes?: string;
}

export async function onboardStaff(session: SessionContext, input: OnboardStaffInput): Promise<StaffProfile> {
  const profile = await db.withRequestContext(session, async (client) => {
    const membership = await client.query<{ user_id: string; branch_id: string | null }>(
      `select user_id, branch_id from memberships where id = $1 and organization_id = $2 and status = 'active'`,
      [input.membershipId, input.organizationId]
    );
    const row = membership.rows[0];
    if (!row) throw new StaffStateError('That member could not be found in this organization.');

    const inserted = await client.query<{ id: string }>(
      `insert into staff_profiles (organization_id, branch_id, membership_id, user_id, designation, employment_type, notes, onboarded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        input.organizationId,
        row.branch_id,
        input.membershipId,
        row.user_id,
        input.designation ?? null,
        input.employmentType ?? 'full_time',
        input.notes ?? null,
        session.userId,
      ]
    );
    return inserted.rows[0].id;
  });

  await writeAuditLog(session, {
    action: 'hr.staff.onboard',
    targetType: 'staff_profile',
    targetId: profile,
    organizationId: input.organizationId,
    detail: { membershipId: input.membershipId },
  });

  const GET_STAFF_PROFILE_BY_ID_SQL = `select ${STAFF_PROFILE_COLUMNS} from staff_profiles sp join users u on u.id = sp.user_id where sp.id = $1`;
  const result = await db.withRequestContext(session, (client) =>
    client.query<Parameters<typeof mapStaffProfileRow>[0]>(GET_STAFF_PROFILE_BY_ID_SQL, [profile])
  );
  return mapStaffProfileRow(result.rows[0]);
}

export interface UpdateStaffProfileInput {
  designation?: string | null;
  employmentType?: EmploymentType;
  status?: StaffStatus;
  notes?: string | null;
}

export async function updateStaffProfile(session: SessionContext, staffProfileId: string, patch: UpdateStaffProfileInput): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(
      `update staff_profiles set
         designation = coalesce($2, designation),
         employment_type = coalesce($3, employment_type),
         status = coalesce($4, status),
         notes = coalesce($5, notes)
       where id = $1`,
      [staffProfileId, patch.designation ?? null, patch.employmentType ?? null, patch.status ?? null, patch.notes ?? null]
    );
    if (result.rowCount === 0) throw new NotAuthorizedError('update this staff profile');
  });
}

export async function offboardStaff(session: SessionContext, staffProfileId: string): Promise<void> {
  await updateStaffProfile(session, staffProfileId, { status: 'offboarded' });
  await writeAuditLog(session, { action: 'hr.staff.offboard', targetType: 'staff_profile', targetId: staffProfileId });
}

// ── Staff documents ──────────────────────────────────────────────

export type DocType = 'id_proof' | 'address_proof' | 'certification' | 'background_check' | 'other';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface StaffDocument {
  id: string;
  staffProfileId: string;
  docType: DocType;
  storagePath: string;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

function mapDocumentRow(row: {
  id: string;
  staff_profile_id: string;
  doc_type: DocType;
  storage_path: string;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}): StaffDocument {
  return {
    id: row.id,
    staffProfileId: row.staff_profile_id,
    docType: row.doc_type,
    storagePath: row.storage_path,
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
  };
}

const DOCUMENT_COLUMNS = `id, staff_profile_id, doc_type, storage_path, review_status, reviewed_by, reviewed_at, review_note, created_at`;
const LIST_STAFF_DOCUMENTS_SQL = `select ${DOCUMENT_COLUMNS} from staff_documents where staff_profile_id = $1 order by created_at desc`;
const INSERT_STAFF_DOCUMENT_SQL = `insert into staff_documents (staff_profile_id, organization_id, branch_id, user_id, doc_type, storage_path)
   values ($1, $2, $3, $4, $5, $6)
   returning ${DOCUMENT_COLUMNS}`;

export async function listStaffDocuments(session: SessionContext, staffProfileId: string): Promise<StaffDocument[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapDocumentRow>[0]>(LIST_STAFF_DOCUMENTS_SQL, [staffProfileId]);
    return result.rows.map(mapDocumentRow);
  });
}

export interface UploadStaffDocumentInput {
  staffProfileId: string;
  docType: DocType;
  storagePath: string;
}

// Resolves which user a staff_profile belongs to, gated by the same
// staff_profiles RLS (self OR hr.staff.*) uploadStaffDocument already relies
// on — used by the documents upload-url route to scope a signed Storage
// path to the right user/{id}/... prefix before any staff_documents row
// exists (an admin can be uploading for a member who's had a staff_profiles
// row for a while; the document row itself is only inserted afterward).
export async function resolveStaffProfileOwner(session: SessionContext, staffProfileId: string): Promise<{ userId: string } | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ user_id: string }>(`select user_id from staff_profiles where id = $1`, [staffProfileId]);
    return result.rows[0] ? { userId: result.rows[0].user_id } : null;
  });
}

export async function uploadStaffDocument(session: SessionContext, input: UploadStaffDocumentInput): Promise<StaffDocument> {
  return db.withRequestContext(session, async (client) => {
    const profile = await client.query<{ organization_id: string; branch_id: string | null; user_id: string }>(
      `select organization_id, branch_id, user_id from staff_profiles where id = $1`,
      [input.staffProfileId]
    );
    const row = profile.rows[0];
    if (!row) throw new StaffStateError('Staff profile not found.');
    const result = await client.query<Parameters<typeof mapDocumentRow>[0]>(INSERT_STAFF_DOCUMENT_SQL, [
      input.staffProfileId,
      row.organization_id,
      row.branch_id,
      row.user_id,
      input.docType,
      input.storagePath,
    ]);
    return mapDocumentRow(result.rows[0]);
  });
}

export type DocumentDecision = 'approved' | 'rejected';

export async function reviewStaffDocument(
  session: SessionContext,
  documentId: string,
  decision: DocumentDecision,
  note?: string
): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(
      `update staff_documents set review_status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4 where id = $1`,
      [documentId, decision, session.userId, note ?? null]
    );
    if (result.rowCount === 0) throw new NotAuthorizedError('review this document');
  });
  await writeAuditLog(session, {
    action: decision === 'approved' ? 'hr.document.approve' : 'hr.document.reject',
    targetType: 'staff_document',
    targetId: documentId,
    detail: note ? { note } : null,
  });
}

export async function deleteStaffDocument(session: SessionContext, documentId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(`delete from staff_documents where id = $1`, [documentId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('delete this document');
  });
}

// ── Staff availability (self-authored weekly slots) ───────────────

export interface AvailabilitySlot {
  id: string;
  staffProfileId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

function mapAvailabilityRow(row: { id: string; staff_profile_id: string; day_of_week: number; start_time: string; end_time: string }): AvailabilitySlot {
  return { id: row.id, staffProfileId: row.staff_profile_id, dayOfWeek: row.day_of_week, startTime: row.start_time, endTime: row.end_time };
}

export async function listAvailability(session: SessionContext, staffProfileId: string): Promise<AvailabilitySlot[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapAvailabilityRow>[0]>(
      `select id, staff_profile_id, day_of_week, start_time, end_time from staff_availability
       where staff_profile_id = $1 order by day_of_week, start_time`,
      [staffProfileId]
    );
    return result.rows.map(mapAvailabilityRow);
  });
}

export interface SetAvailabilityInput {
  staffProfileId: string;
  slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
}

// Bulk rewrite (delete + insert) in one request context — withRequestContext
// wraps a single transaction (Doc 02 §9 provisioning precedent), so this is
// atomic without a separate BEGIN/COMMIT.
export async function setAvailability(session: SessionContext, input: SetAvailabilityInput): Promise<AvailabilitySlot[]> {
  return db.withRequestContext(session, async (client) => {
    const profile = await client.query<{ organization_id: string; branch_id: string | null; user_id: string }>(
      `select organization_id, branch_id, user_id from staff_profiles where id = $1`,
      [input.staffProfileId]
    );
    const row = profile.rows[0];
    if (!row) throw new StaffStateError('Staff profile not found.');

    await client.query(`delete from staff_availability where staff_profile_id = $1`, [input.staffProfileId]);

    const inserted: Parameters<typeof mapAvailabilityRow>[0][] = [];
    for (const slot of input.slots) {
      const result = await client.query<Parameters<typeof mapAvailabilityRow>[0]>(
        `insert into staff_availability (staff_profile_id, organization_id, branch_id, user_id, day_of_week, start_time, end_time)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, staff_profile_id, day_of_week, start_time, end_time`,
        [input.staffProfileId, row.organization_id, row.branch_id, row.user_id, slot.dayOfWeek, slot.startTime, slot.endTime]
      );
      inserted.push(result.rows[0]);
    }
    return inserted.map(mapAvailabilityRow);
  });
}

// ── Leave requests ──────────────────────────────────────────────

export type LeaveKind = 'sick' | 'casual' | 'earned' | 'unpaid' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  staffProfileId: string;
  kind: LeaveKind;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  status: LeaveStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

function mapLeaveRow(row: {
  id: string;
  staff_profile_id: string;
  kind: LeaveKind;
  starts_on: string;
  ends_on: string;
  reason: string | null;
  status: LeaveStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}): LeaveRequest {
  return {
    id: row.id,
    staffProfileId: row.staff_profile_id,
    kind: row.kind,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    reason: row.reason,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
  };
}

const LEAVE_COLUMNS = `id, staff_profile_id, kind, starts_on, ends_on, reason, status, decided_by, decided_at, decision_note, created_at`;
const INSERT_LEAVE_REQUEST_SQL = `insert into leave_requests (staff_profile_id, organization_id, branch_id, user_id, kind, starts_on, ends_on, reason)
   values ($1, $2, $3, $4, $5, $6, $7, $8)
   returning ${LEAVE_COLUMNS}`;

export async function listLeaveRequests(session: SessionContext, organizationId: string, status?: LeaveStatus): Promise<LeaveRequest[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapLeaveRow>[0]>(
      status
        ? `select ${LEAVE_COLUMNS} from leave_requests where organization_id = $1 and status = $2 order by created_at desc`
        : `select ${LEAVE_COLUMNS} from leave_requests where organization_id = $1 order by created_at desc`,
      status ? [organizationId, status] : [organizationId]
    );
    return result.rows.map(mapLeaveRow);
  });
}

const LIST_MY_LEAVE_REQUESTS_SQL = `select ${LEAVE_COLUMNS} from leave_requests where user_id = $1 order by created_at desc`;

export async function listMyLeaveRequests(session: SessionContext): Promise<LeaveRequest[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapLeaveRow>[0]>(LIST_MY_LEAVE_REQUESTS_SQL, [session.userId]);
    return result.rows.map(mapLeaveRow);
  });
}

export interface RequestLeaveInput {
  staffProfileId: string;
  kind: LeaveKind;
  startsOn: string;
  endsOn: string;
  reason?: string;
}

export async function requestLeave(session: SessionContext, input: RequestLeaveInput): Promise<LeaveRequest> {
  return db.withRequestContext(session, async (client) => {
    const profile = await client.query<{ organization_id: string; branch_id: string | null; user_id: string }>(
      `select organization_id, branch_id, user_id from staff_profiles where id = $1`,
      [input.staffProfileId]
    );
    const row = profile.rows[0];
    if (!row) throw new StaffStateError('Staff profile not found.');
    const result = await client.query<Parameters<typeof mapLeaveRow>[0]>(INSERT_LEAVE_REQUEST_SQL, [
      input.staffProfileId,
      row.organization_id,
      row.branch_id,
      row.user_id,
      input.kind,
      input.startsOn,
      input.endsOn,
      input.reason ?? null,
    ]);
    return mapLeaveRow(result.rows[0]);
  });
}

export async function cancelLeaveRequest(session: SessionContext, leaveRequestId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(`delete from leave_requests where id = $1`, [leaveRequestId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('cancel this leave request');
  });
}

export type LeaveDecision = 'approved' | 'rejected';

export async function decideLeaveRequest(
  session: SessionContext,
  leaveRequestId: string,
  decision: LeaveDecision,
  note?: string
): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const before = await client.query<{ status: LeaveStatus }>(`select status from leave_requests where id = $1`, [leaveRequestId]);
    if (!before.rows[0]) throw new NotAuthorizedError('decide this leave request');
    if (before.rows[0].status !== 'pending') throw new StaffStateError('Only a pending leave request can be decided.');
    const result = await client.query(
      `update leave_requests set status = $2, decided_by = $3, decided_at = now(), decision_note = $4 where id = $1`,
      [leaveRequestId, decision, session.userId, note ?? null]
    );
    if (result.rowCount === 0) throw new NotAuthorizedError('decide this leave request');
  });
  await writeAuditLog(session, {
    action: decision === 'approved' ? 'hr.leave.approve' : 'hr.leave.reject',
    targetType: 'leave_request',
    targetId: leaveRequestId,
    detail: note ? { note } : null,
  });
}

// ── Payout settings ──────────────────────────────────────────────

export type PayType = 'salary' | 'commission' | 'hourly';

export interface PayoutSettings {
  id: string;
  staffProfileId: string;
  payType: PayType;
  amountMinor: number | null;
  currency: string;
  commissionPct: number | null;
  notes: string | null;
  updatedAt: string;
}

function mapPayoutRow(row: {
  id: string;
  staff_profile_id: string;
  pay_type: PayType;
  amount_minor: string | null;
  currency: string;
  commission_pct: string | null;
  notes: string | null;
  updated_at: string;
}): PayoutSettings {
  return {
    id: row.id,
    staffProfileId: row.staff_profile_id,
    payType: row.pay_type,
    amountMinor: row.amount_minor === null ? null : Number(row.amount_minor),
    currency: row.currency,
    commissionPct: row.commission_pct === null ? null : Number(row.commission_pct),
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

const PAYOUT_COLUMNS = `id, staff_profile_id, pay_type, amount_minor, currency, commission_pct, notes, updated_at`;
const GET_PAYOUT_SETTINGS_SQL = `select ${PAYOUT_COLUMNS} from payout_settings where staff_profile_id = $1`;
const GET_MY_PAYOUT_SETTINGS_SQL = `select ${PAYOUT_COLUMNS} from payout_settings where user_id = $1`;
const UPSERT_PAYOUT_SETTINGS_SQL = `insert into payout_settings (staff_profile_id, organization_id, branch_id, user_id, pay_type, amount_minor, currency, commission_pct, notes, updated_by)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
   on conflict (staff_profile_id) do update set
     pay_type = excluded.pay_type, amount_minor = excluded.amount_minor, currency = excluded.currency,
     commission_pct = excluded.commission_pct, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now()
   returning ${PAYOUT_COLUMNS}`;

export async function getPayoutSettings(session: SessionContext, staffProfileId: string): Promise<PayoutSettings | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapPayoutRow>[0]>(GET_PAYOUT_SETTINGS_SQL, [staffProfileId]);
    return result.rows[0] ? mapPayoutRow(result.rows[0]) : null;
  });
}

export async function getMyPayoutSettings(session: SessionContext): Promise<PayoutSettings | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapPayoutRow>[0]>(GET_MY_PAYOUT_SETTINGS_SQL, [session.userId]);
    return result.rows[0] ? mapPayoutRow(result.rows[0]) : null;
  });
}

export interface SetPayoutSettingsInput {
  staffProfileId: string;
  payType: PayType;
  amountMinor?: number;
  currency?: string;
  commissionPct?: number;
  notes?: string;
}

// ── Coach profiles (Doc 04 §8 unification, migration 0016) ─────────
// The professional-profile step shared by all four coach onboarding paths
// (self-serve independent, invited, org-added, platform-invited) — layered
// on top of staff_profiles rather than duplicating designation/employment
// fields. One row per staff_profile (1:1), self- or staff-writable per the
// same RLS shape as staff_documents.

export interface CoachProfile {
  id: string;
  staffProfileId: string;
  organizationId: string;
  branchId: string | null;
  userId: string;
  bio: string | null;
  experienceYears: number | null;
  qualification: string | null;
  languagesKnown: string[];
  ageGroups: string[];
  skillLevels: string[];
  serviceTypes: string[];
  classTypes: string[];
  serviceAreaKeys: string[];
  allowStudentOverrides: boolean;
  categoryId: string | null;
  subcategoryIds: string[];
  primarySubcategoryId: string | null;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

function mapCoachProfileRow(row: {
  id: string;
  staff_profile_id: string;
  organization_id: string;
  branch_id: string | null;
  user_id: string;
  bio: string | null;
  experience_years: number | null;
  qualification: string | null;
  languages_known: string[];
  age_groups: string[];
  skill_levels: string[];
  service_types: string[];
  class_types: string[];
  service_area_keys: string[];
  allow_student_overrides: boolean;
  category_id: string | null;
  subcategory_ids: string[];
  primary_subcategory_id: string | null;
  tag_ids: string[];
  created_at: string;
  updated_at: string;
}): CoachProfile {
  return {
    id: row.id,
    staffProfileId: row.staff_profile_id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    userId: row.user_id,
    bio: row.bio,
    experienceYears: row.experience_years,
    qualification: row.qualification,
    languagesKnown: row.languages_known ?? [],
    ageGroups: row.age_groups ?? [],
    skillLevels: row.skill_levels ?? [],
    serviceTypes: row.service_types ?? [],
    classTypes: row.class_types ?? [],
    serviceAreaKeys: row.service_area_keys ?? [],
    allowStudentOverrides: row.allow_student_overrides ?? false,
    categoryId: row.category_id,
    subcategoryIds: row.subcategory_ids ?? [],
    primarySubcategoryId: row.primary_subcategory_id,
    tagIds: row.tag_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COACH_PROFILE_COLUMNS = `id, staff_profile_id, organization_id, branch_id, user_id, bio, experience_years,
  qualification, languages_known, age_groups, skill_levels, service_types, class_types,
  service_area_keys, allow_student_overrides, category_id, subcategory_ids, primary_subcategory_id, tag_ids,
  created_at, updated_at`;
const GET_COACH_PROFILE_SQL = `select ${COACH_PROFILE_COLUMNS} from coach_profiles where staff_profile_id = $1`;
const GET_MY_COACH_PROFILE_SQL = `select ${COACH_PROFILE_COLUMNS} from coach_profiles where user_id = $1 and organization_id = $2`;

export async function getCoachProfile(session: SessionContext, staffProfileId: string): Promise<CoachProfile | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapCoachProfileRow>[0]>(GET_COACH_PROFILE_SQL, [staffProfileId]);
    return result.rows[0] ? mapCoachProfileRow(result.rows[0]) : null;
  });
}

export async function getMyCoachProfile(session: SessionContext): Promise<CoachProfile | null> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapCoachProfileRow>[0]>(GET_MY_COACH_PROFILE_SQL, [session.userId, session.orgId]);
    return result.rows[0] ? mapCoachProfileRow(result.rows[0]) : null;
  });
}

export interface UpsertCoachProfileInput {
  staffProfileId: string;
  bio?: string;
  experienceYears?: number;
  qualification?: string;
  languagesKnown?: string[];
  ageGroups?: string[];
  skillLevels?: string[];
  serviceTypes?: string[];
  classTypes?: string[];
  serviceAreaKeys?: string[];
  allowStudentOverrides?: boolean;
  categoryId?: string | null;
  subcategoryIds?: string[];
  primarySubcategoryId?: string | null;
  tagIds?: string[];
}

const UPSERT_COACH_PROFILE_SQL = `insert into coach_profiles
    (staff_profile_id, organization_id, branch_id, user_id, bio, experience_years, qualification,
     languages_known, age_groups, skill_levels, service_types, class_types,
     service_area_keys, allow_student_overrides, category_id, subcategory_ids, primary_subcategory_id, tag_ids)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
   on conflict (staff_profile_id) do update set
     bio = excluded.bio, experience_years = excluded.experience_years, qualification = excluded.qualification,
     languages_known = excluded.languages_known, age_groups = excluded.age_groups,
     skill_levels = excluded.skill_levels, service_types = excluded.service_types, class_types = excluded.class_types,
     service_area_keys = excluded.service_area_keys, allow_student_overrides = excluded.allow_student_overrides,
     category_id = excluded.category_id, subcategory_ids = excluded.subcategory_ids,
     primary_subcategory_id = excluded.primary_subcategory_id, tag_ids = excluded.tag_ids,
     updated_at = now()
   returning ${COACH_PROFILE_COLUMNS}`;

// Used both by a coach editing their own profile (RLS: coach_profiles_*_self)
// and an HR admin filling it out on a member's behalf (RLS: coach_profiles_*_staff,
// hr.staff.onboard) — same function, the row-owning staff_profile decides which
// policy applies, matching uploadStaffDocument's shape above.
export async function upsertCoachProfile(session: SessionContext, input: UpsertCoachProfileInput): Promise<CoachProfile> {
  return db.withRequestContext(session, async (client) => {
    const profile = await client.query<{ organization_id: string; branch_id: string | null; user_id: string }>(
      `select organization_id, branch_id, user_id from staff_profiles where id = $1`,
      [input.staffProfileId]
    );
    const row = profile.rows[0];
    if (!row) throw new StaffStateError('Staff profile not found.');

    const result = await client.query<Parameters<typeof mapCoachProfileRow>[0]>(UPSERT_COACH_PROFILE_SQL, [
      input.staffProfileId,
      row.organization_id,
      row.branch_id,
      row.user_id,
      input.bio ?? null,
      input.experienceYears ?? null,
      input.qualification ?? null,
      input.languagesKnown ?? [],
      input.ageGroups ?? [],
      input.skillLevels ?? [],
      input.serviceTypes ?? [],
      input.classTypes ?? [],
      input.serviceAreaKeys ?? [],
      input.allowStudentOverrides ?? false,
      input.categoryId ?? null,
      input.subcategoryIds ?? [],
      input.primarySubcategoryId ?? null,
      input.tagIds ?? [],
    ]);
    return mapCoachProfileRow(result.rows[0]);
  });
}

export interface SelfOnboardAsCoachInput {
  organizationId: string;
  bio?: string;
  experienceYears?: number;
  qualification?: string;
  languagesKnown?: string[];
  ageGroups?: string[];
  skillLevels?: string[];
  serviceTypes?: string[];
  classTypes?: string[];
  serviceAreaKeys?: string[];
  allowStudentOverrides?: boolean;
  categoryId?: string | null;
  subcategoryIds?: string[];
  primarySubcategoryId?: string | null;
  tagIds?: string[];
}

// The one call the coach-profile wizard makes in "self" mode — covers both
// Doc 04 §8 path 3 (independent coach, brand-new org) and a just-invited
// coach completing their own profile in an academy: creates the caller's
// own staff_profiles row if one doesn't exist yet (staff_profiles_insert_self,
// migration 0016), then upserts coach_profiles on top of it. One
// withRequestContext call = one transaction (Doc 02 §9 provisioning
// precedent), so a failure partway leaves neither row behind.
export async function selfOnboardAsCoach(session: SessionContext, input: SelfOnboardAsCoachInput): Promise<CoachProfile> {
  const staffProfileId = await db.withRequestContext(session, async (client) => {
    const membership = await client.query<{ id: string; branch_id: string | null }>(
      `select id, branch_id from memberships where user_id = $1 and organization_id = $2 and status = 'active'`,
      [session.userId, input.organizationId]
    );
    const membershipRow = membership.rows[0];
    if (!membershipRow) throw new StaffStateError('You are not an active member of this organization.');

    const existing = await client.query<{ id: string }>(
      `select id from staff_profiles where user_id = $1 and organization_id = $2`,
      [session.userId, input.organizationId]
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const inserted = await client.query<{ id: string }>(
      `insert into staff_profiles (organization_id, branch_id, membership_id, user_id, employment_type, onboarded_by)
       values ($1, $2, $3, $4, 'full_time', $4)
       returning id`,
      [input.organizationId, membershipRow.branch_id, membershipRow.id, session.userId]
    );
    return inserted.rows[0].id;
  });

  return upsertCoachProfile(session, { staffProfileId, ...input });
}

// ── Coach pricing (Doc 04 §8, migration 0018) — how STUDENTS pay THIS
// coach. Mirrors V1's coach_pricing_policies/coach_pricing_rules 1:many
// shape (one row per enabled strategy; 'package' can have several tiers).
// Whole-selection replace on every save, same as the wizard's V1 ancestor —
// this is onboarding-step data re-submitted as a unit, not an incremental
// ledger.

export type PricingPolicyType =
  | 'monthly_subscription' | 'per_class' | 'package' | 'trial_session' | 'fine_based' | 'one_time_registration';

export interface PricingRule {
  amount: number;
  currency?: string;
  billingCycle?: 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
  autoRenew?: boolean;
  lateFeeAmount?: number;
  lateFeeGraceDays?: number;
  cancellationWindowHours?: number;
  minBookingCount?: number;
  classCount?: number;
  trialType?: 'free' | 'paid';
  lateArrivalFeeAmount?: number;
  lateArrivalThresholdMinutes?: number;
  absenceFeeAmount?: number;
}

export interface PricingPolicy {
  policyType: PricingPolicyType;
  enabled: boolean;
  isDefault: boolean;
  rules: PricingRule[];
}

const GET_COACH_PRICING_SQL = `
  select p.policy_type, p.enabled, p.is_default,
    coalesce(json_agg(json_build_object(
      'amount', r.amount, 'currency', r.currency, 'billingCycle', r.billing_cycle, 'autoRenew', r.auto_renew,
      'lateFeeAmount', r.late_fee_amount, 'lateFeeGraceDays', r.late_fee_grace_days,
      'cancellationWindowHours', r.cancellation_window_hours, 'minBookingCount', r.min_booking_count,
      'classCount', r.class_count, 'trialType', r.trial_type,
      'lateArrivalFeeAmount', r.late_arrival_fee_amount, 'lateArrivalThresholdMinutes', r.late_arrival_threshold_minutes,
      'absenceFeeAmount', r.absence_fee_amount
    ) order by r.created_at) filter (where r.id is not null), '[]') as rules
  from coach_pricing_policies p
  left join coach_pricing_rules r on r.policy_id = p.id
  where p.coach_profile_id = $1
  group by p.id
  order by p.policy_type`;

export async function getCoachPricing(session: SessionContext, coachProfileId: string): Promise<PricingPolicy[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ policy_type: PricingPolicyType; enabled: boolean; is_default: boolean; rules: PricingRule[] }>(
      GET_COACH_PRICING_SQL,
      [coachProfileId]
    );
    return result.rows.map((row) => ({
      policyType: row.policy_type,
      enabled: row.enabled,
      isDefault: row.is_default,
      rules: row.rules,
    }));
  });
}

export interface UpsertCoachPricingInput {
  coachProfileId: string;
  policies: PricingPolicy[];
}

export async function upsertCoachPricing(session: SessionContext, input: UpsertCoachPricingInput): Promise<PricingPolicy[]> {
  return db.withRequestContext(session, async (client) => {
    const owner = await client.query<{ organization_id: string }>('select organization_id from coach_profiles where id = $1', [input.coachProfileId]);
    if (!owner.rows[0]) throw new StaffStateError('Coach profile not found.');
    const organizationId = owner.rows[0].organization_id;

    // Replace-whole-set: delete existing policies (cascades to rules), then re-insert only the enabled ones.
    await client.query('delete from coach_pricing_policies where coach_profile_id = $1', [input.coachProfileId]);

    for (const policy of input.policies.filter((p) => p.enabled)) {
      const inserted = await client.query<{ id: string }>(
        `insert into coach_pricing_policies (coach_profile_id, organization_id, policy_type, enabled, is_default)
         values ($1, $2, $3, true, $4) returning id`,
        [input.coachProfileId, organizationId, policy.policyType, policy.isDefault]
      );
      const policyId = inserted.rows[0].id;

      for (const rule of policy.rules) {
        await client.query(
          `insert into coach_pricing_rules
             (policy_id, amount, currency, billing_cycle, auto_renew, late_fee_amount, late_fee_grace_days,
              cancellation_window_hours, min_booking_count, class_count, trial_type,
              late_arrival_fee_amount, late_arrival_threshold_minutes, absence_fee_amount)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            policyId,
            rule.amount,
            rule.currency ?? 'INR',
            rule.billingCycle ?? null,
            rule.autoRenew ?? null,
            rule.lateFeeAmount ?? null,
            rule.lateFeeGraceDays ?? null,
            rule.cancellationWindowHours ?? null,
            rule.minBookingCount ?? null,
            rule.classCount ?? null,
            rule.trialType ?? null,
            rule.lateArrivalFeeAmount ?? null,
            rule.lateArrivalThresholdMinutes ?? null,
            rule.absenceFeeAmount ?? null,
          ]
        );
      }
    }

    return input.policies.filter((p) => p.enabled);
  });
}

export async function setPayoutSettings(session: SessionContext, input: SetPayoutSettingsInput): Promise<PayoutSettings> {
  const result = await db.withRequestContext(session, async (client) => {
    const profile = await client.query<{ organization_id: string; branch_id: string | null; user_id: string }>(
      `select organization_id, branch_id, user_id from staff_profiles where id = $1`,
      [input.staffProfileId]
    );
    const row = profile.rows[0];
    if (!row) throw new StaffStateError('Staff profile not found.');
    return client.query<Parameters<typeof mapPayoutRow>[0]>(UPSERT_PAYOUT_SETTINGS_SQL, [
        input.staffProfileId,
        row.organization_id,
        row.branch_id,
        row.user_id,
        input.payType,
        input.amountMinor ?? null,
        input.currency ?? 'INR',
        input.commissionPct ?? null,
        input.notes ?? null,
        session.userId,
      ]
    );
  });
  await writeAuditLog(session, {
    action: 'hr.payout_settings.set',
    targetType: 'payout_settings',
    targetId: input.staffProfileId,
    detail: { payType: input.payType },
  });
  return mapPayoutRow(result.rows[0]);
}
