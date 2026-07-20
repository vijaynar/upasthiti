// GET /api/v1/me/wards/{wardUserId}/attendance?from=&to= — guardian read (is_my_ward)
import type { NextRequest } from 'next/server';
import { listWardAttendance } from '@abhyas/module-attendance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ wardUserId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { wardUserId } = await params;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? new Date().toISOString().slice(0, 10);

  return jsonData(await listWardAttendance(session, wardUserId, from, to));
}
