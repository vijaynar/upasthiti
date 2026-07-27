// Small structured logger + run-wide counters, printed as a summary table
// at the end of orchestrate.mjs (requirement #6: logging utilities).

const counters = new Map();
const startedAt = Date.now();

export function count(key, by = 1) {
  counters.set(key, (counters.get(key) ?? 0) + by);
}

export function getCounters() {
  return Object.fromEntries(counters.entries());
}

function ts() {
  return `+${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

export const log = {
  info(msg) { console.log(`[${ts()}] ${msg}`); },
  step(msg) { console.log(`\n[${ts()}] === ${msg} ===`); },
  warn(msg) { console.warn(`[${ts()}] WARN: ${msg}`); },
  error(msg) { console.error(`[${ts()}] ERROR: ${msg}`); },
  progress(label, done, total) {
    if (total === 0) return;
    if (done % Math.max(1, Math.floor(total / 20)) === 0 || done === total) {
      console.log(`[${ts()}] ${label}: ${done}/${total}`);
    }
  },
};

export function printSummary() {
  console.log('\n================ SEED SUMMARY ================');
  for (const [key, value] of [...counters.entries()].sort()) {
    console.log(`${key.padEnd(28)} ${value}`);
  }
  console.log(`Elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log('================================================\n');
}
