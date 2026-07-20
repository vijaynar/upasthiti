// Zoned-time -> UTC instant conversion for class-session materialization
// (Doc 07 §7). No date library dependency (none exists in this monorepo yet,
// see IMPLEMENTATION_STATUS.md's Phase 7 section) — `Intl.DateTimeFormat`
// already knows every IANA zone's offset at an arbitrary instant, DST
// included, so a two-pass offset lookup is all that's needed. v1's org
// timezones are India-only (`Asia/Kolkata`, fixed +05:30, no DST) but this
// isn't special-cased — the general algorithm costs nothing extra.

function offsetMinutesAt(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/** Converts a local wall-clock date+time in `timeZone` to the UTC instant it represents. */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const naiveUtcMs = Date.UTC(y, m - 1, d, hh, mm);

  const offset1 = offsetMinutesAt(timeZone, new Date(naiveUtcMs));
  let candidate = new Date(naiveUtcMs - offset1 * 60_000);
  const offset2 = offsetMinutesAt(timeZone, candidate);
  if (offset2 !== offset1) candidate = new Date(naiveUtcMs - offset2 * 60_000);
  return candidate;
}

/** ISO day-of-week (1=Monday .. 7=Sunday) for a `YYYY-MM-DD` date, timezone-independent. */
export function isoDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sunday..6=Saturday
  return jsDay === 0 ? 7 : jsDay;
}

/** Adds `days` calendar days to a `YYYY-MM-DD` string, returning the same format. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
