// GET/POST /api/v1/orgs/{id}/holidays (Doc 07 §7)
import type { NextRequest } from 'next/server';
import { listHolidays, createHoliday } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listHolidays(session, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const onDate = typeof body?.onDate === 'string' ? body.onDate : '';
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  if (!onDate || !label) return jsonError('invalid_request', 'onDate and label are required.', 400);

  try {
    const holiday = await createHoliday(session, {
      organizationId: id,
      branchId: typeof body?.branchId === 'string' ? body.branchId : null,
      onDate,
      label,
    });
    return jsonData(holiday, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to add a holiday here.', 403);
    throw err;
  }
}
