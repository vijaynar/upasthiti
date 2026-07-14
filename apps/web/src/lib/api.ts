// apps/web/src/lib/api.ts
// Helpers for building consistent API responses and extracting auth context
// in Next.js route handlers.

import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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

// ── Auth context ──────────────────────────────────────────────

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

/**
 * Extract and validate the calling user's session from cookies.
 * Returns AuthContext or null if not authenticated.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Query public.users directly to get the active role and tenant_id
  try {
    const db = adminDb();
    const { data: dbUser } = await db
      .from('users')
      .select('role, tenant_id, email')
      .eq('id', user.id)
      .maybeSingle();

    if (dbUser && dbUser.role && dbUser.tenant_id) {
      return {
        userId: user.id,
        tenantId: dbUser.tenant_id,
        role: dbUser.role,
        email: dbUser.email ?? user.email ?? '',
      };
    }
  } catch (err) {
    console.error('[getAuthContext DB Query Error]:', err);
  }

  // Fallback to JWT app_metadata (e.g. during onboarding / first login)
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  const role = user.app_metadata?.role as string | undefined;

  if (!tenantId || !role) return null;

  return {
    userId: user.id,
    tenantId,
    role,
    email: user.email ?? '',
  };
}

/**
 * Require a specific role (or one of multiple roles).
 */
export function hasRole(ctx: AuthContext, ...roles: string[]): boolean {
  return roles.includes(ctx.role);
}

/**
 * Check if the user has the specified dynamic permission in the database.
 * Returns true if superadmin or user's role has the permission mapped.
 */
export async function hasPermission(
  ctx: AuthContext,
  module: string,
  action: string
): Promise<boolean> {
  if (ctx.role === 'superadmin') return true;

  try {
    const db = adminDb();
    const { data: userProfile, error } = await db
      .from('users')
      .select(`
        roles(
          role_permissions(
            permissions(
              module,
              action
            )
          )
        )
      `)
      .eq('id', ctx.userId)
      .single();

    const rolesObj: any = userProfile?.roles;
    if (error || !rolesObj) return false;
    const rolePermissions = Array.isArray(rolesObj)
      ? rolesObj[0]?.role_permissions
      : rolesObj?.role_permissions;
    if (!rolePermissions) return false;

    return rolePermissions.some((rp: any) => {
      const p = rp.permissions;
      return p && p.module === module && p.action === action;
    });
  } catch (err) {
    console.error('[hasPermission Check Error]:', err);
    return false;
  }
}

/**
 * Write an operational audit log entry to public.audit_logs.
 * Call this after any significant create/update/delete action.
 */
export async function logAuditEvent(
  tenantId: string,
  userId: string,
  action: string,
  description: string,
  ipAddress?: string
): Promise<void> {
  try {
    const db = adminDb();
    await db.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: userId,
      action,
      description,
      ip_address: ipAddress ?? null,
    });
  } catch (e) {
    // Audit logging must never crash the main operation
    console.error('[AuditLog] Failed to write audit log:', e);
  }
}

/**
 * Write a per-coach audit log entry to public.coach_audit_logs.
 * Powers the Coach Management drawer's Timeline/Activity tab. Call this
 * alongside logAuditEvent for every coach lifecycle action — same event,
 * two read-paths (tenant-wide Governance log vs. per-coach timeline).
 */
export async function logCoachAuditEvent(
  tenantId: string,
  actorId: string,
  coachId: string,
  actionType: string,
  description: string,
  metaData?: Record<string, unknown>
): Promise<void> {
  try {
    const db = adminDb();
    await db.from('coach_audit_logs').insert({
      tenant_id: tenantId,
      actor_id: actorId,
      coach_id: coachId,
      action_type: actionType,
      description,
      meta_data: metaData ?? null,
    });
  } catch (e) {
    // Audit logging must never crash the main operation
    console.error('[CoachAuditLog] Failed to write coach audit log:', e);
  }
}
