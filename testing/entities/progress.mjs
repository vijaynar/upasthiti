// Progress & performance metrics (Doc 07 §13, `@abhyas/module-progress`) —
// realistic per-student skill-metric history, written via the real
// GET /orgs/{id}/progress/metrics and POST /orgs/{id}/progress/entries
// endpoints. `recordedOn` is only honored as a real backdated date when the
// org's historical_backdating flag is on (see entities/platformAdmin.mjs) —
// same convention as attendance/finance's own backdated fields.
//
// metric_definitions has two layers (see migration 0006_seed_reference_data.sql
// and packages/modules/progress/src/service.ts): a platform-wide library
// (organization_id null, keyed by sport_key, e.g. 'general'/'swimming'/
// 'cricket'/...) plus org-custom rows. This framework only logs against the
// platform library — no reason to invent org-custom metrics for seed data.

import { count } from '../lib/log.mjs';
import { daysAgo } from '../lib/dates.mjs';

/** GET /orgs/{id}/progress/metrics?sport=... — platform-library + org-custom metric definitions for one sport (or every sport if omitted). */
export async function listMetrics(client, orgId, sportKey) {
  const qs = sportKey ? `?sport=${encodeURIComponent(sportKey)}` : '';
  return client.get(`/api/v1/orgs/${orgId}/progress/metrics${qs}`);
}

/** POST /orgs/{id}/progress/entries — logs one dated value against one enrollment+metric. */
export async function logProgressEntry(client, orgId, { enrollmentId, metricKey, value, note, recordedOn }) {
  const result = await client.post(`/api/v1/orgs/${orgId}/progress/entries`, { enrollmentId, metricKey, value, note, recordedOn });
  count('progress.entries_logged');
  return result;
}

// Starting-value bands per metric direction — not metric-specific (this
// framework has no per-unit calibration table), just enough spread that a
// sparkline/goal-ring looks like a real, gently-improving student rather
// than flat or random noise.
const STARTING_RANGE = {
  higher_better: [40, 60],
  lower_better: [55, 75],
  neutral: [45, 65],
};

const PROGRESS_NOTES = [
  'Solid session, good focus.', 'Needs more work on form.', 'Great improvement this week.',
  'Slight dip — fatigued today.', 'Personal best attempt.', 'Steady, consistent effort.',
];

/**
 * Logs a realistic, gently-trending value series for one student across up
 * to 3 metrics (drawn from whatever `metrics` list the caller passes in —
 * normally the org's own sport + the platform-wide "general" set) spanning
 * `days` days back from `today`, one entry every `cadenceDays` (default
 * weekly). Mirrors generateAttendanceForStudent's per-student-loop shape:
 * takes an `Rng`, writes through the real API, soft-fails per entry.
 * `enrolledFrom` caps how far back an entry can be backdated, same rule
 * attendance already follows.
 */
export async function generateProgressForStudent(client, orgId, rng, { enrollmentId, metrics, days, today, enrolledFrom, cadenceDays = 7 }) {
  const usable = (metrics ?? []).filter((m) => m?.key);
  if (usable.length === 0 || !days) return 0;
  const chosen = usable.length <= 3 ? usable : rng.sample(usable, 3);

  let logged = 0;
  for (const metric of chosen) {
    const range = STARTING_RANGE[metric.direction ?? 'neutral'];
    let value = rng.float(range[0], range[1], 1);
    const trendStep =
      metric.direction === 'higher_better' ? rng.float(0.5, 2, 2) : metric.direction === 'lower_better' ? -rng.float(0.5, 2, 2) : 0;

    const offsets = [];
    for (let d = days; d > 0; d -= cadenceDays) offsets.push(d);
    offsets.push(0); // always include "today"

    for (const d of offsets) {
      const recordedOn = daysAgo(today, d);
      if (enrolledFrom && recordedOn < enrolledFrom) continue;
      value = Math.max(0, value + trendStep + rng.float(-1, 1, 2));
      await logProgressEntry(client, orgId, {
        enrollmentId,
        metricKey: metric.key,
        value: Math.round(value * 10) / 10,
        note: rng.bool(0.25) ? rng.pick(PROGRESS_NOTES) : undefined,
        recordedOn,
      }).catch(() => null);
      logged += 1;
    }
  }
  return logged;
}
