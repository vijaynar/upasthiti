// GET /api/v1/public/categories
// Public endpoint — no authentication required.
// Returns the full categories -> subcategories -> tags taxonomy tree.
// Powers both the Coach onboarding picker and the Discovery filters so
// both surfaces share a single source of truth for the taxonomy.
//
// coachCount used to come from V1's coaches/coach_categories tables (a
// public-profile-slug + join-table pair that only ever existed in V1's
// legacy schema, migrations_v1_legacy/0002_core_schema.sql — never applied
// to V2's active database). Against V2's actual schema that 500'd
// unconditionally, for both V1 and V2 callers, regardless of this
// endpoint's data. It's counted from coach_profiles.category_id instead
// (migration 0019) — V2's real "what a coach teaches" column — now that
// that data genuinely exists.
//
// academyCount is the same idea over listings.category_id (migration 0023,
// the same taxonomy the Academies onboarding wizard now actually persists)
// — live listings only, same as /explore/academies' own search filters.
import { adminDb, ok, err } from '@/lib/api';

export async function GET() {
  try {
    const db = adminDb();

    const [
      { data: categories, error: catErr },
      { data: subcategories, error: subErr },
      { data: tags, error: tagErr },
      { data: coachProfileRows, error: cpErr },
      { data: listingRows, error: listErr },
    ] = await Promise.all([
      db.from('categories').select('id, name, slug, icon, display_order')
        .eq('is_active', true).order('display_order'),
      db.from('subcategories').select('id, category_id, name, slug, display_order')
        .eq('is_active', true).order('display_order'),
      db.from('tags').select('id, subcategory_id, tag_type, name, slug, display_order')
        .order('display_order'),
      db.from('coach_profiles').select('category_id').not('category_id', 'is', null),
      db.from('listings').select('category_id').eq('status', 'live').not('category_id', 'is', null),
    ]);

    if (catErr) throw catErr;
    if (subErr) throw subErr;
    if (tagErr) throw tagErr;
    if (cpErr) throw cpErr;
    if (listErr) throw listErr;

    const coachesByCategory = new Map<string, number>();
    for (const row of coachProfileRows ?? []) {
      if (!row.category_id) continue;
      coachesByCategory.set(row.category_id, (coachesByCategory.get(row.category_id) ?? 0) + 1);
    }

    const academiesByCategory = new Map<string, number>();
    for (const row of listingRows ?? []) {
      if (!row.category_id) continue;
      academiesByCategory.set(row.category_id, (academiesByCategory.get(row.category_id) ?? 0) + 1);
    }

    // Global tags (subcategory_id IS NULL, e.g. Board) only make sense within
    // Academic/Tuition — attaching them to every category would show a
    // "Board" filter under Sports, Music, etc.
    const academicCategoryId = (categories ?? []).find(c => c.slug === 'academic-tuition')?.id;
    const globalTags = academicCategoryId
      ? (tags ?? []).filter(t => t.subcategory_id === null)
      : [];

    const tree = (categories ?? []).map(cat => ({
      ...cat,
      coachCount: coachesByCategory.get(cat.id) ?? 0,
      academyCount: academiesByCategory.get(cat.id) ?? 0,
      subcategories: (subcategories ?? [])
        .filter(sub => sub.category_id === cat.id)
        .map(sub => ({
          ...sub,
          tags: [
            ...(cat.id === academicCategoryId ? globalTags : []),
            ...(tags ?? []).filter(t => t.subcategory_id === sub.id),
          ],
        })),
    }));

    return ok({ categories: tree });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}
