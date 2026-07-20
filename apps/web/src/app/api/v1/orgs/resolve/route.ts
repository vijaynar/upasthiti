// GET /api/v1/orgs/resolve?slug=... (Doc 02 §9 join flow — "search org / scan code")
import type { NextRequest } from 'next/server';
import { resolveOrgBySlug } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return jsonError('invalid_request', 'slug query param is required.', 400);

  const org = await resolveOrgBySlug(slug.trim().toLowerCase());
  if (!org) return jsonError('not_found', 'No organization with that URL.', 404);
  return jsonData(org);
}
