// GET /api/v1/orgs/{id}/finance/fee-status (Students page "Fee Status" column/stat)
import type { NextRequest } from 'next/server';
import { getFeeStatusSummary } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  return jsonData(await getFeeStatusSummary(session, id, searchParams.get('branchId') ?? undefined));
}
