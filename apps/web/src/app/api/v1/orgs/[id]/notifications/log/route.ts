// GET /api/v1/orgs/{id}/notifications/log ?recipient=&status= (Doc 08 §21)
import type { NextRequest } from 'next/server';
import { listDeliveries } from '@abhyas/module-notifications';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  return jsonData(
    await listDeliveries(session, {
      organizationId: id,
      recipientUserId: searchParams.get('recipient') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    })
  );
}
