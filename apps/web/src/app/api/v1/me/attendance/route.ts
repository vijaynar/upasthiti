// GET /api/v1/me/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD — self attendance history
import type { NextRequest } from 'next/server';
import { listMyAttendance } from '@abhyas/module-attendance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? new Date().toISOString().slice(0, 10);

  return jsonData(await listMyAttendance(session, from, to));
}
