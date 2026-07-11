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
`apps/web/src/lib/useGooglePlaces.ts` (plain `fetch()` wrapper around
**Places API (New)** — no Maps JS SDK / `<script>` loader; the whole
integration is two REST calls). Wired into `CoachOnboardingWizard.tsx` Step
2, between the category/tag picker and the admin-only Salary & Payroll
section.

Since Tier 1 areas are seeded per-city, the picker leads with a **City**
field (`RestrictedAutocompleteInput`, non-strict — suggests the distinct
cities present in `service_areas`, but doesn't hard-block other text) that
defaults to whatever city the coach entered in Step 1's Address & Location
Details, via a `defaultCity` prop. The coach can override it; only Tier 1
areas matching the current city value are then offered below, and any
previously-selected area/community from a since-abandoned city is dropped
(not just hidden) so a stale selection can't silently ride along in the
submitted payload. If no areas exist yet for the entered city, the area list
is replaced with a short "not configured yet" note instead of an empty
search box.

`useGooglePlaces` feature-detects `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Without
it, `available` stays `false` and the community search box silently falls
back to plain manual-entry ("type a name + Enter to add"), so onboarding
works today with zero external configuration — Places autocomplete activates
automatically once a key is added, no code change required.

**Autocomplete**: `POST https://places.googleapis.com/v1/places:autocomplete`
— `includedPrimaryTypes: ['premise', 'establishment', 'point_of_interest']`
restricts results to named places rather than raw street addresses (the
closest fit to "apartment complex" in Places API (New)'s Table A type list —
there's no literal "residential complex" type). `locationBias` softly biases
toward Hyderabad (doesn't hard-exclude, so seeded areas far from the bias
center still surface). Predictions that still look like a raw street address
(`/^\d+[\s,]/`, e.g. "12, Main Road…") are deprioritized client-side, not
dropped, since that's a heuristic and can misfire on legitimately-numbered
complex names.

**Place Details**: `GET https://places.googleapis.com/v1/places/{placeId}`
with a required `X-Goog-FieldMask: id,displayName,formattedAddress,location`
header — Places API (New) returns nothing unless you name the fields you
want, which also keeps billing scoped to just those fields.

Both calls carry a `sessionToken` (a client-generated UUID, rotated after
each Details call) so Google bills the whole autocomplete-then-details
sequence as one session instead of per-keystroke.

`getPredictions(input, opts)` takes an options object (`center`,
`radiusMeters`, `primaryTypes`) so different callers can restrict
differently — `primaryTypes` defaults to the residential-complex list above
when omitted; pass `[]` to opt out of type restriction entirely (Places API
(New) doesn't treat an empty array as "no restriction", so it's omitted from
the request body rather than sent literally empty).

### Step 1 — Personal Information's "Area / Locality" field

`apps/web/src/components/LocalityAutocompleteInput.tsx` is a second,
simpler consumer of the same `useGooglePlaces` hook, wired into
`CoachOnboardingWizard.tsx` Step 1 (Country/State/City/Area block). It has
no relation to the Tier 1/Tier 2 model above — City there is arbitrary free
text for any city, not just Hyderabad, so there's no lat/lng to build a real
`locationRestriction` circle around. Instead it folds the typed city into
the query text (`"<term>, <city>"`) and hard-filters the results to those
whose description actually mentions that city, falling back to the
unfiltered list only if that filter would otherwise leave nothing (guards
against a city-name mismatch like "Bangalore" vs Google's canonical
"Bengaluru" turning into a dead end). It calls `getPredictions` with
`primaryTypes: []` (no type restriction — any kind of locality is valid
here, unlike Step 2's residential-complex-only search).

## Configuration

To enable live Google Places search, set in `apps/web/.env.local`:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<a browser API key with Places API (New) enabled>
```

**"Places API (New)" must be enabled explicitly** in Google Cloud Console —
it's a distinct product from the legacy "Places API" and isn't turned on
automatically even on an existing Maps key. Restrict the key's application
restriction to HTTP referrers (your app's origin(s)); the same restriction
model applies whether the key is used by the Maps JS SDK or called directly
via `fetch()` as done here — this is a `NEXT_PUBLIC_*` var precisely because
it's meant to be used client-side, never a service-role-equivalent secret.
