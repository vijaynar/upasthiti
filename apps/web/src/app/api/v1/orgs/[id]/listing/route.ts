// GET/PATCH /api/v1/orgs/{id}/listing (Doc 08 §7 — one listing per org)
import type { NextRequest } from 'next/server';
import { getMyListing, upsertMyListing, NotAuthorizedError } from '@abhyas/module-marketplace';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const listing = await getMyListing(session, id);
  return jsonData(listing);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return jsonError('invalid_request', 'A JSON body is required.', 400);

  try {
    const listing = await upsertMyListing(session, {
      organizationId: id,
      slug: typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : undefined,
      headline: typeof body.headline === 'string' ? body.headline : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      sportKeys: Array.isArray(body.sportKeys) ? body.sportKeys : undefined,
      cityKey: typeof body.cityKey === 'string' ? body.cityKey : undefined,
      areaKeys: Array.isArray(body.areaKeys) ? body.areaKeys : undefined,
      priceDisplay: body.priceDisplay,
      mediaPaths: Array.isArray(body.mediaPaths) ? body.mediaPaths : undefined,
      categoryId: typeof body.categoryId === 'string' ? body.categoryId : undefined,
      subcategoryIds: Array.isArray(body.subcategoryIds) ? body.subcategoryIds : undefined,
      primarySubcategoryId: typeof body.primarySubcategoryId === 'string' ? body.primarySubcategoryId : undefined,
      tagIds: Array.isArray(body.tagIds) ? body.tagIds : undefined,
      ageGroups: Array.isArray(body.ageGroups) ? body.ageGroups : undefined,
      skillLevels: Array.isArray(body.skillLevels) ? body.skillLevels : undefined,
    });
    return jsonData(listing);
  } catch (err) {
    if (err instanceof NotAuthorizedError) return jsonError('forbidden', err.message, 403);
    if (err instanceof Error && err.message.includes('slug and cityKey are required')) return jsonError('invalid_request', err.message, 400);
    throw err;
  }
}
