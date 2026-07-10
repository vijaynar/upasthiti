# Coach Service Areas & Communities

A two-tier geography model for where a coach operates, collected during Coach
Onboarding (Step 2, before Salary & Payroll) and intended to power a future
"coaches near me" Discovery filter.

## Model

**Tier 1 — Service Areas** (`service_areas`)
A small, stable, curated list of Hyderabad localities/neighborhoods. Seeded
once via migration (50 entries), rarely changes, never coach-editable.
Coaches multi-select from this list.

**Tier 2 — Communities** (`service_communities`)
A dynamic list of specific residential communities/apartment complexes,
each scoped to one Tier 1 area. Not pre-populated — grown organically:

1. Coach picks Area(s) from Tier 1 first.
2. Coach optionally searches/types their specific community. If
   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is configured, this hits Google Places
   Autocomplete (biased to Hyderabad, India) so it resolves to a real,
   current place with a `place_id` and lat/lng.
3. The first coach to add a given place creates the row; every subsequent
   coach searching the same place (same `place_id`, or the same name within
   the same area if no Places key is configured) reuses the existing row.

## Schema (`supabase/migrations/0022_service_areas_communities.sql`)

| Table | Purpose |
|---|---|
| `service_areas` | Tier 1: `id, name, slug, city, display_order, is_active` |
| `service_communities` | Tier 2: `id, area_id -> service_areas, name, google_place_id (nullable, unique when set), lat, lng, formatted_address, created_by_coach_id -> coaches, is_active` |
| `coach_service_areas` | Join: `coach_id, area_id`, unique per pair |
| `coach_service_communities` | Join: `coach_id, community_id`, unique per pair |

Dedup strategy:
- **Resolved Places** (`google_place_id IS NOT NULL`): hard-enforced by a
  partial unique index on `service_communities(google_place_id)`.
- **Manual entries** (no Places key, or the coach's text didn't resolve):
  best-effort dedup by a case-insensitive `(area_id, name)` match in the API
  layer — not a DB constraint, since free-text names aren't a reliable
  uniqueness key.

## APIs

**`GET /api/v1/public/service-areas`** — public, no auth.
Returns the active Tier 1 list: `{ areas: [{ id, name, slug, city,
display_order }] }`.

**`GET /api/v1/public/service-communities?areaId=<uuid>&search=<text>`** — public, no auth.
Lists existing Tier 2 communities within an area matching `search` (used to
offer "reuse an existing one" before falling back to Places/manual entry).

**`POST /api/v1/public/service-communities`** — public, no auth (runs during
onboarding, before the coach account exists).
Body: `{ areaId, name, googlePlaceId?, lat?, lng?, formattedAddress? }`.
Creates a community, or returns the existing one if it's a dedup match
(`reused: true`/`false` in the response). Concurrent-insert races on the same
`place_id` are handled by catching the unique-violation and re-fetching.

**`POST /api/v1/coaches`**, **`POST /api/v1/auth/register`** — extended to
accept `serviceAreaIds: string[]` and `serviceCommunityIds: string[]`,
inserted into the two join tables alongside coach creation.

**`PUT /api/v1/coaches`** — extended to accept the same two fields and
replace the coach's join rows (delete-then-reinsert) when either is present
in the request body, so a future profile-editing UI can reuse this without
further API changes.

## UI

`apps/web/src/components/ServiceAreaPicker.tsx`, backed by
`apps/web/src/lib/useServiceAreas.ts` (Tier 1 fetch) and
`apps/web/src/lib/useGooglePlaces.ts` (thin wrapper around the classic
Places `AutocompleteService`/`PlacesService` JS SDK, loaded on demand).
Wired into `CoachOnboardingWizard.tsx` Step 2, between the category/tag
picker and the admin-only Salary & Payroll section.

`useGooglePlaces` feature-detects `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Without
it, `available` stays `false` and the community search box silently falls
back to plain manual-entry ("type a name + Enter to add"), so onboarding
works today with zero external configuration — Places autocomplete activates
automatically once a key is added, no code change required.

## Configuration

To enable live Google Places search, set in `apps/web/.env.local`:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<a Maps JavaScript API key with Places enabled>
```

Restrict the key to the app's origin(s) and to the Places API in the Google
Cloud Console. This key is intentionally a `NEXT_PUBLIC_*` var (loaded
client-side by the Maps JS SDK) — it should be an HTTP-referrer-restricted
browser key, never a service-role-equivalent secret.
