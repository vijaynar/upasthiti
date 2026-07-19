import path from 'node:path';
import fs from 'node:fs';

export const BASE_URL = 'http://localhost:3000';
export const MAILPIT_URL = 'http://127.0.0.1:54324';
export const SHOTS_DIR = path.resolve('../../docs/screenshots');

let shotCounter = 0;
export function resetShotCounter() { shotCounter = 0; }

export async function shot(page, category, name, opts = {}) {
  shotCounter += 1;
  const dir = path.join(SHOTS_DIR, category);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(shotCounter).padStart(2, '0')}-${name}.png`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? true });
  console.log('  shot:', file);
  return file;
}

// Poll Mailpit's API for the most recent email to `email`, extract the
// magic-link URL from its HTML body, and return it.
export async function getMagicLinkFor(email, { timeoutMs = 15000, sinceMs = Date.now() - 5000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent('to:' + email)}`);
    const data = await res.json();
    const msgs = (data.messages || []).filter((m) => new Date(m.Created).getTime() >= sinceMs - 10000);
    if (msgs.length) {
      const latest = msgs.sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
      const full = await (await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`)).json();
      const html = full.HTML || full.Text || '';
      const match = html.match(/https?:\/\/[^\s"'<>]*\/auth\/callback[^\s"'<>]*/) || html.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^\s"'<>]*/);
      if (match) return match[0].replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No magic link email found for ${email} within ${timeoutMs}ms`);
}

// Full login-as flow via the real UI: /auth/login -> enter email -> Continue
// -> fetch magic link from Mailpit -> navigate to it -> land on dashboard.
export async function loginViaMagicLink(page, email, { capture = null } = {}) {
  const since = Date.now();
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  if (capture) await shot(page, capture.category, capture.prefix + '-login-page');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('button[type="submit"]', { hasText: 'Continue' }).click();
  await page.waitForSelector('text=Check Your Email', { timeout: 10000 });
  if (capture) await shot(page, capture.category, capture.prefix + '-check-email');

  const link = await getMagicLinkFor(email, { sinceMs: since });
  await page.goto(link, { waitUntil: 'networkidle' });
  // Wait for the client-side Supabase session to actually hydrate (the
  // server-side redirect lands on /admin/dashboard or /student/dashboard
  // before the browser JS client has the session in localStorage — racing
  // ahead with another page.goto() here causes RLS-scoped queries in that
  // next page to run unauthenticated and silently return zero rows).
  await page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

export async function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
