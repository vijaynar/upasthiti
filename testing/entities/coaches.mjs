// Coaches — independent coaches (Requirement #2), academy coaches
// (Requirement #7), and sub-coaches (Requirement #3). All three go through
// the same real staff-hr + coach-profile APIs `CoachProfileWizard` uses in
// its 'self' vs 'admin' mode (see api-catalog notes, section 15).

import { count } from '../lib/log.mjs';

/** Independent coach: onboard-coach is self-service, requires the caller's own active workspace already set to their independent_coach org. */
export async function onboardSelfCoach(coachClient, profile) {
  const result = await coachClient.post('/api/v1/me/onboard-coach', profile);
  count('coaches.independent_onboarded');
  return result;
}

export async function setSelfPricing(coachClient, policies) {
  return coachClient.put('/api/v1/me/coach-profile/pricing', { policies });
}

/** Academy coach / sub-coach: staff (owner) turns an already-a-member's membership into an HR profile. */
export async function onboardStaff(ownerClient, orgId, { membershipId, designation, employmentType, notes }) {
  const result = await ownerClient.post(`/api/v1/orgs/${orgId}/staff`, { membershipId, designation, employmentType, notes });
  count('staff.onboarded');
  return result; // StaffProfile { id, ... }
}

/** Admin-mode coach-profile submit (CoachProfileWizard mode='admin') — same field shape as onboardSelfCoach, PUT instead of POST, against an existing staffId. */
export async function setStaffCoachProfile(ownerClient, orgId, staffId, profile) {
  const result = await ownerClient.put(`/api/v1/orgs/${orgId}/staff/${staffId}/coach-profile`, profile);
  count('coaches.academy_coach_profiles_set');
  return result;
}

export async function setStaffPricing(ownerClient, orgId, staffId, policies) {
  return ownerClient.put(`/api/v1/orgs/${orgId}/staff/${staffId}/coach-profile/pricing`, { policies });
}

/** Certification/document reference — storage_path is a plain text reference in this app (no upload pipeline built yet), same as the real staff console. */
export async function addStaffDocument(ownerClient, orgId, staffId, { docType, storagePath }) {
  const result = await ownerClient.post(`/api/v1/orgs/${orgId}/staff/${staffId}/documents`, { docType, storagePath });
  count('staff.documents_added');
  return result;
}

export async function setStaffAvailability(client, orgId, staffId, slots) {
  // Self-service only (PUT /me/staff/availability) — there is no admin-mode
  // PUT for someone else's availability, only a GET (see api-catalog notes
  // section 13). Call this with the STAFF MEMBER's own client, not the owner's.
  return client.put('/api/v1/me/staff/availability', { slots });
}

export async function requestLeave(staffClient, { kind, startsOn, endsOn, reason }) {
  const result = await staffClient.post('/api/v1/me/staff/leave-requests', { kind, startsOn, endsOn, reason });
  count('staff.leave_requests_created');
  return result;
}

export async function decideLeave(ownerClient, orgId, leaveId, decision, note) {
  const result = await ownerClient.patch(`/api/v1/orgs/${orgId}/leave-requests/${leaveId}`, { decision, note });
  count(`staff.leave_requests_${decision}`);
  return result;
}

export async function setPayoutSettings(ownerClient, orgId, staffId, settings) {
  return ownerClient.put(`/api/v1/orgs/${orgId}/staff/${staffId}/payout-settings`, settings);
}
