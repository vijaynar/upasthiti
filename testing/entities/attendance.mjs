// Attendance (Requirement #10) — realistic per-student patterns (high
// attendance / frequently absent / new admissions) driven by weighted RNG,
// written via the real record/override endpoints. `recordedAt` is only
// honored when the org's historical_backdating flag is on (see
// entities/platformAdmin.mjs) — omit it entirely for orgs that didn't opt in
// and attendance will simply land at the real current timestamp instead of
// failing (the service functions ignore an absent recordedAt for free).

import { count } from '../lib/log.mjs';

const STATUS_WEIGHTS_BY_PROFILE = {
  high: [{ value: 'present', weight: 88 }, { value: 'late', weight: 8 }, { value: 'absent', weight: 4 }],
  typical: [{ value: 'present', weight: 78 }, { value: 'late', weight: 10 }, { value: 'absent', weight: 12 }],
  frequently_absent: [{ value: 'present', weight: 55 }, { value: 'late', weight: 10 }, { value: 'absent', weight: 35 }],
};

export function pickAttendanceProfile(rng) {
  return rng.weighted([
    { value: 'high', weight: 40 },
    { value: 'typical', weight: 45 },
    { value: 'frequently_absent', weight: 15 },
  ]);
}

export async function recordAttendance(client, orgId, batchId, sessionId, { enrollmentId, status, method = 'manual', recordedAt }) {
  const result = await client.post(`/api/v1/orgs/${orgId}/batches/${batchId}/sessions/${sessionId}/attendance`, {
    enrollmentId,
    status,
    method,
    recordedAt,
  });
  count(`attendance.events.${status}`);
  return result;
}

/**
 * Marks one student's attendance across every PAST/today session in
 * `sessions` (from listSessions/backfillBatchSessions) — never a future
 * 'scheduled' session, that would be recording attendance before the class
 * happened. Skips 'holiday' sessions and dates before the student's own
 * enrollment startedOn, per a realistic weighted status profile.
 */
export async function generateAttendanceForStudent(client, orgId, batchId, rng, { enrollmentId, sessions, enrolledFrom, today, profile = 'typical' }) {
  const weights = STATUS_WEIGHTS_BY_PROFILE[profile] ?? STATUS_WEIGHTS_BY_PROFILE.typical;
  let marked = 0;
  for (const s of sessions) {
    if (s.status === 'holiday' || s.status === 'cancelled') continue;
    if (today && s.sessionDate > today) continue;
    if (enrolledFrom && s.sessionDate < enrolledFrom) continue;
    const status = rng.weighted(weights);
    const recordedAt = s.status === 'completed' ? s.startsAt : undefined;
    await recordAttendance(client, orgId, batchId, s.id, { enrollmentId, status, recordedAt });
    marked += 1;
  }
  return marked;
}
