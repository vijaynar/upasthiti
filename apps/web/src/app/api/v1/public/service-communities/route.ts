// GET  /api/v1/public/service-communities?areaId=<uuid>&search=<text>
//      Public, no auth. Lists existing Tier 2 communities within an area so
//      the onboarding UI can offer "reuse an existing one" before falling
//      back to Google Places / manual entry.
// POST /api/v1/public/service-communities
//      Public, no auth (runs during onboarding, before the coach account
//      exists). Creates a community, or reuses an existing one if it's
//      already been added — deduped by Google's place_id when the client
//      resolved one via Places Autocomplete, otherwise by a case-insensitive
//      name match within the same area.

import { adminDb, ok, err } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const areaId = searchParams.get('areaId') ?? '';
    const search = searchParams.get('search') ?? '';

    if (!areaId) return err('areaId is required', 422);

    const db = adminDb();
    let query = db
      .from('service_communities')
      .select('id, area_id, name, formatted_address, lat, lng')
      .eq('area_id', areaId)
      .eq('is_active', true)
      .order('name')
      .limit(20);

    if (search) query = query.ilike('name', `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    return ok({ communities: data ?? [] });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { areaId, name, googlePlaceId, lat, lng, formattedAddress } = body;

    if (!areaId || !name || !String(name).trim()) {
      return err('areaId and name are required', 422);
    }

    const db = adminDb();

    const { data: area, error: areaErr } = await db
      .from('service_areas')
      .select('id')
      .eq('id', areaId)
      .eq('is_active', true)
      .maybeSingle();
    if (areaErr) throw areaErr;
    if (!area) return err('Unknown or inactive service area', 404);

    // Reuse by Google place_id — the strong, DB-enforced dedup key.
    if (googlePlaceId) {
      const { data: existing, error: findErr } = await db
        .from('service_communities')
        .select('id, area_id, name, formatted_address, lat, lng')
        .eq('google_place_id', googlePlaceId)
        .maybeSingle();
      if (findErr) throw findErr;
      if (existing) return ok({ community: existing, reused: true });
    } else {
      // No resolved place (Places not configured, or manual entry) — best-effort
      // reuse by case-insensitive name match within the same area.
      const { data: existing, error: findErr } = await db
        .from('service_communities')
        .select('id, area_id, name, formatted_address, lat, lng')
        .eq('area_id', areaId)
        .ilike('name', String(name).trim())
        .maybeSingle();
      if (findErr) throw findErr;
      if (existing) return ok({ community: existing, reused: true });
    }

    const { data: created, error: insertErr } = await db
      .from('service_communities')
      .insert({
        area_id: areaId,
        name: String(name).trim(),
        google_place_id: googlePlaceId || null,
        lat: lat ?? null,
        lng: lng ?? null,
        formatted_address: formattedAddress || null,
      })
      .select('id, area_id, name, formatted_address, lat, lng')
      .single();

    if (insertErr) {
      // Lost a race against another coach adding the same place_id concurrently.
      if (insertErr.code === '23505' && googlePlaceId) {
        const { data: existing, error: findErr } = await db
          .from('service_communities')
          .select('id, area_id, name, formatted_address, lat, lng')
          .eq('google_place_id', googlePlaceId)
          .maybeSingle();
        if (findErr) throw findErr;
        if (existing) return ok({ community: existing, reused: true });
      }
      throw insertErr;
    }

    return ok({ community: created, reused: false });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}
