// apps/web/src/lib/api.ts
// Helpers for building consistent API responses in Next.js route handlers.
// getAuthContext()/hasRole()/hasPermission()/logAuditEvent()/
// logCoachAuditEvent() (V1's old-schema auth context + audit logging) were
// removed with the rest of the V1 admin/student surface, their only
// callers. adminDb() stays — V2's public marketplace routes
// (api/v1/public/coaches, /categories, /service-areas, /service-communities)
// still use it for schema-agnostic service-role reads.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Supabase DB type (inline to avoid workspace resolution issues in tsc) ───
// When supabase gen types is run, replace this with the generated file
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;

// ── Response builders ─────────────────────────────────────────

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function err(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error: message, code }, { status });
}

// ── Typed DB client ───────────────────────────────────────────

/**
 * Returns a Supabase admin client (service role key).
 * This bypasses RLS — ONLY use in server-side route handlers.
 */
export function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
