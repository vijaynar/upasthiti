'use client';

// Public discovery marketplace (Doc 01 vision; Doc 08 §10 `/public/*`,
// anonymous, SEO-critical; PRD M9 "listings + leads"). Styled after the
// "Wireframes - Marketplace.dc.html" reference (frame 5a discovery landing)
// AND V1's own /explore landing (dark glass-panel theme, gradient headline,
// icon category tiles, CTA banner).
//
// Category tiles now come from GET /api/v1/public/categories — the same
// categories/subcategories/tags taxonomy (migration 0019) coach onboarding
// (CategoryPicker) uses — instead of taxonomy_sports (migration 0013, a
// flat, unrelated 12-sport list). Those were two independent taxonomies:
// a coach onboards under "Music" (categories.slug) but this page showed
// "swimming/football/cricket…" tiles with no relationship to what any coach
// actually picked, so a category here never matched what search found.
//
// Per the wireframe's "5a discovery landing -> 5b search results" two-step
// flow, clicking a tile or searching now navigates to /explore/search (its
// own filter-rail results page — see that page's header) instead of
// scrolling to an in-page section.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Search, Sparkles, ArrowRight, ChevronRight } from 'lucide-react';
import { useCategoryTaxonomy } from '@/lib/useCategoryTaxonomy';
import { useAcademyOperationEnabled } from '@/lib/useFeatureFlags';

function initials(name: string | null): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

interface TopPickCoach {
  id: string;
  experienceYears: number | null;
  category: { name: string; icon: string | null } | null;
  primarySubcategoryName: string | null;
  displayName: string | null;
  avatarPath: string | null;
}

interface City {
  key: string;
  label: string;
}

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

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

