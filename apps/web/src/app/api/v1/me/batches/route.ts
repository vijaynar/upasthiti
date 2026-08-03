// GET /api/v1/me/batches — the signed-in student's batches across every org
// they're enrolled in (org-agnostic — see listMyBatchSummaries' comment for
// why a student has no single "active workspace" to scope this to).
import type { NextRequest } from 'next/server';
import { listMyBatchSummaries } from '@abhyas/module-dashboard';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listMyBatchSummaries(session));
}
