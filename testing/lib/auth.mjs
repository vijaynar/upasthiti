// Identity bootstrap — the one deliberate seam in "everything through real
// APIs" (see testing/README.md "Auth bootstrap" section for the full
// rationale). This app has NO password/register endpoint by design (Google
// OAuth + email magic-link only); the only way to get a real, RLS-scoped
// session for a synthetic identity is to run the exact same magic-link round
// trip a browser would:
//
//   POST /api/v1/auth/magic-link/start {email}   (real PKCE cookie set)
//   -> real email lands in the local Mailpit inbox
//   -> GET the emailed /api/v1/auth/magic-link/callback?code=... link
//      (same cookie jar, so the PKCE verifier rides along)
//   -> real session cookies come back, exactly as issued to a browser
//
// No Supabase admin API, no direct auth.users insert, no shortcut — this is
// the literal user journey, just driven by fetch() instead of a browser.
// It only works where a test mailbox exists to poll (local Mailpit). For
// staging/production, plug in a different MailboxProvider below (e.g. an
// IMAP catch-all inbox) — there is no way around needing SOME inbox to read,
// since the app never exposes the code any other way.

import { createHttpClient, decodeJwtPayload } from './apiClient.mjs';
import { createMailbox } from './mailbox.mjs';

export function createAuthProvider(config) {
  if (config.environment !== 'local') {
    throw new Error(
      `No MailboxProvider configured for --environment=${config.environment}. Local dev uses Mailpit ` +
      `(automatic); staging/production need a real inbox to poll for magic-link emails — implement one ` +
      `against testing/lib/mailbox.mjs's createMailbox() interface (findLatest/fetchBody/waitForLink) ` +
      `and wire it in here before running against a hosted environment.`
    );
  }
  const mailbox = createMailbox(config.mailbox.url);

  // One real session per unique email per run — the expensive part
  // (an actual email round trip), so never re-authenticate the same
  // identity twice inside a single process.
  const sessionCache = new Map();

  async function login(email, attemptsLeft = 2) {
    if (sessionCache.has(email)) return sessionCache.get(email);
    try {
      return await attemptLogin(email);
    } catch (err) {
      if (attemptsLeft <= 0) throw err;
      // Transient — under concurrent load a magic-link email can occasionally
      // arrive late (past the mailbox poll timeout) or the callback can race
      // a still-warming-up dev-server compile. A fresh attempt (new
      // start/poll/callback round trip, not a reuse of the failed one) is
      // the same thing a human retrying "didn't get the email" would do.
      await new Promise((r) => setTimeout(r, 500));
      return login(email, attemptsLeft - 1);
    }
  }

  async function attemptLogin(email) {
    const client = createHttpClient(config.appUrl);
    const since = Date.now();
    // Captures the PKCE code-verifier cookie (set on OUR app's origin,
    // localhost:3000 — @supabase/ssr's cookie jar is injected by
    // createRouteCookieJar, not tied to Supabase's own domain).
    await client.rawRequest('POST', '/api/v1/auth/magic-link/start', { email });

    // The emailed link is GoTrue's own /auth/v1/verify (a DIFFERENT origin,
    // 127.0.0.1:54321 locally) with our app's callback URL embedded as its
    // redirect_to — confirmed by inspecting a real Mailpit message body
    // during development (not the app's own callback URL directly). GoTrue
    // verifies the pkce_ token statelessly and 302s to redirect_to?code=...;
    // it needs none of our cookies for this hop.
    const verifyLink = await mailbox.waitForLink(email, '/api/v1/auth/magic-link/callback', { sinceMs: since });
    const verifyRes = await fetch(verifyLink, { redirect: 'manual' });
    const callbackUrl = verifyRes.headers.get('location');
    if (!callbackUrl || (verifyRes.status !== 302 && verifyRes.status !== 303 && verifyRes.status !== 307)) {
      throw new Error(`GoTrue verify link for ${email} did not redirect to our callback (status ${verifyRes.status}).`);
    }

    // Second hop: OUR app's callback, exchanging ?code= for a real session —
    // must reuse `client`'s cookie jar so the PKCE code-verifier cookie from
    // step 1 rides along (exchangeCodeForSession needs it).
    const cb = new URL(callbackUrl);
    const cbRes = await client.rawRequest('GET', `${cb.pathname}${cb.search}`);
    if (cbRes.status !== 302 && cbRes.status !== 303 && cbRes.status !== 307) {
      throw new Error(`Magic-link callback for ${email} did not redirect (status ${cbRes.status}) — login failed.`);
    }

    const accessToken = client.cookies.get('abhyas_access_token');
    if (!accessToken) throw new Error(`No session cookie set after magic-link callback for ${email}.`);
    const claims = decodeJwtPayload(accessToken);

    const identity = { email, userId: claims.sub, client };
    sessionCache.set(email, identity);
    return identity;
  }

  return { login, cacheSize: () => sessionCache.size };
}
