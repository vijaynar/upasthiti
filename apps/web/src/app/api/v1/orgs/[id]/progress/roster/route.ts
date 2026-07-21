// GET /api/v1/orgs/{id}/progress/roster?ownBatches=true — enrolled students the caller can log progress for
import type { NextRequest } from 'next/server';
import { listProgressRoster } from '@abhyas/module-progress';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const ownBatchesOnly = new URL(req.url).searchParams.get('ownBatches') === 'true';
  return jsonData(await listProgressRoster(session, id, ownBatchesOnly));
}
