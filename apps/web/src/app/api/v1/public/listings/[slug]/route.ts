// GET /api/v1/public/listings/{slug} — anonymous, live only (Doc 08 §10)
import type { NextRequest } from 'next/server';
import { getPublicListing } from '@abhyas/module-marketplace';
import { jsonData, jsonError } from '@/lib/v2-session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getPublicListing(slug);
  if (!listing) return jsonError('not_found', 'No live listing with that URL.', 404);
  return jsonData(listing);
}
