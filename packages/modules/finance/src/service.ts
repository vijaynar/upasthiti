// finance module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through this module's service functions (e.g.
// attendance never inserts into `charges`, it enqueues
// `attendance.absence_confirmed`, which apps/worker routes to assessFine()
// below) rather than a direct table write.
//
// Scope: fee_policies, charges, payments, payment_allocations,
// ledger_accounts, ledger_entries, payouts, org_bank_accounts (Doc 07 §9,
// migration 0011). See that migration's header for the scope decisions this
// file assumes: `fine_policy` reused for both late-fee config and
// assessFine's absence-fine config; no automated recurring charge
// generation; `payments.method = 'gateway'` schema-complete but not wired
// (packages/platform/src/payments has no real adapter yet); ledger entries
// only book the settlement leg (payment succeeds / refund / payout settles),
// not charge creation.

import { db } from '@abhyas/platform';
import type { SessionContext } from '@abhyas/kernel';

export class NotAuthorizedError extends Error {
  constructor(action = 'perform this action') {
    super(`[finance] You do not have permission to ${action}.`);
  }
}

// historical_backdating feature flag (migration 0007_seed_historical_backdating.sql)
export class FeatureDisabledError extends Error {
  constructor(flagKey: string) {
    super(`[finance] The "${flagKey}" feature is not enabled for this organization.`);
  }
}

export class PaymentGatewayNotConfiguredError extends Error {
  constructor() {
    super('[finance] No payment gateway is configured yet — record cash/waiver payments or accept proof-of-payment uploads instead.');
  }
}

// ── Fee policies ─────────────────────────────────────────────────

export type FeePolicyKind = 'recurring_monthly' | 'recurring_term' | 'one_time' | 'per_session';
export type FeePolicyStatus = 'active' | 'archived';

export interface LateFeeRule {
  graceDays: number;
  flatMinor?: number;
  percentBp?: number; // basis points (1/100 of a percent)
  capMinor?: number;
}

export interface AbsenceFineRule {
  amountMinor: number;
}

export interface FinePolicy {
  lateFee?: LateFeeRule;
  absenceFine?: AbsenceFineRule;
}

export interface FeePolicy {
  id: string;
  organizationId: string;
  name: string;
  kind: FeePolicyKind;
  amountMinor: number;
  currency: string;
  finePolicy: FinePolicy | null;
  status: FeePolicyStatus;
}

function mapFeePolicyRow(row: {
  id: string;
  organization_id: string;
  name: string;
  kind: FeePolicyKind;
  amount_minor: string | number;
  currency: string;
  fine_policy: FinePolicy | null;
  status: FeePolicyStatus;
}): FeePolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    kind: row.kind,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    finePolicy: row.fine_policy,
    status: row.status,
  };
}

const FEE_POLICY_COLUMNS = `id, organization_id, name, kind, amount_minor, currency, fine_policy, status`;
const INSERT_FEE_POLICY_SQL = `insert into fee_policies (organization_id, name, kind, amount_minor, currency, fine_policy)
   values ($1, $2, $3, $4, $5, $6) returning ${FEE_POLICY_COLUMNS}`;
const LIST_FEE_POLICIES_SQL = `select ${FEE_POLICY_COLUMNS} from fee_policies where organization_id = $1 order by name`;
const UPDATE_FEE_POLICY_SQL = `update fee_policies set
     name = coalesce($1, name),
     amount_minor = coalesce($2, amount_minor),
     fine_policy = coalesce($3, fine_policy),
     status = coalesce($4, status)
   where id = $5`;

export interface CreateFeePolicyInput {
  organizationId: string;
  name: string;
  kind: FeePolicyKind;
  amountMinor: number;
  currency?: string;
  finePolicy?: FinePolicy;
}

export async function createFeePolicy(session: SessionContext, input: CreateFeePolicyInput): Promise<FeePolicy> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapFeePolicyRow>[0]>(INSERT_FEE_POLICY_SQL, [
      input.organizationId,
      input.name,
      input.kind,
      input.amountMinor,
      input.currency ?? 'INR',
      input.finePolicy ?? null,
    ]);
    return mapFeePolicyRow(result.rows[0]);
  });
}

