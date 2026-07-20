// GET/POST /api/v1/orgs (Doc 02 §9 — create org, workspace switcher data)
import type { NextRequest } from 'next/server';
import { createOrganization, listMyMemberships, SlugTakenError, ORG_TYPES, type OrgType } from '@abhyas/module-tenancy-rbac';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listMyMemberships(session));
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const orgType = body?.orgType;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';

  if (!ORG_TYPES.includes(orgType)) {
    return jsonError('invalid_org_type', `orgType must be one of ${ORG_TYPES.join(', ')}.`, 400);
  }
  if (!name) return jsonError('invalid_request', 'name is required.', 400);
  if (!SLUG_PATTERN.test(slug)) {
    return jsonError('invalid_slug', 'slug must be lowercase letters, numbers, and single hyphens.', 400);
  }

  try {
    const result = await createOrganization(session, { orgType: orgType as OrgType, name, slug });
    return jsonData(result, 201);
  } catch (err) {
    if (err instanceof SlugTakenError) return jsonError('slug_taken', err.message, 409);
    throw err;
  }
}
