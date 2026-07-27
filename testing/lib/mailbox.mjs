// Mailpit client (local dev only — supabase/config.toml still calls it
// [inbucket], the deprecated name; apps/web/pw-helpers.mjs already
// established this exact API shape for Playwright docs screenshots, reused
// here for scripted auth instead of a browser).

export function createMailbox(mailboxUrl) {
  async function findLatest(toEmail, sinceMs) {
    const res = await fetch(`${mailboxUrl}/api/v1/search?query=${encodeURIComponent('to:' + toEmail)}`);
    if (!res.ok) throw new Error(`Mailbox search failed (${res.status}) — is local Supabase running? (npm run db:start)`);
    const data = await res.json();
    const msgs = (data.messages ?? []).filter((m) => new Date(m.Created).getTime() >= sinceMs - 10000);
    if (!msgs.length) return null;
    return msgs.sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
  }

  async function fetchBody(id) {
    const res = await fetch(`${mailboxUrl}/api/v1/message/${id}`);
    if (!res.ok) throw new Error(`Mailbox fetch message failed (${res.status})`);
    return res.json();
  }

  /**
   * Polls until an email to `toEmail` arrives, then extracts a URL matching
   * `pathFragment` (e.g. '/api/v1/auth/magic-link/callback') from its body.
   */
  async function waitForLink(toEmail, pathFragment, { timeoutMs = 40000, sinceMs = Date.now() - 5000, pollMs = 500 } = {}) {
    const deadline = Date.now() + timeoutMs;
    const pattern = new RegExp(`https?://[^\\s"'<>]*${pathFragment.replace(/[/]/g, '\\/')}[^\\s"'<>]*`);
    while (Date.now() < deadline) {
      const msg = await findLatest(toEmail, sinceMs);
      if (msg) {
        const full = await fetchBody(msg.ID);
        const body = full.HTML || full.Text || '';
        const match = body.match(pattern);
        if (match) return match[0].replace(/&amp;/g, '&');
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`No email containing "${pathFragment}" found for ${toEmail} within ${timeoutMs}ms`);
  }

  return { findLatest, fetchBody, waitForLink };
}
