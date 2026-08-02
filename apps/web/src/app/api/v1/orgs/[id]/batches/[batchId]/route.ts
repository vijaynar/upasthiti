// GET/PATCH /api/v1/orgs/{id}/batches/{batchId} (Doc 07 §7)
import type { NextRequest } from 'next/server';
import { getBatch, updateBatch, setBatchPrimaryMetric, NotAuthorizedError, type BatchMode, type BatchStatus, type BatchSchedule } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const VALID_MODES: BatchMode[] = ['in_person', 'online', 'hybrid'];
const VALID_STATUSES: BatchStatus[] = ['active', 'archived'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { batchId } = await params;
  const batch = await getBatch(session, batchId);
  if (!batch) return jsonError('not_found', 'Batch not found.', 404);
  return jsonData(batch);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { batchId } = await params;
  const body = await req.json().catch(() => null);
  const mode = typeof body?.mode === 'string' && VALID_MODES.includes(body.mode) ? (body.mode as BatchMode) : undefined;
  const status = typeof body?.status === 'string' && VALID_STATUSES.includes(body.status) ? (body.status as BatchStatus) : undefined;
  const schedule = body?.schedule as BatchSchedule | undefined;

  try {
    await updateBatch(session, batchId, {
      name: typeof body?.name === 'string' ? body.name : undefined,
      mode,
      capacity: Object.prototype.hasOwnProperty.call(body ?? {}, 'capacity') ? body.capacity : undefined,
      status,
      schedule,
      graceMinutes: typeof body?.graceMinutes === 'number' ? body.graceMinutes : undefined,
    });
    // Separate call, not folded into updateBatch's patch — primaryMetricKey's
    // null is a meaningful "stop tracking" value, not a coalesce no-op (see
    // setBatchPrimaryMetric's own comment).
    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'primaryMetricKey')) {
      const key = typeof body.primaryMetricKey === 'string' ? body.primaryMetricKey : null;
      await setBatchPrimaryMetric(session, batchId, key);
    }
    return jsonData({ updated: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
