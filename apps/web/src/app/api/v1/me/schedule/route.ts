// GET /api/v1/me/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD — the signed-in
// student's upcoming sessions across every active batch, in every org
// they're enrolled in (org-agnostic, replaces the old per-batch client-side
// fan-out that required an active workspace first).
import type { NextRequest } from 'next/server';
import { listMyUpcomingSessions } from '@abhyas/module-dashboard';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? new Date().toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return jsonData(await listMyUpcomingSessions(session, from, to));
}
