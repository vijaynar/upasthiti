// GET /api/v1/orgs/{id}/finance/ledger — finance.ledger.read, most recent 200 entries
import type { NextRequest } from 'next/server';
import { listLedgerEntries } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listLedgerEntries(session, id));
}
