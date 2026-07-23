// GET /api/v1/public/coaches/:id
// Public endpoint — no authentication required.
// Coach profile detail for the Discovery search results page (wireframe 5b
// result cards link out to a detail view). coach_profiles has no public
// slug (unlike V1's coaches.public_profile_slug) — the row id is the only
// stable public identifier, so it's used directly as the route param.
import { adminDb, ok, err } from '@/lib/api';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = adminDb();

    const { data: coach, error } = await db
      .from('coach_profiles')
      .select(
        `id, bio, experience_years, qualification, languages_known,
         age_groups, skill_levels, service_types, class_types,
         category_id, subcategory_ids, primary_subcategory_id, tag_ids,
         user:users(display_name, avatar_path)`
      )
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!coach) return ok(null);

    const [{ data: category }, { data: subcategories }, { data: tags }] = await Promise.all([
      coach.category_id
        ? db.from('categories').select('id, name, slug, icon').eq('id', coach.category_id).maybeSingle()
        : Promise.resolve({ data: null as { id: string; name: string; slug: string; icon: string | null } | null }),
      (coach.subcategory_ids ?? []).length
        ? db.from('subcategories').select('id, name').in('id', coach.subcategory_ids ?? [])
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      (coach.tag_ids ?? []).length
        ? db.from('tags').select('id, name').in('id', coach.tag_ids ?? [])
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const primarySubcategoryName = coach.primary_subcategory_id
      ? (subcategories ?? []).find(s => s.id === coach.primary_subcategory_id)?.name ?? null
      : null;

    return ok({
      id: coach.id,
      bio: coach.bio,
      experienceYears: coach.experience_years,
      qualification: coach.qualification,
      languagesKnown: coach.languages_known ?? [],
      ageGroups: coach.age_groups ?? [],
      skillLevels: coach.skill_levels ?? [],
      serviceTypes: coach.service_types ?? [],
      classTypes: coach.class_types ?? [],
      category,
      primarySubcategoryName,
      specialtyNames: (subcategories ?? []).map(s => s.name),
      tagNames: (tags ?? []).map(t => t.name),
      displayName: (coach.user as { display_name?: string } | null)?.display_name ?? null,
      avatarPath: (coach.user as { avatar_path?: string | null } | null)?.avatar_path ?? null,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}
