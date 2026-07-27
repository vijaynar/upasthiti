// POST /api/v1/orgs/{id}/batches/{batchId}/sessions/backfill { fromDate, toDate }
// Historical backdating capability (migration 0007_seed_historical_backdating.sql)
// — feature-flag + schedule.batch.backfill-gated, see backfillBatchSessions's
// own header comment for the full rationale. Owner/Org Admin only.
import type { NextRequest } from 'next/server';
import { backfillBatchSessions, FeatureDisabledError, NotAuthorizedError } from '@abhyas/module-scheduling';
import { writeAuditLog } from '@abhyas/module-audit';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id, batchId } = await params;
  const body = await req.json().catch(() => null);
  const fromDate = typeof body?.fromDate === 'string' ? body.fromDate : '';
  const toDate = typeof body?.toDate === 'string' ? body.toDate : '';
  if (!fromDate || !toDate) return jsonError('invalid_request', 'fromDate and toDate (YYYY-MM-DD) are required.', 400);

  try {
    const result = await backfillBatchSessions(session, { organizationId: id, batchId, fromDate, toDate });
    await writeAuditLog(session, {
      action: 'schedule.batch.backfill',
      targetType: 'batch',
      targetId: batchId,
      organizationId: id,
      detail: { fromDate, toDate, sessionsUpserted: result.sessionsUpserted },
    });
    return jsonData(result, 201);
  } catch (err) {
    if (err instanceof FeatureDisabledError) return jsonError('feature_disabled', err.message, 403);
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to backfill sessions for this batch.', 403);
    throw err;
  }
}