export async function listFeePolicies(session: SessionContext, organizationId: string): Promise<FeePolicy[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapFeePolicyRow>[0]>(LIST_FEE_POLICIES_SQL, [organizationId]);
    return result.rows.map(mapFeePolicyRow);
  });
}

export interface UpdateFeePolicyInput {
  name?: string;
  amountMinor?: number;
  finePolicy?: FinePolicy;
  status?: FeePolicyStatus;
}

export async function updateFeePolicy(session: SessionContext, feePolicyId: string, patch: UpdateFeePolicyInput): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(UPDATE_FEE_POLICY_SQL, [
      patch.name ?? null,
      patch.amountMinor ?? null,
      patch.finePolicy ?? null,
      patch.status ?? null,
      feePolicyId,
    ]);
    if (result.rowCount === 0) throw new NotAuthorizedError('update this fee policy');
  });
}

// ── Charges ──────────────────────────────────────────────────────

export type ChargeKind = 'fee' | 'fine' | 'adjustment';
export type ChargeStatus = 'open' | 'pending_verification' | 'paid' | 'waived' | 'cancelled' | 'refunded';

export interface Charge {
  id: string;
  organizationId: string;
  branchId: string;
  enrollmentId: string;
  feePolicyId: string | null;
  kind: ChargeKind;
  description: string;
  amountMinor: number;
  currency: string;
  dueOn: string;
  status: ChargeStatus;
}

function mapChargeRow(row: {
  id: string;
  organization_id: string;
  branch_id: string;
  enrollment_id: string;
  fee_policy_id: string | null;
  kind: ChargeKind;
  description: string;
  amount_minor: string | number;
  currency: string;
  due_on: string;
  status: ChargeStatus;
}): Charge {
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    enrollmentId: row.enrollment_id,
    feePolicyId: row.fee_policy_id,
    kind: row.kind,
    description: row.description,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    dueOn: row.due_on,
    status: row.status,
  };
}

const CHARGE_COLUMNS = `id, organization_id, branch_id, enrollment_id, fee_policy_id, kind, description, amount_minor, currency, due_on, status`;
const INSERT_CHARGE_SQL = `insert into charges (organization_id, branch_id, enrollment_id, fee_policy_id, kind, description, amount_minor, currency, due_on)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning ${CHARGE_COLUMNS}`;
const LIST_CHARGES_SQL = `select ${CHARGE_COLUMNS} from charges
   where organization_id = $1
     and ($2::uuid is null or branch_id = $2)
     and ($3::uuid is null or enrollment_id = $3)
     and ($4::text is null or status = $4)
   order by due_on desc`;
const LIST_MY_CHARGES_SQL = `select c.${CHARGE_COLUMNS.split(', ').join(', c.')} from charges c
   join enrollments e on e.id = c.enrollment_id
   where e.student_user_id = current_user_id()
   order by c.due_on desc`;
const LIST_WARD_CHARGES_SQL = `select c.${CHARGE_COLUMNS.split(', ').join(', c.')} from charges c
   join enrollments e on e.id = c.enrollment_id
   where e.student_user_id = $1
   order by c.due_on desc`;
const UPDATE_CHARGE_STATUS_SQL = `update charges set status = $1 where id = $2`;

export interface CreateChargeInput {
  organizationId: string;
  branchId: string;
  enrollmentId: string;
  feePolicyId?: string;
  kind: ChargeKind;
  description: string;
  amountMinor: number;
  currency?: string;
  dueOn: string;
}

// RLS-gated insert (charges_insert_staff, migration 0011) — requires
// finance.charge.create at the charge's branch scope.
export async function createCharge(session: SessionContext, input: CreateChargeInput): Promise<Charge> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapChargeRow>[0]>(INSERT_CHARGE_SQL, [
      input.organizationId,
      input.branchId,
      input.enrollmentId,
      input.feePolicyId ?? null,
      input.kind,
      input.description,
      input.amountMinor,
      input.currency ?? 'INR',
      input.dueOn,
    ]);
    return mapChargeRow(result.rows[0]);
  });
}

export interface ListChargesInput {
  organizationId: string;
  branchId?: string;
  enrollmentId?: string;
  status?: ChargeStatus;
}

export async function listCharges(session: SessionContext, input: ListChargesInput): Promise<Charge[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapChargeRow>[0]>(LIST_CHARGES_SQL, [
      input.organizationId,
      input.branchId ?? null,
      input.enrollmentId ?? null,
      input.status ?? null,
    ]);
    return result.rows.map(mapChargeRow);
  });
}

