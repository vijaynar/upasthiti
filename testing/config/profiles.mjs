// Dataset size profiles (requirement #15). Counts are approximate targets —
// the orchestrator derives per-academy/per-coach batch sizes from these so
// the totals land close to spec without a rigid per-entity divisor.

export const PROFILES = {
  smoke: {
    label: 'SMOKE (framework self-test, not a requirement-defined profile)',
    academies: 1,
    independentCoaches: 1,
    academyCoachesTarget: 2,
    subCoachesTarget: 1,
    studentsTarget: 6,
    batchesTarget: 2,
    attendanceDays: 10,
    reviewsTarget: 2,
    approvalsTarget: 4,
  },
  small: {
    label: 'SMALL (Development)',
    academies: 10,
    independentCoaches: 25,
    academyCoachesTarget: 50,
    subCoachesTarget: 10,
    studentsTarget: 500,
    batchesTarget: 40,
    attendanceDays: 30,
    reviewsTarget: 100,
    approvalsTarget: 50,
  },
  medium: {
    label: 'MEDIUM (QA)',
    academies: 100,
    independentCoaches: 250,
    academyCoachesTarget: 500,
    subCoachesTarget: 100,
    studentsTarget: 10_000,
    batchesTarget: 500,
    attendanceDays: 90,
    reviewsTarget: 2_000,
    approvalsTarget: 500,
  },
  large: {
    label: 'LARGE (Performance)',
    academies: 1_000,
    independentCoaches: 2_500,
    academyCoachesTarget: 5_000,
    subCoachesTarget: 1_000,
    studentsTarget: 100_000,
    batchesTarget: 5_000,
    attendanceDays: 365,
    reviewsTarget: 25_000,
    approvalsTarget: 10_000,
  },
  // Not requirement-defined — a small, hand-picked scenario profile for
  // exercising coach-facing depth (daily-running batches, attendance AND
  // progress-metric history, mixed approval-queue states) without the
  // scale of `small`. Zero academies on purpose: every org here is an
  // independent coach.
  coachxs: {
    label: 'COACHXS (independent-coach feature depth, not scale)',
    academies: 0,
    independentCoaches: 2,
    academyCoachesTarget: 0,
    subCoachesTarget: 1,
    studentsTarget: 20,
    // How many of the students above (globally, across both coaches) are
    // guaranteed a REAL self-account login (age 18+) instead of the usual
    // random ~20%-self-account / mostly-guardian-created-ward mix — "10
    // real students, not parents". See orchestrate.mjs's `adultSelfAccountBudget`.
    adultSelfAccountTarget: 10,
    batchesTarget: 5,
    // How many batches (globally, across every org this profile creates)
    // get a 7-day/week schedule instead of the usual random 2-4 days —
    // guarantees "3 different classes running every day" rather than
    // leaving it to chance. See orchestrate.mjs's `dailyClassBudget`.
    dailyClassesTarget: 3,
    attendanceDays: 45,
    // Depth of progress_entries (skill-metric) history per student —
    // undefined on every other profile above, which is what keeps
    // progress-metric seeding opt-in (see orchestrate.mjs's `config.progressDays` gate).
    progressDays: 30,
    reviewsTarget: 3,
    approvalsTarget: 4,
  },
};

// Case-insensitive lookup — `--dataset=CoachXS`, `coachxs`, `COACHXS` etc.
// all resolve to the same profile key. Built once (not per-call) since
// PROFILES itself never changes at runtime.
const PROFILES_BY_LOWERCASE_KEY = Object.fromEntries(Object.entries(PROFILES).map(([key, value]) => [key.toLowerCase(), value]));

export function resolveProfile(name) {
  const profile = PROFILES_BY_LOWERCASE_KEY[String(name).toLowerCase()];
  if (!profile) {
    throw new Error(`Unknown dataset profile "${name}" — choose one of: ${Object.keys(PROFILES).join(', ')}`);
  }
  return profile;
}
