// GET /api/v1/platform/audit-log (Doc 07 §16, wireframe 4e)
import type { NextRequest } from 'next/server';
import { listAuditLog } from '@abhyas/module-audit';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('orgId') ?? undefined;
  return jsonData(await listAuditLog(session, { organizationId }));
}
