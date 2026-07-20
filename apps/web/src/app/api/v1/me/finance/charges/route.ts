// GET /api/v1/me/finance/charges — self (student) charge history
import type { NextRequest } from 'next/server';
import { listMyCharges } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listMyCharges(session));
}
