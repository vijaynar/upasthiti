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
}

// Active org members with no staff_profiles row yet — the picker behind
// "onboard staff" (org-initiated onboarding path 1, Doc 04 §8; the invite
// itself already happened via tenancy-rbac in an earlier phase).
export async function listOnboardableMembers(session: SessionContext, organizationId: string): Promise<OnboardableMember[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{ membership_id: string; user_id: string; display_name: string; branch_id: string | null }>(
      `select m.id as membership_id, m.user_id, u.display_name, m.branch_id
       from memberships m
       join users u on u.id = m.user_id
       left join staff_profiles sp on sp.membership_id = m.id
       where m.organization_id = $1 and m.status = 'active' and sp.id is null
       order by u.display_name`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      membershipId: row.membership_id,
      userId: row.user_id,
      displayName: row.display_name,
      branchId: row.branch_id,
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
