// GET /api/v1/public/service-areas
// Public endpoint — no authentication required.
// Returns the fixed, low-churn Tier 1 list of service areas (localities)
// coaches pick from during onboarding and Discovery filters by.

import { adminDb, ok, err } from '@/lib/api';

export async function GET() {
  try {
    const db = adminDb();

    const { data, error } = await db
      .from('service_areas')
      .select('id, name, slug, city, display_order')
      .eq('is_active', true)
      .order('display_order');

    if (error) throw error;

    return ok({ areas: data ?? [] });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}
