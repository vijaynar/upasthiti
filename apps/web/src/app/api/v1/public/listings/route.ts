// GET /api/v1/public/listings ?city=&sport=&area=&q=&categoryId=&
// subcategoryIds=&ageGroups=&skillLevels=&cursor= — anonymous, live listings
// only (Doc 08 §10). categoryId/subcategoryIds/ageGroups/skillLevels use the
// same comma-list convention as GET /api/v1/public/coaches. No session
// required.
import type { NextRequest } from 'next/server';
import { searchPublicListings } from '@abhyas/module-marketplace';
import { jsonData } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const result = await searchPublicListings({
    city: searchParams.get('city') ?? undefined,
    sport: searchParams.get('sport') ?? undefined,
    area: searchParams.get('area') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    categoryId: searchParams.get('categoryId') ?? undefined,
    subcategoryIds: (searchParams.get('subcategoryIds') ?? '').split(',').filter(Boolean),
    ageGroups: (searchParams.get('ageGroups') ?? '').split(',').filter(Boolean),
    skillLevels: (searchParams.get('skillLevels') ?? '').split(',').filter(Boolean),
    cursor: searchParams.get('cursor') ?? undefined,
  });
  return jsonData(result);
}
