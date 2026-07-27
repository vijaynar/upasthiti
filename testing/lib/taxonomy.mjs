// Fetches the platform's real reference taxonomy once per run — categories/
// subcategories/tags, taxonomy_sports, geo_cities/geo_areas — so every
// generated coach/academy/listing uses real, existing IDs/keys instead of
// inventing new ones (there is no API to create categories/cities; they're
// migration-seeded platform reference data, see testing/README.md
// "Known gaps").

export async function fetchTaxonomy(client) {
  const [taxonomy, categoriesResp] = await Promise.all([
    client.get('/api/v1/public/taxonomy'), // { sports, cities, areas }
    client.get('/api/v1/public/categories'), // legacy envelope, unwrapped by apiClient already
  ]);

  const categories = categoriesResp.categories ?? [];
  const allSubcategories = categories.flatMap((c) =>
    (c.subcategories ?? []).map((s) => ({ ...s, categoryId: c.id, categorySlug: c.slug }))
  );

  return {
    sports: taxonomy.sports ?? [],
    cities: taxonomy.cities ?? [], // [{key,label,state}] — only 6 launched cities, see README
    areas: taxonomy.areas ?? [], // [{key,cityKey,label}]
    categories, // [{id,name,slug,icon,subcategories:[...]}]
    subcategories: allSubcategories,
  };
}

export function cityForState(taxonomy, stateName) {
  return taxonomy.cities.find((c) => c.state === stateName) ?? taxonomy.cities[0];
}

export function areasForCity(taxonomy, cityKey) {
  return taxonomy.areas.filter((a) => a.cityKey === cityKey);
}

export function categoryBySlug(taxonomy, slug) {
  return taxonomy.categories.find((c) => c.slug === slug);
}

export function subcategoriesFor(taxonomy, categorySlug) {
  return taxonomy.subcategories.filter((s) => s.categorySlug === categorySlug);
}

// Maps the brief's requested category list onto this platform's real seeded
// category slugs (supabase/migrations/0006_seed_reference_data.sql) — every
// requested category has a real match except Education/Language Training/
// Robotics/Public Speaking, which live as SUBCATEGORIES under
// 'academic-tuition'/'coding-technology' rather than top-level categories.
export const REQUESTED_CATEGORY_MAP = {
  Sports: 'sports',
  Education: 'academic-tuition',
  Music: 'music',
  Dance: 'dance',
  'Martial Arts': 'martial-arts-self-defense',
  Yoga: 'yoga-wellness',
  Fitness: 'fitness',
  'Art & Craft': 'visual-arts',
  'Language Training': 'academic-tuition', // subcategory 'academic-languages'
  Coding: 'coding-technology',
  Robotics: 'coding-technology', // subcategory 'robotics'
  'Public Speaking': 'academic-tuition', // subcategory 'study-skills-counseling'
};
