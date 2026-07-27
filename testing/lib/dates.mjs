// Date helpers — Date.now()/new Date() with no args are intentionally never
// used here so a run is fully reproducible from --seed; `today` is computed
// once in orchestrate.mjs and threaded through everywhere.

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStrOrDate, n) {
  const d = typeof dateStrOrDate === 'string' ? new Date(`${dateStrOrDate}T00:00:00.000Z`) : new Date(dateStrOrDate);
  d.setUTCDate(d.getUTCDate() + n);
  return typeof dateStrOrDate === 'string' ? isoDate(d) : d;
}

export function daysAgo(today, n) {
  return addDays(today, -n);
}
