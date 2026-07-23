// GET /api/v1/public/coaches
// Public endpoint — no authentication required.
// Returns a paginated, filterable list of coaches for the Discovery search
// results page, matching wireframe 5b's baseline facets (Category,
// Speciality, Age Group, Skill Level) — the "new" facets that frame also
// shows (area+radius, mode, availability, fees, batch type, coach gender/
// languages/experience slider, trust, rating) aren't backed by any V2 data
// source yet (no coach rating/review table, no city column on coach_profiles
// beyond the free-text service_area_keys) — omitted rather than faked.
//
// Queries coach_profiles (migration 0016/0019) directly. This used to query
// V1-only coaches/coach_categories/coach_tags tables (migrations_v1_legacy),
// which never existed in V2's active schema and 500'd unconditionally —
// same class of bug /api/v1/public/categories had before migration 0019.
import { adminDb, ok, err } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const search        = searchParams.get('search')        ?? '';
    const city          = searchParams.get('city')          ?? '';
    const categoryId     = searchParams.get('categoryId')     ?? '';
    const subcategoryIds = (searchParams.get('subcategoryIds') ?? '').split(',').filter(Boolean);
    const tagIds         = (searchParams.get('tagIds')         ?? '').split(',').filter(Boolean);
    const ageGroups   = (searchParams.get('ageGroups')   ?? '').split(',').filter(Boolean);
    const skillLevels = (searchParams.get('skillLevels') ?? '').split(',').filter(Boolean);
    const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'));
    const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '12'));
    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    const db = adminDb();

    // City is only known via coach_profiles.service_area_keys (free-text
    // geo_areas.key array, migration 0018) — resolve the city to its area
    // keys first, then filter coaches whose service areas overlap.
    let cityAreaKeys: string[] | null = null;
    if (city) {
      const { data, error } = await db.from('geo_areas').select('key').eq('city_key', city);
      if (error) throw error;
      cityAreaKeys = (data ?? []).map(r => r.key);
      if (cityAreaKeys.length === 0) {
        return ok({ coaches: [], total: 0, page, limit });
      }
    }

    let query = db
      .from('coach_profiles')
      .select(
        `id, user_id, bio, experience_years, qualification, languages_known,
         age_groups, skill_levels, service_types, class_types, service_area_keys,
         category_id, subcategory_ids, primary_subcategory_id, tag_ids,
         user:users(display_name, avatar_path)`,
        { count: 'exact' }
      );

    if (categoryId)         query = query.eq('category_id', categoryId);
    if (subcategoryIds.length) query = query.overlaps('subcategory_ids', subcategoryIds);
    if (tagIds.length)      query = query.overlaps('tag_ids', tagIds);
    if (ageGroups.length)   query = query.overlaps('age_groups', ageGroups);
    if (skillLevels.length) query = query.overlaps('skill_levels', skillLevels);
    if (cityAreaKeys)   query = query.overlaps('service_area_keys', cityAreaKeys);
    if (search)         query = query.ilike('bio', `%${search}%`);

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = data ?? [];

    // Resolve category/subcategory names in bulk (coach_profiles stores ids,
    // not an embeddable FK PostgREST can join through an array column).
    const categoryIds = [...new Set(rows.map(r => r.category_id).filter(Boolean))] as string[];
    const allSubcategoryIds = [...new Set(rows.flatMap(r => r.subcategory_ids ?? []))] as string[];

    const [{ data: categories }, { data: subcategories }] = await Promise.all([
      categoryIds.length
        ? db.from('categories').select('id, name, slug, icon').in('id', categoryIds)
        : Promise.resolve({ data: [] as { id: string; name: string; slug: string; icon: string | null }[] }),
      allSubcategoryIds.length
        ? db.from('subcategories').select('id, name').in('id', allSubcategoryIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const categoryById = new Map((categories ?? []).map(c => [c.id, c]));
    const subcategoryById = new Map((subcategories ?? []).map(s => [s.id, s]));

    const coaches = rows.map((c) => {
      const category = c.category_id ? categoryById.get(c.category_id) ?? null : null;
      const primarySubcategoryName = c.primary_subcategory_id
        ? subcategoryById.get(c.primary_subcategory_id)?.name ?? null
        : null;
      const specialtyNames = (c.subcategory_ids ?? [])
        .map((id: string) => subcategoryById.get(id)?.name)
        .filter(Boolean) as string[];

      return {
        id: c.id,
        bio: c.bio,
        experienceYears: c.experience_years,
        qualification: c.qualification,
        languagesKnown: c.languages_known ?? [],
        ageGroups: c.age_groups ?? [],
        skillLevels: c.skill_levels ?? [],
        serviceTypes: c.service_types ?? [],
        classTypes: c.class_types ?? [],
        category,
        primarySubcategoryName,
        specialtyNames,
        displayName: (c.user as { display_name?: string } | null)?.display_name ?? null,
        avatarPath: (c.user as { avatar_path?: string | null } | null)?.avatar_path ?? null,
      };
    });

    return ok({ coaches, total: count ?? 0, page, limit });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}
