// Organizations — academies & independent-coach orgs (Requirements #2, #6).
// Mirrors the real path AcademyOnboardingWizard/CoachProfileWizard drive
// (POST /orgs -> branding -> listing -> publish), documented exactly in
// testing/README.md's "Verified against the real onboarding wizards"
// section. Branch geo/address has NO write API at all (confirmed by reading
// packages/modules/tenancy-rbac's createBranch — the route only accepts
// `name`) — branches are created name-only; realistic address data instead
// lives on `users.state/city/area` (see entities/identity.mjs's updateProfile).

import { count } from '../lib/log.mjs';

export async function createOrganization(client, { orgType, name, slug }) {
  const result = await client.post('/api/v1/orgs', { orgType, name, slug });
  count(`organizations.created.${orgType}`);
  return result; // { organizationId, branchId }
}

export async function activateWorkspace(client, orgId) {
  return client.post('/api/v1/me/workspace', { orgId });
}

export async function createBranch(client, orgId, name) {
  const result = await client.post(`/api/v1/orgs/${orgId}/branches`, { name });
  count('organizations.branches_created');
  return result; // { branchId }
}

export async function updateBranding(client, orgId, { displayName, logoPath, colors }) {
  return client.put(`/api/v1/orgs/${orgId}/branding`, { displayName, logoPath: logoPath ?? null, colors: colors ?? null });
}

export async function updateListing(client, orgId, listing) {
  return client.patch(`/api/v1/orgs/${orgId}/listing`, listing);
}

export async function publishListing(client, orgId) {
  const result = await client.post(`/api/v1/orgs/${orgId}/listing/publish`, {});
  count('organizations.listings_published');
  return result;
}

export async function inviteMember(client, orgId, { email, roleKeys, branchId }) {
  return client.post(`/api/v1/orgs/${orgId}/invitations`, { email, roleKeys, branchId });
}

export async function acceptInvitation(client, token) {
  return client.post('/api/v1/invitations/accept', { token });
}

export async function listOnboardableMembers(client, orgId) {
  return client.get(`/api/v1/orgs/${orgId}/staff/onboardable`);
}

export async function setActiveRole(client, orgId, roleKey) {
  return client.post(`/api/v1/orgs/${orgId}/me/active-role`, { roleKey });
}

export async function createJoinRequest(client, orgId, { requestedRole, branchId, subjectUserId }) {
  const result = await client.post(`/api/v1/orgs/${orgId}/join-requests`, { requestedRole, branchId, subjectUserId });
  count('people.join_requests_created');
  return result;
}

export async function decideJoinRequest(staffClient, orgId, joinRequestId, decision, note) {
  const result = await staffClient.post(`/api/v1/orgs/${orgId}/join-requests/${joinRequestId}/decide`, { decision, note });
  count(`people.join_requests_${decision}`);
  return result;
}
