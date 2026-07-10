'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Thin wrapper around the classic Google Places JS SDK (AutocompleteService +
// PlacesService), loaded on demand only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
// is configured. Deliberately not typed against @google.maps/js-api-loader —
// this repo has no Google Maps dependency yet, so we treat `window.google`
// as `any` and feature-detect everywhere. Without a key, `available` stays
// false and callers should fall back to plain manual entry.

export interface PlacePrediction {
  placeId: string;
  description: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
let loadPromise: Promise<void> | null = null;

function loadGoogleMapsScript(): Promise<void> {
  if (!API_KEY) return Promise.reject(new Error('No Google Maps API key configured'));
  if (typeof window !== 'undefined' && (window as any).google?.maps?.places) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function useGooglePlaces() {
  const [available, setAvailable] = useState(false);
  const autocompleteServiceRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const sessionTokenRef = useRef<any>(null);

  useEffect(() => {
    if (!API_KEY) return;
    let cancelled = false;
    loadGoogleMapsScript()
      .then(() => {
        if (cancelled) return;
        const google = (window as any).google;
        autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
        // A dummy div is sufficient — PlacesService just needs any DOM node.
        placesServiceRef.current = new google.maps.places.PlacesService(document.createElement('div'));
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
        setAvailable(true);
      })
      .catch(() => setAvailable(false));
    return () => { cancelled = true; };
  }, []);

  // Stable identities across renders (deps: [available] only — refs are read
  // at call time regardless of when the callback was created). Without this,
  // callers that put these in a useEffect dependency array (ServiceAreaPicker
  // does, to re-search as the user types) would re-run that effect on every
  // render, since a plain function expression here gets a new identity each
  // time — that caused an infinite update loop.
  const getPredictions = useCallback((input: string, biasCity = 'Hyderabad'): Promise<PlacePrediction[]> => {
    if (!available || !autocompleteServiceRef.current || !input.trim()) return Promise.resolve([]);
    return new Promise(resolve => {
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: `${input}, ${biasCity}`,
          sessionToken: sessionTokenRef.current,
          componentRestrictions: { country: 'in' },
          // The legacy Autocomplete API only accepts ONE type collection
          // (geocode | address | establishment | (regions) | (cities)) — there's
          // no literal "apartment complex" or "premise" filter exposed.
          // 'establishment' is the closest fit: it returns named places/POIs
          // (which is how residential complexes are indexed) instead of raw
          // street addresses. We narrow further client-side below using each
          // prediction's own `types`, which DOES include premise/subpremise.
          types: ['establishment'],
        },
        (predictions: any[], status: string) => {
          if (status !== 'OK' || !predictions) return resolve([]);
          const RESIDENTIAL_LIKE_TYPES = new Set([
            'premise', 'subpremise', 'point_of_interest', 'establishment', 'neighborhood',
          ]);
          const filtered = predictions.filter((p: any) =>
            (p.types ?? []).some((t: string) => RESIDENTIAL_LIKE_TYPES.has(t))
          );
          resolve((filtered.length > 0 ? filtered : predictions).map(p => ({ placeId: p.place_id, description: p.description })));
        }
      );
    });
  }, [available]);

  const getPlaceDetails = useCallback((placeId: string): Promise<PlaceDetails | null> => {
    if (!available || !placesServiceRef.current) return Promise.resolve(null);
    return new Promise(resolve => {
      placesServiceRef.current.getDetails(
        { placeId, fields: ['name', 'formatted_address', 'geometry'], sessionToken: sessionTokenRef.current },
        (place: any, status: string) => {
          if (status !== 'OK' || !place?.geometry?.location) return resolve(null);
          resolve({
            placeId,
            name: place.name ?? '',
            formattedAddress: place.formatted_address ?? '',
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
          // Fresh session token for the next autocomplete session (billing best practice).
          sessionTokenRef.current = new (window as any).google.maps.places.AutocompleteSessionToken();
        }
      );
    });
  }, [available]);

  return { available, getPredictions, getPlaceDetails };
}
