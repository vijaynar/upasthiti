import nodemailer from 'nodemailer';
import type { SendResult } from '../index';

// Real v1 channel (2026-07-19 locked scope decision). SMTP-based via
// nodemailer rather than a vendor HTTP API (Resend etc., see
// .env.example's commented `RESEND_API_KEY` — a real future option, not
// wired here) so it works out of the box against local Supabase's Inbucket
// (127.0.0.1:54325, no auth), the exact same infra Phase 2 already verified
// end-to-end for magic-link emails. Production just points SMTP_HOST/PORT/
// USER/PASS at a real relay — no code change, same pattern as every other
// "config, not code" channel in this file's siblings.

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (cachedTransport) return cachedTransport;
  const host = process.env.SMTP_HOST ?? '127.0.0.1';
  const port = Number(process.env.SMTP_PORT ?? 54325);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: user && pass ? { user, pass } : undefined,
  });
  return cachedTransport;
}

export async function sendEmail(target: { to: string; subject: string; body: string }): Promise<SendResult> {
  try {
    const info = await getTransport().sendMail({
      from: process.env.SMTP_FROM ?? 'Abhyas <notifications@abhyas.local>',
      to: target.to,
      subject: target.subject,
      text: target.body,
    });
    return { status: 'sent', providerRef: info.messageId };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}
