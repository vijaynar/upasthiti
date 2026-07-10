'use client';

import { useEffect, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { useGooglePlaces, type PlacePrediction } from '@/lib/useGooglePlaces';

function dedupeByMainText(predictions: PlacePrediction[]): PlacePrediction[] {
  const seen = new Set<string>();
  return predictions.filter(p => {
    const key = p.mainText.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface LocalityAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  city: string;
  placeholder?: string;
  theme?: 'light' | 'dark';
}

// A free-text "Area / Locality" field enhanced with Places suggestions,
// restricted to whatever city the coach already typed above it. Unlike
// ServiceAreaPicker's community search (Step 2), this isn't backed by a
// curated coordinate table — City here is arbitrary free text (any city,
// not just Hyderabad), so there's no lat/lng to build a real
// `locationRestriction` circle around. Instead: the city name is folded
// into the query text sent to Places (Google's own relevance ranking
// naturally favors it), and results are then hard-filtered to only those
// whose returned description actually mentions that city — falling back to
// the unfiltered list only if that filter would otherwise leave nothing,
// so a city-name mismatch (e.g. "Bangalore" vs Google's "Bengaluru") can't
// turn into a dead end.
export function LocalityAutocompleteInput({ value, onChange, city, placeholder, theme = 'light' }: LocalityAutocompleteInputProps) {
  const isDark = theme === 'dark';
  const { available, getPredictions, getPlaceDetails } = useGooglePlaces();

  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const term = value.trim();
    if (!available || !city.trim() || term.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const predictions = await getPredictions(`${term}, ${city.trim()}`, { primaryTypes: [] });
        if (cancelled) return;
        const cityLower = city.trim().toLowerCase();
        // `description` (full "Indiranagar, Bengaluru, Karnataka, India" text)
        // is only used to check the city match — city/state/country are
        // already captured in their own fields above, so the dropdown itself
        // only ever displays `mainText` (just "Indiranagar"). Dedupe by that
        // shorter name since collapsing the suffix can reveal duplicates that
        // weren't duplicates in the full description.
        const inCity = predictions.filter(p => p.description.toLowerCase().includes(cityLower));
        const deduped = dedupeByMainText(inCity.length > 0 ? inCity : predictions);
        setSuggestions(deduped);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [value, city, available, getPredictions]);

  const selectSuggestion = (prediction: PlacePrediction) => {
    setOpen(false);
    setSuggestions([]);
    // Fill with exactly what was shown and clicked — Place Details'
    // `displayName` can resolve to a differently-formatted canonical name
    // (extra qualifiers, different casing) than the Autocomplete prediction's
    // `mainText`, which was confusing when it silently overrode the user's
    // visible selection.
    onChange(prediction.mainText);
    // Fire-and-forget: still call Details to close the billing session for
    // the preceding keystrokes' Autocomplete calls (see useGooglePlaces.ts
    // cost guardrails) — nothing from the response is used here.
    getPlaceDetails(prediction.placeId).catch(() => {});
  };

  const inputClass = `rounded-xl px-3 py-2 text-xs w-full outline-none border ${
    isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
  }`;

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={inputClass}
      />
      {open && value.trim().length >= 2 && (searching || suggestions.length > 0) && (
        <div className={`absolute z-10 mt-1 w-full rounded-xl border shadow-lg overflow-hidden ${
          isDark ? 'bg-[#0b0e1c] border-white/10' : 'bg-white border-slate-200'
        }`}>
          {searching && (
            <div className="px-3 py-2 text-[10px] text-slate-400 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Searching…
            </div>
          )}
          {!searching && suggestions.map(s => (
            <button
              key={s.placeId}
              type="button"
              // onMouseDown (not onClick) fires before the input's onBlur closes the dropdown.
              onMouseDown={() => selectSuggestion(s)}
              className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 transition-colors ${
                isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
              <span className="truncate">{s.mainText}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
