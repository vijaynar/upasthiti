// GET/POST /api/v1/orgs/{id}/batches (Doc 07 §7)
import type { NextRequest } from 'next/server';
import { listBatches, listMyBatches, createBatch, type BatchMode, type BatchSchedule } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const VALID_MODES: BatchMode[] = ['in_person', 'online', 'hybrid'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const { searchParams } = new URL(req.url);

  // ?mine=true — "batches I coach" (my_batch_ids()), e.g. the announcement
  // composer's audience picker. Distinct from the org-wide staff listing
  // below, which needs schedule.calendar.read at branch scope.
  if (searchParams.get('mine') === 'true') {
    return jsonData(await listMyBatches(session));
  }

  return jsonData(
    await listBatches(session, {
      organizationId: id,
      branchId: searchParams.get('branchId') ?? undefined,
      status: (searchParams.get('status') as 'active' | 'archived' | null) ?? undefined,
    })
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const branchId = typeof body?.branchId === 'string' ? body.branchId : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const mode = typeof body?.mode === 'string' && VALID_MODES.includes(body.mode) ? (body.mode as BatchMode) : undefined;
  const schedule = body?.schedule as BatchSchedule | undefined;

  if (!branchId || !name) return jsonError('invalid_request', 'branchId and name are required.', 400);
  if (!schedule || !Array.isArray(schedule.days) || !schedule.startTime || !schedule.endTime || !schedule.startDate) {
    return jsonError('invalid_request', 'schedule.{days,startTime,endTime,startDate} are required.', 400);
  }

  try {
    const batch = await createBatch(session, {
      organizationId: id,
      branchId,
      name,
      mode,
      programId: typeof body?.programId === 'string' ? body.programId : undefined,
      capacity: typeof body?.capacity === 'number' ? body.capacity : undefined,
      schedule,
      graceMinutes: typeof body?.graceMinutes === 'number' ? body.graceMinutes : undefined,
    });
    return jsonData(batch, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to create a batch here.', 403);
    throw err;
  }
}
