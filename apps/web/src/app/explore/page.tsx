'use client';

// Public discovery marketplace (Doc 01 vision; Doc 08 §10 `/public/*`,
// anonymous, SEO-critical; PRD M9 "listings + leads"). Styled after the
// "Wireframes - Marketplace.dc.html" reference (frames 5a discovery landing
// + 5b search results, combined into one page for v1) AND V1's own /explore
// landing (dark glass-panel theme, gradient headline, icon category tiles,
// CTA banner) — this page had drifted into a bespoke light theme that
// clashed with the rest of the app (everything else defaults dark via
// ThemeProvider/globals.css); this rewrite uses the same glass-panel/
// btn-premium/radial-mesh-bg system as /admin and /auth/login instead of
// hardcoded neutral/blue Tailwind classes.
//
// The wireframe's filter rail goes well beyond what this phase's schema can
// back (radius, availability, fee ranges, batch type, coach demographics —
// see marketplace/src/service.ts's header) — this page only exposes the
// facets `listings` actually stores: city, sport, area, free text.
//
// Search is live (every city/sport/q change refetches — no separate results
// route to "go to"), but nothing signalled that to a V1-trained eye: no
// visible Search button, no distinct "results" section. Added both — the
// hero's Search button scrolls to #results, which now has its own heading
// + live count.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, Star, Sparkles, ArrowRight } from 'lucide-react';

// Emoji glyphs for the fixed sport set seeded in taxonomy_sports (migration
// 0013) — matches V1's per-category `icon` column and the wireframe's
// "Popular categories" tiles, but as a static map since taxonomy_sports
// itself has no icon column (key/label/category only).
const SPORT_ICONS: Record<string, string> = {
  swimming: '🏊',
  football: '⚽',
  cricket: '🏏',
  basketball: '🏀',
  badminton: '🏸',
  tennis: '🎾',
  chess: '♟️',
  yoga: '🧘',
  dance: '💃',
  music: '🎵',
  athletics: '🏃',
  martial_arts: '🥋',
};

