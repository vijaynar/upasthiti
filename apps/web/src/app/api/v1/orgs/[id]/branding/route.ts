// GET/PUT /api/v1/orgs/{id}/branding (Doc 02 §10 Tier 1 — in-app branding only in v1)
import type { NextRequest } from 'next/server';
import { getBranding, updateBranding } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const branding = await getBranding(session, id);
  return jsonData(branding ?? { logoPath: null, colors: null, displayName: null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const logoPath = typeof body?.logoPath === 'string' ? body.logoPath : null;
  const colors = typeof body?.colors === 'object' && body.colors !== null ? body.colors : null;
  const displayName = typeof body?.displayName === 'string' ? body.displayName : null;

  try {
    await updateBranding(session, id, { logoPath, colors, displayName });
    return jsonData({ updated: true });
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to update this organization’s branding.', 403);
    throw err;
  }
}