export async function listMyCharges(session: SessionContext): Promise<Charge[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapChargeRow>[0]>(LIST_MY_CHARGES_SQL);
    return result.rows.map(mapChargeRow);
  });
}

export async function listWardCharges(session: SessionContext, wardUserId: string): Promise<Charge[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapChargeRow>[0]>(LIST_WARD_CHARGES_SQL, [wardUserId]);
    return result.rows.map(mapChargeRow);
  });
}

// Status transitions beyond 'open'/'pending_verification' are permission-
// gated per-transition by migration 0011's enforce_charge_status_transition
// trigger, not just this RLS-scoped UPDATE — see that migration's header.
export async function waiveCharge(session: SessionContext, chargeId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(UPDATE_CHARGE_STATUS_SQL, ['waived', chargeId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('waive this charge');
  });
}

export async function cancelCharge(session: SessionContext, chargeId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(UPDATE_CHARGE_STATUS_SQL, ['cancelled', chargeId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('cancel this charge');
  });
}

// ── Payments ─────────────────────────────────────────────────────

export type PaymentMethod = 'gateway' | 'manual_proof' | 'cash' | 'waiver';
export type PaymentStatus = 'initiated' | 'pending_verification' | 'succeeded' | 'failed' | 'rejected' | 'refunded';

export interface Payment {
  id: string;
  organizationId: string;
  payerUserId: string;
  method: PaymentMethod;
  proofPath: string | null;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
}

function mapPaymentRow(row: {
  id: string;
  organization_id: string;
  payer_user_id: string;
  method: PaymentMethod;
  proof_path: string | null;
  amount_minor: string | number;
  currency: string;
  status: PaymentStatus;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
}): Payment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    payerUserId: row.payer_user_id,
    method: row.method,
    proofPath: row.proof_path,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    status: row.status,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    rejectionReason: row.rejection_reason,
  };
}

const PAYMENT_COLUMNS = `id, organization_id, payer_user_id, method, proof_path, amount_minor, currency, status, verified_by, verified_at, rejection_reason`;
const INSERT_PAYMENT_SQL = `insert into payments (organization_id, payer_user_id, method, proof_path, amount_minor, currency, status)
   values ($1, $2, $3, $4, $5, $6, $7) returning ${PAYMENT_COLUMNS}`;
const INSERT_PAYMENT_WITH_CREATED_AT_SQL = `insert into payments (organization_id, payer_user_id, method, proof_path, amount_minor, currency, status, created_at)
   values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, now())) returning ${PAYMENT_COLUMNS}`;
const LIST_PAYMENTS_SQL = `select ${PAYMENT_COLUMNS} from payments
   where organization_id = $1 and ($2::text is null or status = $2) and ($3::uuid is null or payer_user_id = $3)
   order by created_at desc`;
const LIST_MY_PAYMENTS_SQL = `select ${PAYMENT_COLUMNS} from payments where payer_user_id = current_user_id() order by created_at desc`;
const SELECT_PAYMENT_SQL = `select ${PAYMENT_COLUMNS} from payments where id = $1`;
const UPDATE_PAYMENT_REJECT_SQL = `update payments set status = 'rejected', verified_by = $1, verified_at = now(), rejection_reason = $2 where id = $3 and status = 'pending_verification'`;
const UPDATE_PAYMENT_SUCCEED_SQL = `update payments set status = 'succeeded', verified_by = $1, verified_at = now() where id = $2 and status in ('pending_verification', 'initiated')`;
const INSERT_ALLOCATION_SQL = `insert into payment_allocations (payment_id, charge_id, amount_minor) values ($1, $2, $3)`;
const SELECT_CHARGE_FOR_ALLOCATION_SQL = `select organization_id, branch_id, amount_minor, currency, status from charges where id = $1`;

// Self-serve proof upload — parent/student submits proof of a payment
// they've already made outside the app (bank transfer, UPI screenshot), or
// front-desk intake on their behalf. Stays 'pending_verification' until a
// finance.proof.approve holder calls approvePayment/rejectPayment.
export interface SubmitPaymentProofInput {
  organizationId: string;
  amountMinor: number;
  currency?: string;
  proofPath: string;
  payerUserId?: string; // set by staff doing intake on someone else's behalf; defaults to self
}

