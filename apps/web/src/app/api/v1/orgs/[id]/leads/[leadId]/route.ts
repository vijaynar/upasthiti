// PATCH /api/v1/orgs/{id}/leads/{leadId} — market.lead.assign (status, assigned_to)
import type { NextRequest } from 'next/server';
import { updateLead, NotAuthorizedError, type LeadStatus } from '@abhyas/module-marketplace';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const VALID_STATUSES: LeadStatus[] = ['new', 'contacted', 'trial_scheduled', 'converted', 'lost'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { leadId } = await params;
  const body = await req.json().catch(() => null);
  const status = typeof body?.status === 'string' && VALID_STATUSES.includes(body.status) ? (body.status as LeadStatus) : undefined;
  const assignedTo = typeof body?.assignedTo === 'string' ? body.assignedTo : undefined;

  try {
    const lead = await updateLead(session, leadId, { status, assignedTo });
    return jsonData(lead);
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    throw err;
  }
}
