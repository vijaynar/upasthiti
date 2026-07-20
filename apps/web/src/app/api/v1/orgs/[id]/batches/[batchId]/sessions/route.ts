// GET /api/v1/orgs/{id}/batches/{batchId}/sessions?from=&to= (Doc 07 §7, class_sessions)
import type { NextRequest } from 'next/server';
import { listClassSessions } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { batchId } = await params;
  const { searchParams } = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = searchParams.get('from') ?? today;
  const toDefault = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? toDefault;

  return jsonData(await listClassSessions(session, batchId, from, to));
}