export async function submitPaymentProof(session: SessionContext, input: SubmitPaymentProofInput): Promise<Payment> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapPaymentRow>[0]>(INSERT_PAYMENT_SQL, [
      input.organizationId,
      input.payerUserId ?? session.userId,
      'manual_proof',
      input.proofPath,
      input.amountMinor,
      input.currency ?? 'INR',
      'pending_verification',
    ]);
    return mapPaymentRow(result.rows[0]);
  });
}

async function postSettlementLedger(
  client: Awaited<ReturnType<typeof db.getServiceClient>>,
  organizationId: string,
  amountMinor: number,
  currency: string,
  paymentId: string,
  occurredAt?: string // historical_backdating feature flag only — see recordManualPayment
): Promise<void> {
  const receivable = await client.query<{ get_or_create_ledger_account: string }>('select get_or_create_ledger_account($1, $2)', [organizationId, 'org_receivable']);
  const cash = await client.query<{ get_or_create_ledger_account: string }>('select get_or_create_ledger_account($1, $2)', [organizationId, 'org_cash']);
  // node-postgres serializes a top-level array parameter as a Postgres ARRAY
  // literal, not JSON — unlike a plain object (e.g. fee_policies.fine_policy
  // elsewhere in this file), which it does auto-JSON.stringify. A jsonb
  // *array* parameter needs an explicit JSON.stringify.
  await client.query('select post_ledger_entries($1, coalesce($2, now()))', [
    JSON.stringify([
      { accountId: receivable.rows[0].get_or_create_ledger_account, amountMinor: -amountMinor, currency, refType: 'payment', refId: paymentId },
      { accountId: cash.rows[0].get_or_create_ledger_account, amountMinor, currency, refType: 'payment', refId: paymentId },
    ]),
    occurredAt ?? null,
  ]);
}

async function allocateAndSettle(
  client: Awaited<ReturnType<typeof db.getServiceClient>>,
  payment: { id: string; organizationId: string; amountMinor: number; currency: string },
  chargeIds: string[],
  occurredAt?: string // historical_backdating feature flag only — see recordManualPayment
): Promise<void> {
  let remaining = payment.amountMinor;
  for (const chargeId of chargeIds) {
    if (remaining <= 0) break;
    const chargeResult = await client.query<{ organization_id: string; branch_id: string; amount_minor: string; currency: string; status: ChargeStatus }>(
      SELECT_CHARGE_FOR_ALLOCATION_SQL,
      [chargeId]
    );
    const charge = chargeResult.rows[0];
    if (!charge || charge.status === 'paid' || charge.status === 'refunded') continue;
    const chargeAmount = Number(charge.amount_minor);
    const allocation = Math.min(chargeAmount, remaining);
    await client.query(INSERT_ALLOCATION_SQL, [payment.id, chargeId, allocation]);
    if (allocation >= chargeAmount) {
      await client.query(UPDATE_CHARGE_STATUS_SQL, ['paid', chargeId]);
    }
    remaining -= allocation;
  }
  await postSettlementLedger(client, payment.organizationId, payment.amountMinor, payment.currency, payment.id, occurredAt);
}

// Staff-recorded cash/waiver payment — settles instantly (no separate
// approval step, matching Doc 04 §5's "Charges & payments" row where
// Accountant/Owner/Org Admin/Branch Admin hold finance.payment.record
// directly). 'waiver' is ledgered identically to 'cash' (see this file's
// header: the literal ledger_accounts.kind enum has no dedicated
// waiver/discount account, so a waiver-recorded payment is treated as
// staff-attested settlement rather than real currency movement — an
// interpretive simplification, not a doc requirement).
export interface RecordManualPaymentInput {
  organizationId: string;
  payerUserId: string;
  method: 'cash' | 'waiver';
  amountMinor: number;
  currency?: string;
  chargeIds: string[];
  createdAt?: string; // historical_backdating feature flag only — also backdates the posted ledger entries
}

