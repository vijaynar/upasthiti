// Students (Requirement #5) — two paths, deliberately mixed:
//
// 1. BULK path (majority): a guardian creates a ward (POST /me/wards, no
//    email round trip) and staff directly enrolls that ward
//    (POST /orgs/{id}/enrollments) — fast, since it needs only the ONE
//    guardian identity's real session, not one per student.
// 2. JOIN-REQUEST path (a deliberate minority): demonstrates the real
//    approval workflow (Requirement #14's "Student Requests" queue) —
//    someone submits a join-request, staff later approves/rejects/leaves it
//    pending. Approving a student join-request auto-creates the enrollment
//    (confirmed via api-catalog notes) so this path never double-enrolls.
//
// Reviews (Requirement #11) can ONLY be authored by a student with a real
// session of their own (RLS checks author_user_id = current_user_id()) — a
// profile-only ward created via path 1 has no session and can never post a
// review. See README's "Reviews" section for how this framework sizes the
// self-account-student subset instead of silently under-delivering.

import { count } from '../lib/log.mjs';

export async function enrollDirect(ownerClient, orgId, { branchId, studentUserId, rollNumber, startedOn, profile }) {
  const result = await ownerClient.post(`/api/v1/orgs/${orgId}/enrollments`, { branchId, studentUserId, rollNumber, startedOn, profile });
  count('students.enrollments_direct');
  return result; // { id: enrollmentId, ... }
}

export async function updateEnrollment(ownerClient, orgId, enrollmentId, patch) {
  return ownerClient.patch(`/api/v1/orgs/${orgId}/enrollments/${enrollmentId}`, patch);
}
