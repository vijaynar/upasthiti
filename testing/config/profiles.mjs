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
};

export function resolveProfile(name) {
  const profile = PROFILES[name];
  if (!profile) {
    throw new Error(`Unknown dataset profile "${name}" — choose one of: ${Object.keys(PROFILES).join(', ')}`);
  }
  return profile;
}
