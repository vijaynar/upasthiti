// apps/web/src/app/api/v1/coaches/assignments/route.ts
// GET  /api/v1/coaches/assignments   — list batch assignments for a coach or batch
// POST /api/v1/coaches/assignments   — create assignment (admin assigns or coach requests)
// PUT  /api/v1/coaches/assignments   — approve / reject / remove assignment (admin only for approve/reject)
// DELETE /api/v1/coaches/assignments — remove a coach from a batch (admin only)

import { getAuthContext, adminDb, ok, created, err, hasRole } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return err('Unauthorised', 401);

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    const coachId = searchParams.get('coachId');

    const db = adminDb();
    let query = db
      .from('coach_batch_assignments')
      .select(`
        id, status, assigned_days, created_at,
        coach:coach_id(id, first_name, last_name, email, phone, avatar_url,
          coach_profile:coaches(coach_categories(is_primary, subcategory:subcategories(name)))
        ),
        batch:batch_id(id, name, start_time, end_time, days_of_week,
          class:classes(name)
        ),
        requested_by_user:requested_by(first_name, last_name),
        approved_by_user:approved_by(first_name, last_name)
      `);

    if (ctx.role !== 'superadmin') {
      query = query.eq('tenant_id', ctx.tenantId);
    }

    if (batchId) query = query.eq('batch_id', batchId);
    if (coachId) query = query.eq('coach_id', coachId);

    // Coaches can only see their own assignments
    if (ctx.role === 'coach') {
      query = query.eq('coach_id', ctx.userId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    return ok(data);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return err('Unauthorised', 401);
    if (!hasRole(ctx, 'admin', 'superadmin', 'coach')) return err('Forbidden', 403);

    const body = await req.json();
    const { coachId, batchId, assignedDays } = body;

    if (!coachId || !batchId) return err('coachId and batchId are required', 422);

    // Validate assignedDays if provided
    if (assignedDays !== undefined && assignedDays !== null) {
      if (!Array.isArray(assignedDays) || assignedDays.some((d: unknown) => typeof d !== 'number' || d < 1 || d > 7)) {
        return err('assignedDays must be an array of integers 1-7 (Mon=1 … Sun=7)', 422);
      }
    }

    const db = adminDb();

    // Coaches can only request for themselves
    if (ctx.role === 'coach' && coachId !== ctx.userId) {
      return err('Coaches can only request assignments for themselves', 403);
    }

    // Verify coach belongs to tenant (unless superadmin)
    const coachQuery = db.from('users').select('id, tenant_id').eq('id', coachId).eq('role', 'coach');
    if (ctx.role !== 'superadmin') {
      coachQuery.eq('tenant_id', ctx.tenantId);
    }
    const { data: coach, error: coachErr } = await coachQuery.maybeSingle();
    if (coachErr || !coach) return err('Coach not found in your tenant', 404);

    // Verify batch belongs to tenant (unless superadmin)
    const batchQuery = db.from('batches').select('id, tenant_id').eq('id', batchId);
    if (ctx.role !== 'superadmin') {
      batchQuery.eq('tenant_id', ctx.tenantId);
    }
    const { data: batch, error: batchErr } = await batchQuery.maybeSingle();
    if (batchErr || !batch) return err('Batch not found in your tenant', 404);

    const effectiveTenantId = batch.tenant_id;

    // Admins get 'approved' instantly; coaches get 'pending'
    const status = hasRole(ctx, 'admin', 'superadmin') ? 'approved' : 'pending';

    const { data, error } = await db
      .from('coach_batch_assignments')
      .upsert({
        tenant_id: effectiveTenantId,
        coach_id: coachId,
        batch_id: batchId,
        status,
        assigned_days: assignedDays ?? null,
        requested_by: ctx.userId,
        ...(status === 'approved' ? { approved_by: ctx.userId } : {}),
      }, { onConflict: 'coach_id,batch_id' })
      .select()
      .single();

    if (error) throw error;

    return created(data);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return err('Unauthorised', 401);
    if (!hasRole(ctx, 'admin', 'superadmin')) return err('Forbidden', 403);

    const body = await req.json();
    const { assignmentId, status, assignedDays } = body;

    if (!assignmentId) return err('assignmentId is required', 422);
    if (status && !['approved', 'rejected'].includes(status)) {
      return err('status must be approved or rejected', 422);
    }

    // Validate assignedDays if provided
    if (assignedDays !== undefined && assignedDays !== null) {
      if (!Array.isArray(assignedDays) || assignedDays.some((d: unknown) => typeof d !== 'number' || d < 1 || d > 7)) {
        return err('assignedDays must be an array of integers 1-7 (Mon=1 … Sun=7)', 422);
      }
    }

    const db = adminDb();

    // Verify assignment belongs to tenant (unless superadmin)
    const assignQuery = db.from('coach_batch_assignments').select('id, tenant_id').eq('id', assignmentId);
    if (ctx.role !== 'superadmin') {
      assignQuery.eq('tenant_id', ctx.tenantId);
    }
    const { data: assignment, error: assignErr } = await assignQuery.maybeSingle();
    if (assignErr || !assignment) return err('Assignment not found in your tenant', 404);

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (status) {
      updatePayload.status = status;
      updatePayload.approved_by = ctx.userId;
    }
    if (assignedDays !== undefined) {
      updatePayload.assigned_days = assignedDays ?? null;
    }

    const { data, error } = await db
      .from('coach_batch_assignments')
      .update(updatePayload)
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) throw error;

    return ok(data);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return err('Unauthorised', 401);
    if (!hasRole(ctx, 'admin', 'superadmin')) return err('Forbidden', 403);

    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');
    const batchId = searchParams.get('batchId');

    if (!coachId || !batchId) return err('coachId and batchId are required', 422);

    const db = adminDb();

    // Verify assignment exists and belongs to tenant (unless superadmin)
    const assignQuery = db
      .from('coach_batch_assignments')
      .select('id, tenant_id')
      .eq('coach_id', coachId)
      .eq('batch_id', batchId);

    if (ctx.role !== 'superadmin') {
      assignQuery.eq('tenant_id', ctx.tenantId);
    }
    const { data: assignment, error: assignErr } = await assignQuery.maybeSingle();
    if (assignErr || !assignment) return err('Assignment not found in your tenant', 404);

    const { error } = await db
      .from('coach_batch_assignments')
      .delete()
      .eq('id', assignment.id);

    if (error) throw error;

    return ok({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}
