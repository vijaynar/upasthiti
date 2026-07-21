// DELETE /api/v1/orgs/{id}/progress/metrics/{metricId} — remove an org-custom metric definition
import type { NextRequest } from 'next/server';
import { deleteMetricDefinition, NotAuthorizedError } from '@abhyas/module-progress';
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
