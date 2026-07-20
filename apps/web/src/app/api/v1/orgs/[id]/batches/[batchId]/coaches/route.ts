// GET/POST /api/v1/orgs/{id}/batches/{batchId}/coaches (Doc 07 §5, coach_assignments)
import type { NextRequest } from 'next/server';
import { listCoachAssignments, assignCoach } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { batchId } = await params;
  return jsonData(await listCoachAssignments(session, batchId));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { batchId } = await params;
  const body = await req.json().catch(() => null);
  const membershipId = typeof body?.membershipId === 'string' ? body.membershipId : '';
  if (!membershipId) return jsonError('invalid_request', 'membershipId is required.', 400);

  try {
    const assignment = await assignCoach(session, {
      batchId,
      membershipId,
      role: body?.role === 'assistant' ? 'assistant' : 'primary',
      days: Array.isArray(body?.days) ? body.days : undefined,
    });
    return jsonData(assignment, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to assign coaches to this batch.', 403);
    throw err;
  }
}