export async function recordManualPayment(session: SessionContext, input: RecordManualPaymentInput): Promise<Payment> {
  return db.withRequestContext(session, async (client) => {
    if (input.createdAt && !(await db.isOrgFeatureEnabled(input.organizationId, 'historical_backdating'))) {
      throw new FeatureDisabledError('historical_backdating');
    }

    const result = await client.query<Parameters<typeof mapPaymentRow>[0]>(INSERT_PAYMENT_WITH_CREATED_AT_SQL, [
      input.organizationId,
      input.payerUserId,
      input.method,
      null,
      input.amountMinor,
      input.currency ?? 'INR',
      'succeeded',
      input.createdAt ?? null,
    ]);
    const payment = mapPaymentRow(result.rows[0]);
    await allocateAndSettle(client, { id: payment.id, organizationId: payment.organizationId, amountMinor: payment.amountMinor, currency: payment.currency }, input.chargeIds, input.createdAt);
    return payment;
  });
}

export interface ApprovePaymentInput {
  paymentId: string;
  chargeIds: string[];
}

// finance.proof.approve — flips a pending manual_proof payment to
// succeeded, allocates it against the given charges, and settles the ledger.
export async function approvePayment(session: SessionContext, input: ApprovePaymentInput): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(UPDATE_PAYMENT_SUCCEED_SQL, [session.userId, input.paymentId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('approve this payment');
    const paymentResult = await client.query<Parameters<typeof mapPaymentRow>[0]>(SELECT_PAYMENT_SQL, [input.paymentId]);
    const payment = mapPaymentRow(paymentResult.rows[0]);
    await allocateAndSettle(client, payment, input.chargeIds);
  });
}

export async function rejectPayment(session: SessionContext, paymentId: string, reason: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(UPDATE_PAYMENT_REJECT_SQL, [session.userId, reason, paymentId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('reject this payment');
  });
}

export interface ListPaymentsInput {
  organizationId: string;
  status?: PaymentStatus;
  payerUserId?: string;
}

export async function listPayments(session: SessionContext, input: ListPaymentsInput): Promise<Payment[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapPaymentRow>[0]>(LIST_PAYMENTS_SQL, [
      input.organizationId,
      input.status ?? null,
      input.payerUserId ?? null,
    ]);
    return result.rows.map(mapPaymentRow);
  });
}

export async function listMyPayments(session: SessionContext): Promise<Payment[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapPaymentRow>[0]>(LIST_MY_PAYMENTS_SQL);
    return result.rows.map(mapPaymentRow);
  });
}

// ── Fee status summary (Students page) ──────────────────────────────
// One row per enrollment (even those with no charges at all, via the LEFT
// JOIN) so the Students table can show a status for every row without an
// N+1 charges fetch per student. Same silent-empty-join shape as any other
// RLS-scoped join in this codebase: a caller without finance.charge.read at
// a branch sees every one of that branch's charges filtered out, and every
// enrollment reads as 'no_dues' rather than an authorization error — not a
// bug, just this function's blind spot for a caller who can read students
// but not their charges.

export type FeeStatus = 'no_dues' | 'paid' | 'pending' | 'overdue';

export interface FeeStatusEntry {
  enrollmentId: string;
  feeStatus: FeeStatus;
  nextDueOn: string | null;
  amountDueMinor: number;
}

const FEE_STATUS_SUMMARY_SQL = `select e.id as enrollment_id,
    case
      when bool_or(c.status = 'open' and c.due_on < current_date) then 'overdue'
      when bool_or(c.status in ('open', 'pending_verification')) then 'pending'
      when count(c.id) = 0 then 'no_dues'
      else 'paid'
    end as fee_status,
    min(c.due_on) filter (where c.status in ('open', 'pending_verification')) as next_due_on,
    coalesce(sum(c.amount_minor) filter (where c.status in ('open', 'pending_verification')), 0) as amount_due_minor
  from enrollments e
  left join charges c on c.enrollment_id = e.id
  where e.organization_id = $1 and ($2::uuid is null or e.branch_id = $2)
  group by e.id`;

export async function getFeeStatusSummary(session: SessionContext, organizationId: string, branchId?: string): Promise<FeeStatusEntry[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<{
      enrollment_id: string;
      fee_status: FeeStatus;
      next_due_on: string | null;
      amount_due_minor: string | number;
    }>(FEE_STATUS_SUMMARY_SQL, [organizationId, branchId ?? null]);
    return result.rows.map((row) => ({
      enrollmentId: row.enrollment_id,
      feeStatus: row.fee_status,
      nextDueOn: row.next_due_on,
      amountDueMinor: Number(row.amount_due_minor),
    }));
  });
}

