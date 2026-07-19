// Money type: amount_minor + currency, never a float, never a bare number
// (Doc 07 §1 convention, PRD principle 8 — "every rupee is ledgered").

export interface Money {
  /** Integer, smallest currency unit (e.g. paise for INR). */
  amountMinor: number;
  /** ISO 4217. */
  currency: string;
}

const MINOR_UNITS_PER_MAJOR: Record<string, number> = { INR: 100, USD: 100 };

export function money(amountMinor: number, currency = 'INR'): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error('[kernel/money] amountMinor must be an integer (smallest currency unit) — never a float.');
  }
  return { amountMinor, currency };
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function isZero(m: Money): boolean {
  return m.amountMinor === 0;
}

export function format(m: Money, locale = 'en-IN'): string {
  const divisor = MINOR_UNITS_PER_MAJOR[m.currency] ?? 100;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(
    m.amountMinor / divisor
  );
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`[kernel/money] Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