// Same cycling palette V1's /explore used for category tiles (main branch,
// apps/web/src/app/explore/page.tsx CATEGORY_COLORS).
const CATEGORY_COLORS = [
  { bg: 'from-indigo-500/15 to-indigo-600/5', border: 'border-indigo-500/20', text: 'text-indigo-300' },
  { bg: 'from-purple-500/15 to-purple-600/5', border: 'border-purple-500/20', text: 'text-purple-300' },
  { bg: 'from-pink-500/15 to-pink-600/5', border: 'border-pink-500/20', text: 'text-pink-300' },
  { bg: 'from-rose-500/15 to-rose-600/5', border: 'border-rose-500/20', text: 'text-rose-300' },
  { bg: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/20', text: 'text-emerald-300' },
  { bg: 'from-amber-500/15 to-amber-600/5', border: 'border-amber-500/20', text: 'text-amber-300' },
  { bg: 'from-cyan-500/15 to-cyan-600/5', border: 'border-cyan-500/20', text: 'text-cyan-300' },
  { bg: 'from-slate-500/15 to-slate-600/5', border: 'border-slate-500/20', text: 'text-slate-300' },
];

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
  const resultsRef = useRef<HTMLDivElement>(null);

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

  function goToResults() {
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const activeSportLabel = sport ? sports.find((s) => s.key === sport)?.label : null;

  return (
    <div>
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 py-16 sm:px-6 lg:py-24">
        <div className="pointer-events-none absolute left-1/4 top-0 h-[350px] w-[500px] rounded-full bg-indigo-500/[0.08] blur-[120px]" />
        <div className="pointer-events-none absolute right-1/4 top-6 h-[260px] w-[350px] rounded-full bg-purple-500/[0.06] blur-[100px]" />

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" /> Real students, real reviews, real attendance
          </span>
          <h1 className="mb-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Find the{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Best Coaches
            </span>{' '}
            &amp; Academies Near You
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-sm text-slate-400 sm:text-base">
            Search by city and sport to discover verified coaches and academies.
          </p>

          <div className="mx-auto flex max-w-2xl flex-col gap-2 rounded-2xl border border-indigo-500/15 bg-[var(--panel-bg)] p-2 shadow-lg backdrop-blur sm:flex-row">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none sm:w-44"
            >
              <option value="">📍 Any city</option>
              {cities.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') goToResults(); }}
                placeholder="sport, coaching, music…"
                className="glass-input w-full rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none"
              />
            </div>
            <button
              onClick={goToResults}
              className="btn-premium flex shrink-0 items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold"
            >
              <Search className="h-4 w-4" /> Search
            </button>
          </div>
        </div>
      </section>

      {/* ── POPULAR CATEGORIES ────────────────────────────────────────── */}
      <section className="mx-auto mb-12 max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-5 text-base font-bold text-slate-100">Popular Categories</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <button
            onClick={() => { setSport(''); goToResults(); }}
            className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all duration-200 hover:scale-105 sm:p-4 ${
              !sport ? 'border-indigo-400/60 bg-indigo-500/15 text-indigo-200' : 'border-white/10 bg-white/[0.03] text-slate-400'
            }`}
          >
            <span className="text-2xl">🏅</span>
            <span className="text-xs font-semibold">All sports</span>
          </button>
          {sports.map((s, i) => {
            const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
            const active = sport === s.key;
            return (
              <button
                key={s.key}
                onClick={() => { setSport(s.key); goToResults(); }}
                className={`flex flex-col items-center gap-2 rounded-2xl border bg-gradient-to-b p-3 text-center transition-all duration-200 hover:scale-105 sm:p-4 ${color.bg} ${color.text} ${
                  active ? 'border-2 border-current' : color.border
                }`}
              >
                <span className="text-2xl">{SPORT_ICONS[s.key] ?? '🏅'}</span>
                <span className="text-xs font-semibold">{s.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── RESULTS ──────────────────────────────────────────────────── */}
      <section ref={resultsRef} id="results" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-5">
          <h2 className="text-base font-bold text-slate-100">{activeSportLabel ?? 'All'} results</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {loading ? 'Searching…' : `${listings.length} result${listings.length === 1 ? '' : 's'} found`}
          </p>
        </div>

        {!loading && listings.length === 0 && (
          <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 py-14 text-center">
            <Search className="h-7 w-7 text-slate-600" />
            <p className="text-sm font-medium text-slate-300">No listings match yet.</p>
            <p className="max-w-xs text-xs text-slate-500">Try a different city, or clear the sport filter to see everything nearby.</p>
            {(city || sport || q) && (
              <button
                onClick={() => { setCity(''); setSport(''); setQ(''); }}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.08]"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => {
            const price = priceLabel(listing.priceDisplay);
            return (
              <a
                key={listing.slug}
                href={`/explore/${listing.slug}`}
                className={`glass-panel glass-panel-hover block rounded-2xl p-4 transition-all duration-200 ${
                  listing.featured ? 'border-amber-400/40' : ''
                }`}
              >
                {listing.featured && (
                  <span className="mb-1.5 inline-block rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                    ★ Featured
                  </span>
                )}
                <h3 className="font-semibold text-slate-100">{listing.headline ?? listing.slug}</h3>
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3 w-3" /> {cities.find((c) => c.key === listing.cityKey)?.label ?? listing.cityKey}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {listing.sportKeys.slice(0, 3).map((key) => (
                    <span key={key} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-slate-400">
                      {sports.find((s) => s.key === key)?.label ?? key}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  {listing.avgRating !== null ? (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {listing.avgRating.toFixed(1)} ({listing.reviewCount})
                    </span>
                  ) : (
                    <span className="text-xs text-slate-600">No reviews yet</span>
                  )}
                  {price && <span className="text-sm font-semibold text-white">{price}</span>}
                </div>
              </a>
            );
          })}
        </div>

        {/* ── SUPPLY-SIDE CTA ────────────────────────────────────────── */}
        <div className="glass-panel relative mt-12 overflow-hidden rounded-3xl border border-indigo-500/15 bg-indigo-500/[0.03] p-8 text-center sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5" />
          <h3 className="relative mb-3 text-2xl font-black text-white sm:text-3xl">Are you a Coach or Academy?</h3>
          <p className="relative mx-auto mb-6 max-w-md text-sm text-slate-400">
            List your profile on Abhyas and reach thousands of students looking for quality coaching in your city.
          </p>
          <Link
            href="/auth/login"
            className="btn-premium relative inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold"
          >
            Get Listed Free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
