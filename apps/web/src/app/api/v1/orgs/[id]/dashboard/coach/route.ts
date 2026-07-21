// GET /api/v1/orgs/{id}/dashboard/coach — coach-focused KPIs over the caller's
// assigned batches (my_batch_ids()). RLS + my_batch_ids() scope every figure.
import type { NextRequest } from 'next/server';
import { getCoachDashboard } from '@abhyas/module-dashboard';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await getCoachDashboard(session, id));
}