export default function ExplorePage() {
  const router = useRouter();
  const academyEnabled = useAcademyOperationEnabled();
  const { categories } = useCategoryTaxonomy();
  const [topPicks, setTopPicks] = useState<TopPickCoach[]>([]);
  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    api<{ coaches: TopPickCoach[] }>('/api/v1/public/coaches?limit=8')
      .then((r) => setTopPicks(r.coaches))
      .catch(() => setTopPicks([]));
  }, []);

  useEffect(() => {
    api<{ cities: City[] }>('/api/v1/public/taxonomy')
      .then((t) => setCities(t.cities))
      .catch(() => setCities([]));
  }, []);

  function goToSearch(patch: Record<string, string>) {
    const params = new URLSearchParams(patch);
    router.push(`/explore/search${params.toString() ? `?${params.toString()}` : ''}`);
  }

  // The hero's city field is free text (matching V1's plain <input
  // name="city">), but /explore/search's city filter is a real geo_cities
  // key (coach_profiles has no city column — filtering only works via
  // service_area_keys -> geo_areas.city_key, see the coaches API route).
  // Resolve whatever the visitor typed against the known city labels so it
  // lands pre-selected in the results page's city dropdown; an unresolved
  // typo is passed through as-is and degrades to the existing "no coaches
  // match" empty state rather than silently being dropped.
  function resolveCityKey(typed: string): string {
    const match = cities.find((c) => c.label.toLowerCase() === typed.trim().toLowerCase());
    return match?.key ?? typed.trim();
  }

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
            </span>
            {academyEnabled ? ' & Academies Near You' : ' Near You'}
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-sm text-slate-400 sm:text-base">
            Search city/area-wise and discover top-rated professionals across sports, education, music, dance and more.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const cityTyped = (data.get('city') as string) ?? '';
              const q = (data.get('q') as string) ?? '';
              const patch: Record<string, string> = {};
              if (cityTyped.trim()) patch.city = resolveCityKey(cityTyped);
              if (q.trim()) patch.q = q.trim();
              goToSearch(patch);
            }}
            className="mx-auto flex max-w-2xl flex-col gap-2 rounded-2xl border border-indigo-500/15 bg-[var(--panel-bg)] p-2 shadow-lg backdrop-blur sm:flex-row"
          >
            <div className="flex flex-1 items-center gap-2 px-3 py-1">
              <MapPin className="h-4 w-4 shrink-0 text-indigo-400" />
              <input
                name="city"
                list="explore-city-options"
                placeholder="City or Area (e.g. Hyderabad)"
                className="w-full min-w-0 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
              />
              <datalist id="explore-city-options">
                {cities.map((c) => (
                  <option key={c.key} value={c.label} />
                ))}
              </datalist>
            </div>
            <div className="hidden w-px self-stretch bg-white/10 sm:block" />
            <div className="flex flex-1 items-center gap-2 px-3 py-1">
              <Search className="h-4 w-4 shrink-0 text-slate-500" />
              <input
                name="q"
                placeholder="Sports, coaching, music…"
                className="w-full min-w-0 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
              />
            </div>
            <button
              type="submit"
              className="btn-premium flex shrink-0 items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold"
            >
              <Search className="h-4 w-4" /> Search
            </button>
          </form>
        </div>
      </section>

      {/* ── POPULAR CATEGORIES ────────────────────────────────────────── */}
      {/* Sizes match V1's /explore exactly (main branch): grid-cols-4/6/11,
          p-3 sm:p-4 tile, text-2xl icon, text-xs label — the grid-cols-11 on
          large screens is why V1's tiles land in a single row (11 categories,
          11 columns), not because they're pills in a horizontal scroller. */}
      <section className="mx-auto mb-16 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">Popular Categories</h2>
          <button onClick={() => goToSearch({})} className="flex items-center gap-1 text-xs text-indigo-400 transition-colors hover:text-indigo-300">
            View all <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-11">
          {categories.map((c, i) => {
            const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
            return (
              <button
                key={c.id}
                onClick={() => goToSearch({ categoryId: c.id })}
                className={`flex flex-col items-center gap-2 rounded-2xl border bg-gradient-to-b p-3 text-center transition-all duration-200 hover:scale-105 sm:p-4 ${color.bg} ${color.border} ${color.text}`}
              >
                <span className="text-2xl">{c.icon ?? '🏅'}</span>
                <span className="text-xs font-semibold">{c.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── TOP PICKS ────────────────────────────────────────────────── */}
      {/* Sizes match V1's /explore top-picks cards exactly: h-36 avatar
          area, p-4 body, text-sm font-bold name, ChevronRight "View Profile".
          Rating badge and location line are dropped (not faked) — V2's
          coach_profiles has no rating/review source and no city column. */}
      {topPicks.length > 0 && (
        <section className="mx-auto mb-20 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Top Picks For You</h2>
              <p className="mt-0.5 text-xs text-slate-500">Coaches ready to teach across categories</p>
            </div>
            <button onClick={() => goToSearch({})} className="flex items-center gap-1 text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300">
              View all coaches <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {topPicks.map((coach) => (
              <Link
                key={coach.id}
                href={`/coaches/${coach.id}`}
                className="glass-panel glass-panel-hover group overflow-hidden rounded-2xl transition-all duration-200"
              >
                <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-900/40 to-slate-900/60">
                  {coach.avatarPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coach.avatarPath} alt={coach.displayName ?? 'Coach'} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-indigo-500/30 bg-indigo-500/20 text-2xl font-black text-indigo-200">
                      {initials(coach.displayName)}
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 rounded-full bg-indigo-600/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                    {coach.primarySubcategoryName ?? coach.category?.name ?? 'Coach'}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="truncate text-sm font-bold text-slate-100 transition-colors group-hover:text-indigo-300">
                    Coach {coach.displayName ?? ''}
                  </h3>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-slate-500">{coach.experienceYears !== null ? `${coach.experienceYears}+ yrs exp` : ''}</span>
                    <span className="flex items-center gap-0.5 text-xs font-medium text-indigo-400">
                      View Profile <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── SUPPLY-SIDE CTA ────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="glass-panel relative overflow-hidden rounded-3xl border border-indigo-500/15 bg-indigo-500/[0.03] p-8 text-center sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5" />
          <h3 className="relative mb-3 text-2xl font-black text-white sm:text-3xl">
            {academyEnabled ? 'Are you a Coach or Academy?' : 'Are you a Coach?'}
          </h3>
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
