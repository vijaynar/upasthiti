'use client';

// Public discovery marketplace (Doc 01 vision; Doc 08 §10 `/public/*`,
// anonymous, SEO-critical; PRD M9 "listings + leads"). Styled after the
// "Wireframes - Marketplace.dc.html" reference (frames 5a discovery landing
// + 5b search results, combined into one page for v1) — hero search,
// category quick-filters from the real taxonomy, result cards with a
// verified-review star rating, featured gold badge, and empty-state
// recovery (frame 5g's spirit: widen the search rather than dead-end).
//
// The wireframe's filter rail goes well beyond what this phase's schema can
// back (radius, availability, fee ranges, batch type, coach demographics —
// see marketplace/src/service.ts's header) — this page only exposes the
// facets `listings` actually stores: city, sport, area, free text.

import { useEffect, useState } from 'react';
import { Search, MapPin, Star, Sparkles } from 'lucide-react';

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface ListingSummary {
  slug: string;
  headline: string | null;
  cityKey: string;
  sportKeys: string[];
  priceDisplay: unknown;
  featured: boolean;
  avgRating: number | null;
  reviewCount: number;
}

interface Sport {
  key: string;
  label: string;
}

interface City {
  key: string;
  label: string;
}

function priceLabel(priceDisplay: unknown): string | null {
  if (priceDisplay && typeof priceDisplay === 'object' && 'amountMinor' in (priceDisplay as Record<string, unknown>)) {
    const amountMinor = (priceDisplay as { amountMinor?: number }).amountMinor;
    const per = (priceDisplay as { per?: string }).per ?? 'mo';
    if (typeof amountMinor === 'number') return `₹${(amountMinor / 100).toLocaleString('en-IN')}/${per}`;
  }
  return null;
}

export default function ExplorePage() {
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [city, setCity] = useState('');
  const [sport, setSport] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ sports: Sport[]; cities: City[] }>('/api/v1/public/taxonomy').then((t) => {
      setSports(t.sports);
      setCities(t.cities);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (sport) params.set('sport', sport);
    if (q) params.set('q', q);
    api<{ listings: ListingSummary[] }>(`/api/v1/public/listings?${params.toString()}`)
      .then((r) => setListings(r.listings))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [city, sport, q]);

  return (
    <div className="min-h-screen bg-[#f0eee9]">
      {/* hero (wireframe 5a) */}
      <div className="border-b border-neutral-900/10 bg-gradient-to-b from-white to-[#f7f5f0] px-6 py-14 text-center">
        <div className="mx-auto max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            <Sparkles className="h-3 w-3" /> Real students, real reviews, real attendance
          </span>
          <h1 className="mt-4 text-3xl font-semibold text-neutral-900">
            Find the <span className="text-blue-600">Best Coaches</span> &amp; Academies Near You
          </h1>
          <p className="mt-2 text-sm text-neutral-500">Search by city and sport to discover verified coaches and academies.</p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none sm:w-48">
              <option value="">📍 Any city</option>
              {cities.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="sport, coaching, music…"
                className="w-full rounded-lg border border-neutral-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* category quick-filters (real taxonomy_sports) */}
      <div className="mx-auto max-w-4xl px-6 pt-6">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSport('')}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${!sport ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-600'}`}
          >
            All sports
          </button>
          {sports.map((s) => (
            <button
              key={s.key}
              onClick={() => setSport(s.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${sport === s.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-600'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* results */}
      <div className="mx-auto max-w-4xl px-6 py-6">
        {loading && <p className="text-sm text-neutral-400">Loading…</p>}

        {!loading && listings.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white/60 py-14 text-center">
            <Search className="h-7 w-7 text-neutral-300" />
            <p className="text-sm font-medium text-neutral-700">No listings match yet.</p>
            <p className="max-w-xs text-xs text-neutral-500">Try a different city, or clear the sport filter to see everything nearby.</p>
            {(city || sport || q) && (
              <button
                onClick={() => { setCity(''); setSport(''); setQ(''); }}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {listings.map((listing) => {
            const price = priceLabel(listing.priceDisplay);
            return (
              <a
                key={listing.slug}
                href={`/explore/${listing.slug}`}
                className={`rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${listing.featured ? 'border-amber-400' : 'border-neutral-200'}`}
              >
                {listing.featured && (
                  <span className="mb-1.5 inline-block rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">★ Featured</span>
                )}
                <h2 className="font-semibold text-neutral-900">{listing.headline ?? listing.slug}</h2>
                <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                  <MapPin className="h-3 w-3" /> {cities.find((c) => c.key === listing.cityKey)?.label ?? listing.cityKey}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {listing.sportKeys.slice(0, 3).map((key) => (
                    <span key={key} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
                      {sports.find((s) => s.key === key)?.label ?? key}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  {listing.avgRating !== null ? (
                    <span className="flex items-center gap-1 text-xs text-neutral-600">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {listing.avgRating.toFixed(1)} ({listing.reviewCount})
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">No reviews yet</span>
                  )}
                  {price && <span className="text-sm font-semibold text-neutral-900">{price}</span>}
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
