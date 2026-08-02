// DELETE/PATCH /api/v1/orgs/{id}/progress/metrics/{metricId} — remove an
// org-custom metric definition / set its goal (target_value), consumed by
// student batch-progress rings (docsV2/STUDENT_PORTAL_SPEC.md).
import type { NextRequest } from 'next/server';
import { deleteMetricDefinition, setMetricTarget, NotAuthorizedError } from '@abhyas/module-progress';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ metricId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { metricId } = await params;
  try {
    await deleteMetricDefinition(session, metricId);
    return jsonData({ deleted: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ metricId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { metricId } = await params;
  const body = await req.json().catch(() => null);
  if (!Object.prototype.hasOwnProperty.call(body ?? {}, 'targetValue')) {
    return jsonError('invalid_request', 'targetValue is required (a number, or null to clear it).', 400);
  }
  const targetValue = typeof body.targetValue === 'number' ? body.targetValue : null;

  try {
    await setMetricTarget(session, metricId, targetValue);
    return jsonData({ updated: true });
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
