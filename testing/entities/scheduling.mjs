// Scheduling — batches, programs, coach assignment, roster, holidays
// (Requirements #4, #9). backfillBatchSessions is the new endpoint added in
// this same change set (migration 0007_seed_historical_backdating.sql) —
// without it there is no way to get class_sessions dated in the past at all
// (materializeBatchSessions is forward-only from "today", confirmed by
// reading packages/modules/scheduling/src/service.ts before this framework
// was built — see README's "Historical backdating" section).

import { count } from '../lib/log.mjs';

export async function createProgram(client, orgId, { name, sportKey, description }) {
  const result = await client.post(`/api/v1/orgs/${orgId}/programs`, { name, sportKey, description });
  count('scheduling.programs_created');
  return result;
}

export async function createBatch(client, orgId, { branchId, name, mode, programId, capacity, schedule, graceMinutes }) {
  const result = await client.post(`/api/v1/orgs/${orgId}/batches`, { branchId, name, mode, programId, capacity, schedule, graceMinutes });
  count('scheduling.batches_created');
  return result;
}

export async function assignCoach(client, orgId, batchId, { membershipId, role, days }) {
  const result = await client.post(`/api/v1/orgs/${orgId}/batches/${batchId}/coaches`, { membershipId, role, days });
  count('scheduling.coach_assignments');
  return result;
}

export async function addToRoster(client, orgId, batchId, enrollmentId) {
  const result = await client.post(`/api/v1/orgs/${orgId}/batches/${batchId}/roster`, { enrollmentId });
  count('scheduling.roster_entries');
  return result;
}

export async function addHoliday(client, orgId, { onDate, label, branchId }) {
  return client.post(`/api/v1/orgs/${orgId}/holidays`, { onDate, label, branchId });
}

export async function listSessions(client, orgId, batchId, from, to) {
  return client.get(`/api/v1/orgs/${orgId}/batches/${batchId}/sessions?from=${from}&to=${to}`);
}

/** Requires the org's historical_backdating feature flag ON (entities/platformAdmin.mjs's enableHistoricalBackdating) and an owner/org_admin session. */
export async function backfillBatchSessions(ownerClient, orgId, batchId, fromDate, toDate) {
  const result = await ownerClient.post(`/api/v1/orgs/${orgId}/batches/${batchId}/sessions/backfill`, { fromDate, toDate });
  count('scheduling.sessions_backfilled', result.sessionsUpserted ?? 0);
  return result;
}
