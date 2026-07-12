'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, MapPin, Plus, Search } from 'lucide-react';
import type { ServiceArea } from '@/lib/useServiceAreas';
import { useGooglePlaces } from '@/lib/useGooglePlaces';
import { RestrictedAutocompleteInput } from '@/components/RestrictedAutocompleteInput';
import { Chip } from '@/components/Chip';

export interface SelectedCommunity {
  id: string;
  name: string;
  areaId: string;
}

export interface ServiceAreaSelection {
  areaIds: string[];
  communities: SelectedCommunity[];
}

interface ServiceAreaPickerProps {
  areas: ServiceArea[];
  value: ServiceAreaSelection;
  onChange: (value: ServiceAreaSelection) => void;
  // Localities are scoped to a city — this seeds the City field from the
  // coach's Address & Location step. The coach can still change it, which
  // re-filters which `areas` are offered below.
  defaultCity: string;
  theme?: 'light' | 'dark';
}

interface Suggestion {
  kind: 'existing' | 'place';
  key: string;
  label: string;
  communityId?: string;   // kind === 'existing'
  placeId?: string;       // kind === 'place'
}

export function ServiceAreaPicker({ areas, value, onChange, defaultCity, theme = 'light' }: ServiceAreaPickerProps) {
  const isDark = theme === 'dark';
  const { available: placesAvailable, getPredictions, getPlaceDetails } = useGooglePlaces();

  const [city, setCity] = useState(defaultCity);
  const cityTouchedRef = useRef(false);
  useEffect(() => {
    if (!cityTouchedRef.current) setCity(defaultCity);
  }, [defaultCity]);
  const handleCityChange = (v: string) => {
    cityTouchedRef.current = true;
    setCity(v);
    // Areas/communities from the previous city are no longer valid choices —
    // drop them rather than leaving them selected-but-hidden.
    const validAreaIds = new Set(
      areas.filter(a => a.city.trim().toLowerCase() === v.trim().toLowerCase()).map(a => a.id)
    );
    const areaIds = value.areaIds.filter(id => validAreaIds.has(id));
    if (areaIds.length !== value.areaIds.length) {
      onChange({ areaIds, communities: value.communities.filter(c => validAreaIds.has(c.areaId)) });
    }
  };

  const [areaFilter, setAreaFilter] = useState('');
  const [communityAreaId, setCommunityAreaId] = useState<string>('');
  const [communityInput, setCommunityInput] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);

  // Only offer localities that belong to the selected city — Tier 1 areas
  // are seeded per-city, so this is the primary scoping filter.
  const cityAreas = city.trim()
    ? areas.filter(a => a.city.trim().toLowerCase() === city.trim().toLowerCase())
    : areas;
  const availableCities = Array.from(new Set(areas.map(a => a.city))).sort();

  const selectedAreas = cityAreas.filter(a => value.areaIds.includes(a.id));

  useEffect(() => {
    if (selectedAreas.length === 0) {
      setCommunityAreaId('');
    } else if (!value.areaIds.includes(communityAreaId)) {
      setCommunityAreaId(selectedAreas[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.areaIds.join(',')]);

  // Debounced search: existing DB communities (always) + Google Places predictions (if configured).
  useEffect(() => {
    const term = communityInput.trim();
    if (!communityAreaId || term.length < 2) {
      setSuggestions(prev => (prev.length === 0 ? prev : []));
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const currentArea = areas.find(a => a.id === communityAreaId);
        const center = currentArea?.lat != null && currentArea?.lng != null
          ? { lat: currentArea.lat, lng: currentArea.lng }
          : undefined;

        const [existingRes, predictions] = await Promise.all([
          fetch(`/api/v1/public/service-communities?areaId=${communityAreaId}&search=${encodeURIComponent(term)}`)
            .then(r => r.json()).catch(() => null),
          // Centered on the selected area (not a fixed citywide point) with a
          // hard 5km cutoff — see useGooglePlaces.ts for why this needs to be
          // locationRestriction rather than the old locationBias.
          placesAvailable ? getPredictions(term, { center }) : Promise.resolve([]),
        ]);
        if (cancelled) return;

        const existing: Suggestion[] = (existingRes?.data?.communities ?? []).map((c: any) => ({
          kind: 'existing' as const,
          key: `existing:${c.id}`,
          label: c.name,
          communityId: c.id,
        }));
        const already = new Set(existing.map((s: Suggestion) => s.label.toLowerCase()));
        const places: Suggestion[] = predictions
          .filter(p => !already.has(p.description.toLowerCase()))
          .map(p => ({ kind: 'place' as const, key: `place:${p.placeId}`, label: p.description, placeId: p.placeId }));

        setSuggestions([...existing, ...places]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [communityInput, communityAreaId, placesAvailable, getPredictions]);

  const toggleArea = (areaId: string) => {
    const isSelected = value.areaIds.includes(areaId);
    const areaIds = isSelected ? value.areaIds.filter(id => id !== areaId) : [...value.areaIds, areaId];
    // Dropping an area also drops any communities that belonged only to it.
    const communities = isSelected ? value.communities.filter(c => c.areaId !== areaId) : value.communities;
    onChange({ areaIds, communities });
  };

  const removeCommunity = (communityId: string) => {
    onChange({ ...value, communities: value.communities.filter(c => c.id !== communityId) });
  };

  const addExistingCommunity = (s: Suggestion) => {
    if (!s.communityId || value.communities.some(c => c.id === s.communityId)) return;
    onChange({ ...value, communities: [...value.communities, { id: s.communityId, name: s.label, areaId: communityAreaId }] });
    setCommunityInput('');
    setSuggestions([]);
  };

  const addFromPlace = async (s: Suggestion) => {
    if (!s.placeId) return;
    setAdding(true);
    try {
      const details = await getPlaceDetails(s.placeId);
      const res = await fetch('/api/v1/public/service-communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          areaId: communityAreaId,
          name: details?.name || s.label,
          googlePlaceId: s.placeId,
          lat: details?.lat ?? null,
          lng: details?.lng ?? null,
          formattedAddress: details?.formattedAddress ?? s.label,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const c = json.data.community;
        onChange({ ...value, communities: [...value.communities, { id: c.id, name: c.name, areaId: communityAreaId }] });
      }
    } finally {
      setAdding(false);
      setCommunityInput('');
      setSuggestions([]);
    }
  };

  const addManualCommunity = async () => {
    const name = communityInput.trim();
    if (!name || !communityAreaId) return;
    setAdding(true);
    try {
      const res = await fetch('/api/v1/public/service-communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaId: communityAreaId, name }),
      });
      const json = await res.json();
      if (json.success) {
        const c = json.data.community;
        if (!value.communities.some(existing => existing.id === c.id)) {
          onChange({ ...value, communities: [...value.communities, { id: c.id, name: c.name, areaId: communityAreaId }] });
        }
      }
    } finally {
      setAdding(false);
      setCommunityInput('');
      setSuggestions([]);
    }
  };

  const inputClass = `rounded-xl px-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border ${
    isDark ? 'glass-input border-white/10 bg-[#060814] text-slate-200' : 'border-slate-200 bg-white text-slate-800'
  }`;
  const labelClass = 'block text-xs font-medium mb-1';

  const filteredAreas = areaFilter.trim()
    ? cityAreas.filter(a => a.name.toLowerCase().includes(areaFilter.trim().toLowerCase()))
    : cityAreas;

  return (
    <div className="space-y-4">
      {/* Service Areas (Tier 1) */}
      <div>
        <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
          <label className={`${labelClass} flex items-center gap-1 mb-0`}>
            <MapPin className="w-3.5 h-3.5" /> Service Areas
            <span className={`font-normal text-[10px] ml-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>(Optional — helps students find you nearby)</span>
          </label>
          {/* City — scopes which Tier 1 localities are offered below. No
              label needed; "City" as the placeholder is self-explanatory. */}
          <div className="w-48 shrink-0">
            <RestrictedAutocompleteInput
              value={city}
              onChange={handleCityChange}
              options={availableCities}
              placeholder="City"
              theme={theme}
              strict={false}
            />
          </div>
        </div>

        {cityAreas.length === 0 && (
          <p className={`text-[10px] mb-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            No localities configured yet for &ldquo;{city.trim() || '—'}&rdquo;.
          </p>
        )}

        {selectedAreas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedAreas.map(a => (
              <Chip key={a.id} theme={theme} selected removable onRemove={() => toggleArea(a.id)}>
                {a.name}
              </Chip>
            ))}
          </div>
        )}

        {cityAreas.length > 0 && (
          <>
            <div className="relative mb-1.5">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={areaFilter}
                onChange={e => setAreaFilter(e.target.value)}
                placeholder="Search localities…"
                className={`${inputClass} pl-8`}
              />
            </div>
            <div className={`flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 border rounded-xl ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50/50'}`}>
              {filteredAreas.length === 0 && (
                <span className="text-[10px] text-slate-400">No localities match &ldquo;{areaFilter}&rdquo;</span>
              )}
              {filteredAreas.map(a => {
                const isSelected = value.areaIds.includes(a.id);
                if (isSelected) return null; // already shown above as a removable chip
                return (
                  <Chip key={a.id} theme={theme} clickable onClick={() => toggleArea(a.id)}>
                    {a.name}
                  </Chip>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Communities (Tier 2) — only once at least one area is picked */}
      {selectedAreas.length > 0 && (
        <div>
          <label className={labelClass}>
            Communities / Apartment Complexes
            <span className={`font-normal text-[10px] ml-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              (Optional{placesAvailable ? ' — search a real place' : ''})
            </span>
          </label>

          {value.communities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {value.communities.map(c => (
                <Chip
                  key={c.id}
                  theme={theme}
                  selected
                  removable
                  onRemove={() => removeCommunity(c.id)}
                  trailing={
                    <span className="opacity-60 text-indigo-100">
                      · {areas.find(a => a.id === c.areaId)?.name}
                    </span>
                  }
                >
                  {c.name}
                </Chip>
              ))}
            </div>
          )}

          <div className="flex gap-1.5">
            {selectedAreas.length > 1 && (
              <select
                value={communityAreaId}
                onChange={e => setCommunityAreaId(e.target.value)}
                className={`rounded-xl px-2 py-2 text-xs w-32 shrink-0 outline-none focus:ring-1 focus:ring-indigo-500 border ${
                  isDark ? 'glass-input border-white/10 bg-[#060814] text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                }`}
              >
                {selectedAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <div className="relative flex-1">
              <input
                type="text"
                value={communityInput}
                onChange={e => setCommunityInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (suggestions.length === 0) addManualCommunity(); } }}
                placeholder={placesAvailable ? 'e.g. L&T Serene County' : 'Type a community name + Enter to add'}
                disabled={adding}
                className={inputClass}
              />
              {communityInput.trim().length >= 2 && (
                <div className={`absolute z-10 mt-1 w-full rounded-xl border shadow-lg overflow-hidden ${
                  isDark ? 'bg-[#0b0e1c] border-white/10' : 'bg-white border-slate-200'
                }`}>
                  {searching && <div className="px-3 py-2 text-[10px] text-slate-400">Searching…</div>}
                  {!searching && suggestions.map(s => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => s.kind === 'existing' ? addExistingCommunity(s) : addFromPlace(s)}
                      className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 transition-colors ${
                        isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      {s.kind === 'existing'
                        ? <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                        : <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />}
                      <span className="truncate">{s.label}</span>
                      {s.kind === 'existing' && <span className="ml-auto text-[9px] text-slate-400 shrink-0">already added by another coach</span>}
                    </button>
                  ))}
                  {!searching && suggestions.length === 0 && (
                    <button
                      type="button"
                      onClick={addManualCommunity}
                      className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 ${
                        isDark ? 'hover:bg-white/5 text-indigo-300' : 'hover:bg-slate-50 text-indigo-600'
                      }`}
                    >
                      <Plus className="w-3 h-3 shrink-0" /> Add &ldquo;{communityInput.trim()}&rdquo; as a new community
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
