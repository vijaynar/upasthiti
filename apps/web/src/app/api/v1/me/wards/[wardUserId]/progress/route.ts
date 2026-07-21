// GET /api/v1/me/wards/{wardUserId}/progress — guardian read of a ward's progress (is_my_ward)
import type { NextRequest } from 'next/server';
import { listWardProgressEntries } from '@abhyas/module-progress';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ wardUserId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { wardUserId } = await params;
  return jsonData(await listWardProgressEntries(session, wardUserId));
}
