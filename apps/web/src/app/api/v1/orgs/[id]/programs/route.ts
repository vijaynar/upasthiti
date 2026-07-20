// GET/POST /api/v1/orgs/{id}/programs (Doc 07 §7)
import type { NextRequest } from 'next/server';
import { listPrograms, createProgram } from '@abhyas/module-scheduling';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listPrograms(session, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return jsonError('invalid_request', 'name is required.', 400);

  try {
    const program = await createProgram(session, {
      organizationId: id,
      name,
      sportKey: typeof body?.sportKey === 'string' ? body.sportKey : undefined,
      description: typeof body?.description === 'string' ? body.description : undefined,
    });
    return jsonData(program, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to create a program here.', 403);
    throw err;
  }
}