// Gateway payments are schema-complete but not wired this phase (see this
// file's header) — surfaces the same "not configured" shape as
// notify's whatsapp/sms stub channels rather than silently no-op-ing.
export async function initiateGatewayPayment(): Promise<never> {
  throw new PaymentGatewayNotConfiguredError();
}

// ── Refunds ──────────────────────────────────────────────────────

const SELECT_CHARGE_SQL = `select ${CHARGE_COLUMNS} from charges where id = $1`;

// finance.refund.issue (enforced by migration 0011's status-transition
// trigger, not this function) — reverses the charge's settlement leg and
// marks it refunded. Doesn't touch the originating payment row: a payment
// can cover several charges, so a single charge's refund shouldn't flip the
// whole payment to 'refunded' unless every charge it funded is now refunded
// too (not tracked here — acceptable v1 simplification, the charge itself
// is always the source of truth for "is this money owed again").
export async function issueRefund(session: SessionContext, chargeId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const before = await client.query<Parameters<typeof mapChargeRow>[0]>(SELECT_CHARGE_SQL, [chargeId]);
    const charge = before.rows[0] ? mapChargeRow(before.rows[0]) : null;
    if (!charge || charge.status !== 'paid') throw new NotAuthorizedError('refund this charge');

    const result = await client.query(UPDATE_CHARGE_STATUS_SQL, ['refunded', chargeId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('refund this charge');

    const receivable = await client.query<{ get_or_create_ledger_account: string }>('select get_or_create_ledger_account($1, $2)', [charge.organizationId, 'org_receivable']);
    const cash = await client.query<{ get_or_create_ledger_account: string }>('select get_or_create_ledger_account($1, $2)', [charge.organizationId, 'org_cash']);
    await client.query('select post_ledger_entries($1)', [
      JSON.stringify([
        { accountId: cash.rows[0].get_or_create_ledger_account, amountMinor: -charge.amountMinor, currency: charge.currency, refType: 'refund', refId: chargeId },
        { accountId: receivable.rows[0].get_or_create_ledger_account, amountMinor: charge.amountMinor, currency: charge.currency, refType: 'refund', refId: chargeId },
      ]),
    ]);
  });
}

// ── Ledger ───────────────────────────────────────────────────────

export interface LedgerEntry {
  id: string;
  entryGroup: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  refType: string;
  refId: string;
  occurredAt: string;
}

function mapLedgerEntryRow(row: {
  id: string;
  entry_group: string;
  account_id: string;
  amount_minor: string | number;
  currency: string;
  ref_type: string;
  ref_id: string;
  occurred_at: string;
}): LedgerEntry {
  return {
    id: row.id,
    entryGroup: row.entry_group,
    accountId: row.account_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    refType: row.ref_type,
    refId: row.ref_id,
    occurredAt: row.occurred_at,
  };
}

const LIST_LEDGER_ENTRIES_SQL = `select id, entry_group, account_id, amount_minor, currency, ref_type, ref_id, occurred_at
   from ledger_entries where organization_id = $1 order by occurred_at desc limit 200`;

export async function listLedgerEntries(session: SessionContext, organizationId: string): Promise<LedgerEntry[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapLedgerEntryRow>[0]>(LIST_LEDGER_ENTRIES_SQL, [organizationId]);
    return result.rows.map(mapLedgerEntryRow);
  });
}

// ── Payouts & bank accounts ─────────────────────────────────────

export interface OrgBankAccount {
  id: string;
  organizationId: string;
  accountHolderName: string;
  bankName: string;
  accountLast4: string;
}

function mapBankAccountRow(row: { id: string; organization_id: string; account_holder_name: string; bank_name: string; account_last4: string }): OrgBankAccount {
  return { id: row.id, organizationId: row.organization_id, accountHolderName: row.account_holder_name, bankName: row.bank_name, accountLast4: row.account_last4 };
}

const BANK_ACCOUNT_COLUMNS = `id, organization_id, account_holder_name, bank_name, account_last4`;
const INSERT_BANK_ACCOUNT_SQL = `insert into org_bank_accounts (organization_id, account_holder_name, bank_name, account_last4)
   values ($1, $2, $3, $4) returning ${BANK_ACCOUNT_COLUMNS}`;
