// GET /api/v1/public/coaches
// Public endpoint — no authentication required.
// Returns a paginated, filterable list of coaches with public profile data.

import { adminDb, ok, err } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const search    = searchParams.get('search')    ?? '';
    const city      = searchParams.get('city')      ?? '';
    const area      = searchParams.get('area')      ?? '';
    const category  = searchParams.get('category')  ?? '';
    const minRating = parseFloat(searchParams.get('minRating') ?? '0');
    const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'));
    const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '12'));
    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    const db = adminDb();

    let query = db
      .from('coaches')
      .select(
        `id, public_profile_slug, primary_skill, bio, city, area, state,
         avg_rating, experience_years, service_types, class_types,
         user_data:users(first_name, last_name, avatar_url)`,
        { count: 'exact' }
      )
      .not('public_profile_slug', 'is', null);

    // ── Location ────────────────────────────────────────────────────
    if (city) query = query.ilike('city', `%${city}%`);
    if (area) query = query.ilike('area', `%${area}%`);

    // ── Rating ──────────────────────────────────────────────────────
    if (minRating > 0) query = query.gte('avg_rating', minRating);

    // ── Category / skill keyword ────────────────────────────────────
    if (category && category !== 'all') {
      query = query.ilike('primary_skill', `%${category}%`);
    }

    // ── Free-text search (primary_skill) ────────────────────────────
    if (search) {
      query = query.ilike('primary_skill', `%${search}%`);
    }

    // ── Sort + paginate ─────────────────────────────────────────────
    query = query
      .order('avg_rating', { ascending: false, nullsFirst: false })
      .range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return ok({ coaches: data ?? [], total: count ?? 0, page, limit });
  } catch (e: unknown) {
    return err(
      e instanceof Error ? e.message : 'Internal server error',
      500
    );
  }
}
