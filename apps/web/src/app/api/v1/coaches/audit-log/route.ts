// apps/web/src/app/api/v1/coaches/audit-log/route.ts
// GET /api/v1/coaches/audit-log?coachId=... — per-coach lifecycle timeline,
// powers the Coach Operations Dashboard drawer's Timeline tab.

import { getAuthContext, adminDb, ok, err, hasRole } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return err('Unauthorised', 401);
    if (!hasRole(ctx, 'admin', 'superadmin')) return err('Forbidden', 403);

    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');
    if (!coachId) return err('coachId is required', 422);

    const db = adminDb();

    // Verify the coach belongs to this tenant (unless superadmin) before
    // leaking any timeline data.
    const coachQuery = db.from('users').select('id, tenant_id').eq('id', coachId).eq('role', 'coach');
    if (ctx.role !== 'superadmin') {
      coachQuery.eq('tenant_id', ctx.tenantId);
    }
    const { data: coach, error: coachErr } = await coachQuery.maybeSingle();
    if (coachErr || !coach) return err('Coach not found in your tenant', 404);

    const { data, error } = await db
      .from('coach_audit_logs')
      .select('id, action_type, description, meta_data, created_at, actor:actor_id(first_name, last_name)')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return ok(data);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}
