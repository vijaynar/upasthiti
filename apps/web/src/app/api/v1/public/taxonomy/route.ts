// GET /api/v1/public/taxonomy — anonymous, cacheable (Doc 08 §10)
import { getPublicTaxonomy } from '@abhyas/module-marketplace';
import { jsonData } from '@/lib/v2-session';

export async function GET() {
  const taxonomy = await getPublicTaxonomy();
  return jsonData(taxonomy);
}
