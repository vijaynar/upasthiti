// GET /api/v1/public/categories
// Public endpoint — no authentication required.
// Returns the full categories -> subcategories -> tags taxonomy tree.
// Powers both the Coach onboarding picker and the Discovery filters so
// both surfaces share a single source of truth for the taxonomy.

import { adminDb, ok, err } from '@/lib/api';

export async function GET() {
  try {
    const db = adminDb();

    const [
      { data: categories, error: catErr },
      { data: subcategories, error: subErr },
      { data: tags, error: tagErr },
      { data: visibleCoaches, error: coachErr },
      { data: coachCategoryRows, error: ccErr },
    ] = await Promise.all([
      db.from('categories').select('id, name, slug, icon, display_order')
        .eq('is_active', true).order('display_order'),
      db.from('subcategories').select('id, category_id, name, slug, display_order')
        .eq('is_active', true).order('display_order'),
      db.from('tags').select('id, subcategory_id, tag_type, name, slug, display_order')
        .order('display_order'),
      // Same "publicly listed" definition as /api/v1/public/coaches (has a slug).
      db.from('coaches').select('id').not('public_profile_slug', 'is', null),
      db.from('coach_categories').select('coach_id, subcategory_id'),
    ]);

    if (catErr) throw catErr;
    if (subErr) throw subErr;
    if (tagErr) throw tagErr;
    if (coachErr) throw coachErr;
    if (ccErr) throw ccErr;

    // Distinct coach count per category — a coach counts once per category
    // even if tagged to multiple subcategories within it.
    const visibleCoachIds = new Set((visibleCoaches ?? []).map(c => c.id));
    const subcategoryToCategory = new Map((subcategories ?? []).map(s => [s.id, s.category_id]));
    const coachesByCategory = new Map<string, Set<string>>();
    for (const row of coachCategoryRows ?? []) {
      if (!visibleCoachIds.has(row.coach_id)) continue;
      const categoryId = subcategoryToCategory.get(row.subcategory_id);
      if (!categoryId) continue;
      if (!coachesByCategory.has(categoryId)) coachesByCategory.set(categoryId, new Set());
      coachesByCategory.get(categoryId)!.add(row.coach_id);
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
      coachCount: coachesByCategory.get(cat.id)?.size ?? 0,
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
