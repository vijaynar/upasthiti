// Finance — fee policies, charges, payments, payouts (Requirement #14
// "Finance" approvals + general dashboard revenue data). Note:
// AcademyOnboardingWizard's KYC/bank-account UI fields are NOT wired to any
// backend call (confirmed by reading its handleSubmitAll) — bank accounts
// must be created directly via this module's createBankAccount, not assumed
// to exist after "onboarding" an academy.

import { count } from '../lib/log.mjs';

export async function createFeePolicy(client, orgId, { name, kind, amountMinor, currency, finePolicy }) {
  const result = await client.post(`/api/v1/orgs/${orgId}/finance/fee-policies`, { name, kind, amountMinor, currency, finePolicy });
  count('finance.fee_policies_created');
  return result;
}

export async function createBankAccount(client, orgId, { accountHolderName, bankName, accountLast4 }) {
  return client.post(`/api/v1/orgs/${orgId}/finance/bank-accounts`, { accountHolderName, bankName, accountLast4 });
}

export async function createCharge(client, orgId, { branchId, enrollmentId, kind, description, amountMinor, currency, dueOn, feePolicyId }) {
  const result = await client.post(`/api/v1/orgs/${orgId}/finance/charges`, {
    branchId, enrollmentId, kind, description, amountMinor, currency, dueOn, feePolicyId,
  });
  count(`finance.charges_created.${kind}`);
  return result;
}

export async function waiveCharge(client, orgId, chargeId) {
  count('finance.charges_waived');
  return client.post(`/api/v1/orgs/${orgId}/finance/charges/${chargeId}/waive`, {});
}

export async function cancelCharge(client, orgId, chargeId) {
  count('finance.charges_cancelled');
  return client.post(`/api/v1/orgs/${orgId}/finance/charges/${chargeId}/cancel`, {});
}

/** Staff-recorded cash/waiver settlement — instant, no approval step. createdAt only honored if historical_backdating is enabled for the org. */
export async function recordPayment(client, orgId, { payerUserId, method, amountMinor, currency, chargeIds, createdAt }) {
  const result = await client.post(`/api/v1/orgs/${orgId}/finance/payments`, { payerUserId, method, amountMinor, currency, chargeIds, createdAt });
  count(`finance.payments_recorded.${method}`);
  return result;
}

/** Self-service proof-of-payment submission — stays pending_verification until staff approves/rejects. */
export async function submitPaymentProof(studentClient, { organizationId, amountMinor, currency, proofPath }) {
  const result = await studentClient.post('/api/v1/me/finance/payments', { organizationId, amountMinor, currency, proofPath });
  count('finance.payment_proofs_submitted');
  return result;
}

export async function approvePayment(client, orgId, paymentId, chargeIds) {
  count('finance.payments_approved');
  return client.post(`/api/v1/orgs/${orgId}/finance/payments/${paymentId}/approve`, { chargeIds });
}

export async function rejectPayment(client, orgId, paymentId, reason) {
  count('finance.payments_rejected');
  return client.post(`/api/v1/orgs/${orgId}/finance/payments/${paymentId}/reject`, { reason });
}

export async function requestPayout(client, orgId, { amountMinor, currency, bankAccountId, periodStart, periodEnd }) {
  const result = await client.post(`/api/v1/orgs/${orgId}/finance/payouts`, { amountMinor, currency, bankAccountId, periodStart, periodEnd });
  count('finance.payouts_requested');
  return result;
}

export async function settlePayout(client, orgId, payoutId) {
  count('finance.payouts_settled');
  return client.post(`/api/v1/orgs/${orgId}/finance/payouts/${payoutId}/settle`, {});
}
