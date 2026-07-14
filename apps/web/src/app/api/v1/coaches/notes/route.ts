// apps/web/src/app/api/v1/coaches/notes/route.ts
// GET  /api/v1/coaches/notes?coachId=...  — list internal admin notes on a coach
// POST /api/v1/coaches/notes              — add a note
// Powers the Coach Operations Dashboard drawer's Notes tab.

import { getAuthContext, adminDb, ok, created, err, hasRole } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return err('Unauthorised', 401);
    if (!hasRole(ctx, 'admin', 'superadmin')) return err('Forbidden', 403);

    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');
    if (!coachId) return err('coachId is required', 422);

    const db = adminDb();

    const coachQuery = db.from('users').select('id, tenant_id').eq('id', coachId).eq('role', 'coach');
    if (ctx.role !== 'superadmin') {
      coachQuery.eq('tenant_id', ctx.tenantId);
    }
    const { data: coach, error: coachErr } = await coachQuery.maybeSingle();
    if (coachErr || !coach) return err('Coach not found in your tenant', 404);

    const { data, error } = await db
      .from('coach_notes')
      .select('id, note, created_at, author:author_id(first_name, last_name)')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });

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
    if (!hasRole(ctx, 'admin', 'superadmin')) return err('Forbidden', 403);

    const body = await req.json();
    const { coachId, note } = body;
    if (!coachId) return err('coachId is required', 422);
    const trimmedNote = (note ?? '').trim();
    if (!trimmedNote) return err('note is required', 422);

    const db = adminDb();

    const coachQuery = db.from('users').select('id, tenant_id').eq('id', coachId).eq('role', 'coach');
    if (ctx.role !== 'superadmin') {
      coachQuery.eq('tenant_id', ctx.tenantId);
    }
    const { data: coach, error: coachErr } = await coachQuery.maybeSingle();
    if (coachErr || !coach) return err('Coach not found in your tenant', 404);

    const { data, error } = await db
      .from('coach_notes')
      .insert({
        coach_id: coachId,
        tenant_id: coach.tenant_id,
        author_id: ctx.userId,
        note: trimmedNote,
      })
      .select('id, note, created_at')
      .single();

    if (error) throw error;

    return created(data);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}
