// Resumability manifest (requirement #20: safe re-execution, no duplicate
// records). One JSON file per --run-tag under testing/.state/ — records
// just IDs/slugs, never cookies/tokens (a fresh run re-authenticates rather
// than trusting a stale session from disk). Entity modules check this before
// creating anything so a re-run (or a crash-and-resume) skips completed work.

import fs from 'node:fs';
import path from 'node:path';

export function loadState(config) {
  const file = path.join(config.stateDir, `${config.runTag}.json`);
  if (config.clean || !fs.existsSync(file)) {
    return { file, data: emptyState() };
  }
  try {
    return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { file, data: emptyState() };
  }
}

function emptyState() {
  return {
    version: 1,
    categories: null, // taxonomy snapshot fetched once per run
    organizations: {}, // slug -> { organizationId, branchId, orgType, ownerEmail }
    coaches: {},        // email -> { userId, organizationId, staffId, coachProfileId }
    subCoaches: {},
    students: {},        // wardId or self email -> { userId, guardianEmail, organizationId, enrollmentId, batchId }
    guardians: {},        // email -> { userId }
    batches: {},           // "orgSlug/batchName" -> { batchId, branchId }
    platformStaff: {},      // roleKey -> { userId, roleKey, email } (keyed by role, not email — email now embeds a per-run counter, see fakeData.mjs's emailFor, so it can't double as the resume key)
    approvals: { count: 0 },
    reviews: { count: 0 },
    attendanceDone: {},      // enrollmentId -> last date attendance was generated through
    actors: [],               // login-reference index for testing/credentials.mjs — [{email, name, role, type, orgSlug, organizationId}]
    crossOrgSiblings: [],      // [{guardianEmail, linkA, linkB}] — see orchestrate.mjs's "Cross-org guardian siblings" pass
  };
}

export function saveState(config, state) {
  fs.mkdirSync(config.stateDir, { recursive: true });
  fs.writeFileSync(state.file, JSON.stringify(state.data, null, 2));
}

export function autosave(config, state, everyN = 25) {
  let n = 0;
  return () => {
    n += 1;
    if (n % everyN === 0) saveState(config, state);
  };
}