const LIST_BANK_ACCOUNTS_SQL = `select ${BANK_ACCOUNT_COLUMNS} from org_bank_accounts where organization_id = $1 order by created_at desc`;

export interface AddBankAccountInput {
  organizationId: string;
  accountHolderName: string;
  bankName: string;
  accountLast4: string;
}

export async function addBankAccount(session: SessionContext, input: AddBankAccountInput): Promise<OrgBankAccount> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapBankAccountRow>[0]>(INSERT_BANK_ACCOUNT_SQL, [
      input.organizationId,
      input.accountHolderName,
      input.bankName,
      input.accountLast4,
    ]);
    return mapBankAccountRow(result.rows[0]);
  });
}

export async function listBankAccounts(session: SessionContext, organizationId: string): Promise<OrgBankAccount[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapBankAccountRow>[0]>(LIST_BANK_ACCOUNTS_SQL, [organizationId]);
    return result.rows.map(mapBankAccountRow);
  });
}

export type PayoutStatus = 'pending' | 'processing' | 'settled' | 'failed' | 'reversed';

export interface Payout {
  id: string;
  organizationId: string;
  amountMinor: number;
  currency: string;
  bankAccountId: string | null;
  status: PayoutStatus;
  periodStart: string | null;
  periodEnd: string | null;
}

function mapPayoutRow(row: {
  id: string;
  organization_id: string;
  amount_minor: string | number;
  currency: string;
  bank_account_id: string | null;
  status: PayoutStatus;
  period_start: string | null;
  period_end: string | null;
}): Payout {
  return {
    id: row.id,
    organizationId: row.organization_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    bankAccountId: row.bank_account_id,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
  };
}

const PAYOUT_COLUMNS = `id, organization_id, amount_minor, currency, bank_account_id, status, period_start, period_end`;
const INSERT_PAYOUT_SQL = `insert into payouts (organization_id, amount_minor, currency, bank_account_id, period_start, period_end)
   values ($1, $2, $3, $4, $5, $6) returning ${PAYOUT_COLUMNS}`;
const LIST_PAYOUTS_SQL = `select ${PAYOUT_COLUMNS} from payouts where organization_id = $1 order by created_at desc`;
const UPDATE_PAYOUT_STATUS_SQL = `update payouts set status = $1 where id = $2 and status = 'pending'`;
const SELECT_PAYOUT_SQL = `select ${PAYOUT_COLUMNS} from payouts where id = $1`;

export interface RequestPayoutInput {
  organizationId: string;
  amountMinor: number;
  currency?: string;
  bankAccountId?: string;
  periodStart?: string;
  periodEnd?: string;
}

export async function requestPayout(session: SessionContext, input: RequestPayoutInput): Promise<Payout> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapPayoutRow>[0]>(INSERT_PAYOUT_SQL, [
      input.organizationId,
      input.amountMinor,
      input.currency ?? 'INR',
      input.bankAccountId ?? null,
      input.periodStart ?? null,
      input.periodEnd ?? null,
    ]);
    return mapPayoutRow(result.rows[0]);
  });
}

export async function listPayouts(session: SessionContext, organizationId: string): Promise<Payout[]> {
  return db.withRequestContext(session, async (client) => {
    const result = await client.query<Parameters<typeof mapPayoutRow>[0]>(LIST_PAYOUTS_SQL, [organizationId]);
    return result.rows.map(mapPayoutRow);
  });
}

// Manual settlement (finance.payout.manage) — no gateway is configured to
// initiate a real bank transfer (see this file's header), so "settling" a
// payout here just records that staff moved the money outside the app and
// posts the corresponding ledger legs. `gateway_clearing` is reused as the
// counterparty account (money leaving org_cash toward the payout rail) —
// the same literal account kind Doc 07 §9 lists, not a new one.
export async function settlePayout(session: SessionContext, payoutId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(UPDATE_PAYOUT_STATUS_SQL, ['settled', payoutId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('settle this payout');
    const payoutResult = await client.query<Parameters<typeof mapPayoutRow>[0]>(SELECT_PAYOUT_SQL, [payoutId]);
    const payout = mapPayoutRow(payoutResult.rows[0]);

    const cash = await client.query<{ get_or_create_ledger_account: string }>('select get_or_create_ledger_account($1, $2)', [payout.organizationId, 'org_cash']);
    const clearing = await client.query<{ get_or_create_ledger_account: string }>('select get_or_create_ledger_account($1, $2)', [payout.organizationId, 'gateway_clearing']);
    await client.query('select post_ledger_entries($1)', [
      JSON.stringify([
        { accountId: cash.rows[0].get_or_create_ledger_account, amountMinor: -payout.amountMinor, currency: payout.currency, refType: 'payout', refId: payoutId },
        { accountId: clearing.rows[0].get_or_create_ledger_account, amountMinor: payout.amountMinor, currency: payout.currency, refType: 'payout', refId: payoutId },
      ]),
    ]);
  });
}

