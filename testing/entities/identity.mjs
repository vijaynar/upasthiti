// Identity-layer entity helpers — every "person" in the seed data is either
// (a) a real authenticated identity (magic-link bootstrapped) or (b) a ward
// profile created cheaply by a guardian's real session (POST /me/wards, no
// email round trip at all — see README's "Bulk students" section for why
// this is the majority path for students).

import { count } from '../lib/log.mjs';

export async function loginIdentity(authProvider, email) {
  const identity = await authProvider.login(email);
  count('identities.authenticated');
  return identity;
}

export async function updateProfile(client, patch) {
  return client.patch('/api/v1/me', patch);
}

export async function grantConsent(client, { subjectUserId, kind, evidence } = {}) {
  return client.post('/api/v1/me/consents', { subjectUserId, kind, evidence });
}

/** Guardian creates a profile-only ward — cheap (no auth round trip), the real mechanism V1 minors already used. */
export async function createWard(guardianClient, { displayName, relationship, dob, consentAuthority = true }) {
  const ward = await guardianClient.post('/api/v1/me/wards', { displayName, relationship, dob, consentAuthority });
  count('students.wards_created');
  return ward;
}

export async function listWards(guardianClient) {
  return guardianClient.get('/api/v1/me/wards');
}
