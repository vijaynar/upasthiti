'use client';

import { useCallback, useRef, useState } from 'react';

// Thin wrapper around Places API (New) — plain REST, no Maps JS SDK / <script>
// loader needed (the legacy AutocompleteService/PlacesService approach this
// replaced required loading the whole Maps JS bundle just for two calls).
// Only active when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is configured; the key
// must have "Places API (New)" enabled in Google Cloud Console — that's a
// distinct product from the legacy "Places API" and isn't enabled by default
// even on an existing Maps key. Without a key, `available` stays false and
// callers should fall back to plain manual entry.

export interface PlacePrediction {
  placeId: string;
  description: string;
  /** Just the place's own name, without the trailing city/state/country —
   *  e.g. "Indiranagar" rather than "Indiranagar, Bengaluru, Karnataka,
   *  India". Prefer this over `description` when filling a short text field. */
  mainText: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Places API (New) restricts results to specific Table A place types (unlike
// the legacy API's single broad `types` collection). These are the closest
// documented types to "residential complex" — verify against Google's current
// type table if predictions come back empty/unexpected, since Google
// occasionally revises it. Used as getPredictions()'s default when the caller
// doesn't pass its own `primaryTypes` — i.e. the Service Area/Community
// picker (Step 2). Callers searching for something other than a residential
// complex (e.g. the Step 1 Area/Locality field) should pass their own list,
// or `[]` to not restrict by type at all.
const RESIDENTIAL_PRIMARY_TYPES = ['premise', 'establishment', 'point_of_interest'];

// Hard cutoff radius around the caller-supplied center (the coach's actually
// selected Tier 1 area, via service_areas.lat/lng) when none is given
// explicitly by the caller.
const DEFAULT_SEARCH_RADIUS_METERS = 5000;

// A prediction that reads like a raw street address ("12, Main Road...")
// rather than a named place — deprioritized, not excluded, since it's a
// heuristic and can misfire on legitimately-numbered complex names.
const LOOKS_LIKE_STREET_ADDRESS = /^\d+[\s,]/;

function newSessionToken(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// COST GUARDRAILS — read before touching this file.
//
// 1. SESSION TOKENS ARE WHAT MAKE AUTOCOMPLETE FREE.
//    Google only waives Autocomplete request charges when every keystroke's
//    `places:autocomplete` call AND the one terminating Place Details call
//    that follows it carry the *same* `sessionToken`. Get this wrong (new
//    token per keystroke, mismatched token on the Details call, or omitting
//    it from either call) and Autocomplete silently reverts to paid
//    per-request billing (~$2.83/1,000 as of writing) — no error, no
//    warning, just a bigger bill. `sessionTokenRef` here is the single
//    source of truth: it's created once, reused for every prediction
//    request during one search, sent again on the Details call for that
//    same search, and ONLY rotated (a fresh token minted) immediately after
//    that Details call succeeds. Do not generate a new token anywhere else.
//
// 2. PLACE DETAILS PRICING IS SET BY THE MOST EXPENSIVE FIELD YOU ASK FOR,
//    NOT WHAT YOU ACTUALLY USE.
//    The `X-Goog-FieldMask` on getPlaceDetails() below is deliberately
//    exactly `id,displayName,formattedAddress,location` — the cheapest
//    (Essentials-tier) field set. If you need another field, check its
//    pricing SKU *before* adding it: `rating`/`userRatingCount` alone jumps
//    the ENTIRE call to Pro tier; `reviews`, `regularOpeningHours`, or any
//    "atmosphere" category field jumps it to Enterprise/Enterprise+Atmosphere.
//    This applies per-call, not per-field — one convenience field bumps the
//    price of everything else in that same request too. Never widen this
//    field mask "just in case" or to match a field list used elsewhere.
// ─────────────────────────────────────────────────────────────────────────

export function useGooglePlaces() {
  const [available] = useState(() => Boolean(API_KEY && API_KEY.trim()));
  // One token per search session — see cost-guardrails comment above.
  // getPredictions() reuses this on every keystroke; getPlaceDetails() reads
  // it once more to close the session, then rotates it. Nothing else should
  // read or write this ref.
  const sessionTokenRef = useRef<string>(newSessionToken());

  const getPredictions = useCallback(async (
    input: string,
    opts: { center?: { lat: number; lng: number }; radiusMeters?: number; primaryTypes?: string[] } = {}
  ): Promise<PlacePrediction[]> => {
    if (!available || !input.trim()) return [];

    const { center, radiusMeters = DEFAULT_SEARCH_RADIUS_METERS, primaryTypes = RESIDENTIAL_PRIMARY_TYPES } = opts;

    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY as string,
        },
        body: JSON.stringify({
          input,
          // Omit entirely (rather than sending `[]`) when the caller opts out
          // of type restriction — an empty array is not guaranteed to mean
          // "no restriction" to the API.
          ...(primaryTypes.length > 0 ? { includedPrimaryTypes: primaryTypes } : {}),
          // locationRestriction is a HARD cutoff (unlike locationBias, which
          // only re-ranks and can still surface results well outside it) —
          // centered on wherever the caller says to center it (e.g. the
          // coach's actually-selected Tier 1 area for Step 2, so a Gachibowli
          // search can't surface Shamshabad ~40km away). Omitted entirely if
          // the caller has no coordinates, rather than falling back to a
          // generic point that would misleadingly restrict the radius around
          // the wrong place.
          ...(center ? {
            locationRestriction: {
              circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusMeters },
            },
          } : {}),
          includedRegionCodes: ['in'],
          sessionToken: sessionTokenRef.current,
        }),
      });
      if (!res.ok) return [];

      const data = await res.json();
      const predictions: PlacePrediction[] = (data.suggestions ?? [])
        .filter((s: any) => s.placePrediction)
        .map((s: any) => ({
          placeId: s.placePrediction.placeId,
          description: s.placePrediction.text?.text ?? '',
          mainText: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? '',
        }));

      // Deprioritize (not drop) address-looking results — stable partition
      // keeps relative order within each bucket.
      return [
        ...predictions.filter(p => !LOOKS_LIKE_STREET_ADDRESS.test(p.description)),
        ...predictions.filter(p => LOOKS_LIKE_STREET_ADDRESS.test(p.description)),
      ];
    } catch {
      return [];
    }
  }, [available]);

  const getPlaceDetails = useCallback(async (placeId: string): Promise<PlaceDetails | null> => {
    if (!available) return null;

    // Must reuse the SAME token the preceding autocomplete keystrokes used —
    // this is what links the two calls into one billed session instead of
    // paid per-request Autocomplete pricing. Read it before rotating below.
    const sessionToken = sessionTokenRef.current;

    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${encodeURIComponent(sessionToken)}`,
        {
          headers: {
            'X-Goog-Api-Key': API_KEY as string,
            // Places API (New) returns nothing unless you name the fields you
            // want. KEEP THIS EXACT LIST — see the cost-guardrails comment
            // above before adding anything (rating/reviews/atmosphere fields
            // jump the whole call to a more expensive pricing tier).
            'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
          },
        }
      );
      if (!res.ok) return null;

      const place = await res.json();
      if (!place?.location) return null;

      // Session is now closed by this Details call — mint a fresh token for
      // the next distinct search. Do NOT reuse `sessionToken` again.
      sessionTokenRef.current = newSessionToken();
      return {
        placeId,
        name: place.displayName?.text ?? '',
        formattedAddress: place.formattedAddress ?? '',
        lat: place.location.latitude,
        lng: place.location.longitude,
      };
    } catch {
      return null;
    }
  }, [available]);

  return { available, getPredictions, getPlaceDetails };
}
