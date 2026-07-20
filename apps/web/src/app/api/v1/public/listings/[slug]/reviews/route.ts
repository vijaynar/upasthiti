// GET /api/v1/public/listings/{slug}/reviews — anonymous (Doc 08 §10)
import type { NextRequest } from 'next/server';
import { getPublicListingReviews } from '@abhyas/module-marketplace';
import { jsonData } from '@/lib/v2-session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const reviews = await getPublicListingReviews(slug);
  return jsonData(reviews);
}
