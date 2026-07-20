// GET /api/v1/public/listings ?city=&sport=&area=&q=&cursor= — anonymous,
// live listings only (Doc 08 §10). No session required.
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
    cursor: searchParams.get('cursor') ?? undefined,
  });
  return jsonData(result);
}
