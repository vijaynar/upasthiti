// POST /api/v1/orgs/{id}/batches/{batchId}/sessions/{sessionId}/attendance/face-check-in
// US-3: receives a 128-float face embedding computed client-side
// (face-api.js), matches it against the batch's enrolled faces, and either
// records attendance (high confidence), queues it for staff review (low
// confidence — never auto-fines), or reports no match (manual check-in
// required).
import type { NextRequest } from 'next/server';
import { checkInByFace, FACE_EMBEDDING_DIMENSIONS } from '@abhyas/module-attendance';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string; sessionId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { batchId, sessionId } = await params;
  const body = await req.json().catch(() => null);
  const embedding = body?.embedding;

  if (!Array.isArray(embedding) || embedding.length !== FACE_EMBEDDING_DIMENSIONS || embedding.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    return jsonError('invalid_request', `embedding must be an array of ${FACE_EMBEDDING_DIMENSIONS} finite numbers.`, 400);
  }

  try {
    const outcome = await checkInByFace(session, sessionId, batchId, embedding);
    return jsonData(outcome, outcome.outcome === 'recorded' ? 201 : 200);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to record attendance here.', 403);
    throw err;
  }
}