export async function markPayoutFailed(session: SessionContext, payoutId: string): Promise<void> {
  await db.withRequestContext(session, async (client) => {
    const result = await client.query(UPDATE_PAYOUT_STATUS_SQL, ['failed', payoutId]);
    if (result.rowCount === 0) throw new NotAuthorizedError('update this payout');
  });
}

// ── assessFine(): the real consumer of attendance.absence_confirmed ────
// (Doc 14 §2 rule 2 — "attendance never inserts into charges; it calls
// finance.assessFine()"). Runs as a background-job event consumer
// (apps/worker/src/registry.ts), service-role: no caller session exists to
// scope RLS to when the worker processes a queued event, same category as
// every other module's background jobs (see SERVICE_ROLE_MANIFEST).

export interface AssessFineInput {
  organizationId: string;
  branchId: string;
  enrollmentId: string;
  classSessionId: string;
  attendanceEventId: string;
}

const BATCH_FOR_SESSION_SQL = `select batch_id from class_sessions where id = $1`;
const FEE_POLICY_FOR_BATCH_SQL = `select fp.id, fp.fine_policy from batches b
   join fee_policies fp on fp.id = b.default_fee_policy_id
   where b.id = $1`;
const EXISTING_FINE_SQL = `select id from charges where enrollment_id = $1 and description = $2`;
const INSERT_FINE_CHARGE_SQL = `insert into charges (organization_id, branch_id, enrollment_id, fee_policy_id, kind, description, amount_minor, currency, due_on)
   values ($1, $2, $3, $4, 'fine', $5, $6, 'INR', current_date + interval '7 days')
   returning id`;

export async function assessFine(input: AssessFineInput): Promise<{ skipped: boolean; reason?: string; chargeId?: string }> {
  const client = await db.getServiceClient();
  try {
    const batchResult = await client.query<{ batch_id: string }>(BATCH_FOR_SESSION_SQL, [input.classSessionId]);
    const batchId = batchResult.rows[0]?.batch_id;
    if (!batchId) return { skipped: true, reason: 'no_batch' };

    const policyResult = await client.query<{ id: string; fine_policy: FinePolicy | null }>(FEE_POLICY_FOR_BATCH_SQL, [batchId]);
    const policy = policyResult.rows[0];
    const absenceFine = policy?.fine_policy?.absenceFine;
    if (!policy || !absenceFine || !(absenceFine.amountMinor > 0)) return { skipped: true, reason: 'no_absence_fine_configured' };

    // Idempotency: the worker may redeliver an `attendance.absence_confirmed`
    // job after a transient failure (see migration 0011's header + Doc 14
    // §8's retry/backoff) — a stable description string keyed on the
    // attendance event id lets a redelivered event no-op instead of
    // double-fining, without a dedicated reference column.
    const description = `Absence fine (event ${input.attendanceEventId})`;
    const existing = await client.query<{ id: string }>(EXISTING_FINE_SQL, [input.enrollmentId, description]);
    if (existing.rows[0]) return { skipped: true, reason: 'already_assessed', chargeId: existing.rows[0].id };

    const inserted = await client.query<{ id: string }>(INSERT_FINE_CHARGE_SQL, [
      input.organizationId,
      input.branchId,
      input.enrollmentId,
      policy.id,
      description,
      absenceFine.amountMinor,
    ]);
    return { skipped: false, chargeId: inserted.rows[0].id };
  } finally {
    client.release();
  }
}

// Job-kind string apps/worker/src/registry.ts wires to assessFine() —
// exported here (rather than left as a magic string on the worker side)
// since it names an event this module is the documented consumer of.
export const ABSENCE_CONFIRMED_JOB_KIND = 'attendance.absence_confirmed';
