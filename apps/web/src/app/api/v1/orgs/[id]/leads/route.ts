// GET /api/v1/orgs/{id}/leads (Doc 08 §7) — market.lead.read
import type { NextRequest } from 'next/server';
import { listLeads, type LeadStatus } from '@abhyas/module-marketplace';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const leads = await listLeads(session, {
    organizationId: id,
    status: (searchParams.get('status') as LeadStatus | null) ?? undefined,
  });
  return jsonData(leads);
}
