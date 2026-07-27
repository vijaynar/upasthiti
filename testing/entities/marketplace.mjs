// Marketplace — reviews (Requirement #11) and public leads. Reviews require
// a REAL session belonging to the enrolled student (RLS: author_user_id =
// current_user_id()) — never usable for a profile-only ward, see
// entities/students.mjs's header for how this framework accounts for that.

import { count } from '../lib/log.mjs';

export async function createReview(studentClient, orgId, { listingId, enrollmentId, rating, body, createdAt }) {
  const result = await studentClient.post(`/api/v1/orgs/${orgId}/reviews`, { listingId, enrollmentId, rating, body, createdAt });
  count('marketplace.reviews_created');
  return result;
}

export async function respondToReview(ownerClient, orgId, reviewId, orgResponse) {
  count('marketplace.review_responses');
  return ownerClient.post(`/api/v1/orgs/${orgId}/reviews/${reviewId}/respond`, { orgResponse });
}

/** Anonymous — no session needed, exercises the public discovery surface (Requirement #6/#14 lead pipeline). */
export async function submitPublicLead(anonClient, { listingSlug, name, phone, message }) {
  const result = await anonClient.post('/api/v1/public/leads', { listingSlug, name, phone, message });
  count('marketplace.leads_submitted');
  return result;
}

export async function updateLead(client, orgId, leadId, { status, assignedTo }) {
  count(`marketplace.leads_${status ?? 'updated'}`);
  return client.patch(`/api/v1/orgs/${orgId}/leads/${leadId}`, { status, assignedTo });
}

export async function searchPublicListings(anonClient, params) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
  return anonClient.get(`/api/v1/public/listings${qs ? `?${qs}` : ''}`);
}
