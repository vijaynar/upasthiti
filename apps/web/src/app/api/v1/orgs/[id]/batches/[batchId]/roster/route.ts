// GET/POST /api/v1/orgs/{id}/batches/{batchId}/roster (Doc 07 §6, batch_enrollments)
import type { NextRequest } from 'next/server';
import { listBatchRoster, addToBatchRoster } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { batchId } = await params;
  return jsonData(await listBatchRoster(session, batchId));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { batchId } = await params;
  const body = await req.json().catch(() => null);
  const enrollmentId = typeof body?.enrollmentId === 'string' ? body.enrollmentId : '';
  if (!enrollmentId) return jsonError('invalid_request', 'enrollmentId is required.', 400);

  try {
    const entry = await addToBatchRoster(session, enrollmentId, batchId);
    return jsonData(entry, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to add a student to this batch.', 403);
    throw err;
  }
}
