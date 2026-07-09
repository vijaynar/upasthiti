// GET /api/v1/public/coaches
// Public endpoint — no authentication required.
// Returns a paginated, filterable list of coaches with public profile data.

import { adminDb, ok, err } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const search        = searchParams.get('search')        ?? '';
    const city          = searchParams.get('city')          ?? '';
    const area          = searchParams.get('area')          ?? '';
    const categoryId    = searchParams.get('categoryId')    ?? '';
    const subcategoryId = searchParams.get('subcategoryId') ?? '';
    const tagIds        = (searchParams.get('tagIds') ?? '').split(',').filter(Boolean);
    const ageGroup      = searchParams.get('ageGroup')      ?? '';
    const skillLevel    = searchParams.get('skillLevel')    ?? '';
    const minRating     = parseFloat(searchParams.get('minRating') ?? '0');
    const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'));
    const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '12'));
    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    const db = adminDb();

    // ── Resolve a coachIds allowlist for relational (category/tag) filters ──
    // Done as a separate step rather than a nested-embed filter on the main
    // query — PostgREST's !inner-embed filtering gets unreliable two joins
    // deep (coaches -> coach_categories -> subcategories -> categories), and
    // this keeps the main select simple and always returns each coach's full
    // badge list regardless of which filter matched.
    let coachIdAllowlist: string[] | null = null;

    if (subcategoryId) {
      const { data, error } = await db
        .from('coach_categories')
        .select('coach_id')
        .eq('subcategory_id', subcategoryId);
      if (error) throw error;
      coachIdAllowlist = (data ?? []).map(r => r.coach_id);
    } else if (categoryId) {
      const { data: subs, error: subErr } = await db
        .from('subcategories')
        .select('id')
        .eq('category_id', categoryId);
      if (subErr) throw subErr;
      const subIds = (subs ?? []).map(s => s.id);
      if (subIds.length === 0) {
        coachIdAllowlist = [];
      } else {
        const { data, error } = await db
          .from('coach_categories')
          .select('coach_id')
          .in('subcategory_id', subIds);
        if (error) throw error;
        coachIdAllowlist = (data ?? []).map(r => r.coach_id);
      }
    }

    if (tagIds.length > 0) {
      const { data, error } = await db
        .from('coach_tags')
        .select('coach_id')
        .in('tag_id', tagIds);
      if (error) throw error;
      const tagCoachIds = new Set((data ?? []).map(r => r.coach_id));
      coachIdAllowlist = coachIdAllowlist === null
        ? [...tagCoachIds]
        : coachIdAllowlist.filter(id => tagCoachIds.has(id));
    }

    // A relational filter was requested but matched nobody — short-circuit.
    if (coachIdAllowlist !== null && coachIdAllowlist.length === 0) {
      return ok({ coaches: [], total: 0, page, limit });
    }

    let query = db
      .from('coaches')
      .select(
        `id, public_profile_slug, bio, city, area, state,
         avg_rating, experience_years, service_types, class_types,
         age_groups, skill_levels,
         user_data:users(first_name, last_name, avatar_url),
         coach_categories(is_primary, subcategory:subcategories(name, slug, category:categories(name, slug, icon)))`,
        { count: 'exact' }
      )
      .not('public_profile_slug', 'is', null);

    if (coachIdAllowlist !== null) query = query.in('id', coachIdAllowlist);

    // ── Location ────────────────────────────────────────────────────
    if (city) query = query.ilike('city', `%${city}%`);
    if (area) query = query.ilike('area', `%${area}%`);

    // ── Rating ──────────────────────────────────────────────────────
    if (minRating > 0) query = query.gte('avg_rating', minRating);

    // ── Age group / skill level ────────────────────────────────────
    if (ageGroup)   query = query.contains('age_groups', [ageGroup]);
    if (skillLevel) query = query.contains('skill_levels', [skillLevel]);

    // ── Free-text search (bio) ──────────────────────────────────────
    // Category/subcategory chips are now the precise way to search by
    // skill; free text covers the coach's bio instead of the removed
    // primary_skill field.
    if (search) {
      query = query.ilike('bio', `%${search}%`);
    }

    // ── Sort + paginate ─────────────────────────────────────────────
    query = query
      .order('avg_rating', { ascending: false, nullsFirst: false })
      .range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const coaches = (data ?? []).map((c: any) => {
      const primary = (c.coach_categories ?? []).find((cc: any) => cc.is_primary);
      return {
        ...c,
        primarySubcategoryName: primary?.subcategory?.name ?? null,
      };
    });

    return ok({ coaches, total: count ?? 0, page, limit });
  } catch (e: unknown) {
    return err(
      e instanceof Error ? e.message : 'Internal server error',
      500
    );
  }
}
