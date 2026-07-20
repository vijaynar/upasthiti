// GET/POST /api/v1/orgs/{id}/branches (Doc 02 §4)
import type { NextRequest } from 'next/server';
import { listBranches, createBranch } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listBranches(session, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return jsonError('invalid_request', 'name is required.', 400);

  try {
    const branchId = await createBranch(session, id, name);
    return jsonData({ branchId }, 201);
  } catch (err) {
    if (isRlsDenied(err)) {
      return jsonError('forbidden', 'You do not have permission to add a branch to this organization.', 403);
    }
    throw err;
  }
}
