'use client';

// Academies discovery — the "Academies" nav counterpart to /explore/search
// (coaches). Same results-grid layout AND same filter rail (Category ->
// Speciality, Age Group, Skill Level), backed by GET /api/v1/public/listings
// (org listings, Doc 08 §10) instead of coach_profiles. As of migration 0023
// listings carry the same categories/subcategories/tags/age_groups/
// skill_levels taxonomy coach_profiles does — the Academies onboarding
// wizard already collected this in its Step 3 picker, it just wasn't
// persisted anywhere until now — so this filters on real data, not a
// lookalike UI over a different taxonomy. City/text search stay listings-
// specific (coach_profiles has no city column, listings has no free-text
// bio), and pagination is cursor-based ("Load more") since listings has no
// total count. Each card links to /explore/[slug], the existing listing
// detail + lead-capture page.

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, MapPin, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useCategoryTaxonomy, type Category } from '@/lib/useCategoryTaxonomy';
import { Chip } from '@/components/Chip';

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface ListingCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

interface ListingResult {
  slug: string;
  headline: string | null;
  cityKey: string;
  sportKeys: string[];
  priceDisplay: unknown;
  mediaPaths: string[] | null;
  featured: boolean;
  avgRating: number | null;
  reviewCount: number;
  category: ListingCategory | null;
  primarySubcategoryName: string | null;
  specialtyNames: string[];
}

interface City {
  key: string;
  label: string;
}

const AGE_GROUPS = ['Kids', 'Teens', 'Adults'];
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

// Same free-text-with-datalist resolution /explore's hero and /explore/search
// use — match the typed label case-insensitively against known cities, fall
// back to the raw text so an unresolved typo still degrades to the existing
// "no results" state.
function resolveCityKey(typed: string, cities: City[]): string {
  const match = cities.find((c) => c.label.toLowerCase() === typed.trim().toLowerCase());
  return match?.key ?? typed.trim();
}

function priceLabel(priceDisplay: unknown): string | null {
  if (priceDisplay && typeof priceDisplay === 'object' && 'amountMinor' in (priceDisplay as Record<string, unknown>)) {
    const amountMinor = (priceDisplay as { amountMinor?: number }).amountMinor;
    const per = (priceDisplay as { per?: string }).per ?? 'mo';
    if (typeof amountMinor === 'number') return `₹${(amountMinor / 100).toLocaleString('en-IN')}/${per}`;
  }
  return null;
}

export default function AcademiesPage() {
  return (
    <Suspense fallback={null}>
      <AcademiesSearch />
    </Suspense>
  );
}

function AcademiesSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { categories } = useCategoryTaxonomy();
  const [cities, setCities] = useState<City[]>([]);
  const [listings, setListings] = useState<ListingResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const qInputRef = useRef<HTMLInputElement>(null);

  const categoryId = searchParams.get('categoryId') ?? '';
  const subcategoryIds = (searchParams.get('subcategoryIds') ?? '').split(',').filter(Boolean);
  const ageGroups = (searchParams.get('ageGroups') ?? '').split(',').filter(Boolean);
  const skillLevels = (searchParams.get('skillLevels') ?? '').split(',').filter(Boolean);
  const city = searchParams.get('city') ?? '';
  const q = searchParams.get('q') ?? '';

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      router.push(`/explore/academies?${next.toString()}`);
    },
    [router, searchParams]
  );

  useEffect(() => {
    api<{ cities: City[] }>('/api/v1/public/taxonomy').then((t) => setCities(t.cities)).catch(() => {});
  }, []);

  function submitSearch() {
    const cityTyped = cityInputRef.current?.value ?? '';
    const qTyped = qInputRef.current?.value ?? '';
    setParams({
      city: cityTyped.trim() ? resolveCityKey(cityTyped, cities) : null,
      q: qTyped.trim() || null,
    });
  }

  function buildQuery(cursor?: string) {
    const params = new URLSearchParams();
    if (categoryId) params.set('categoryId', categoryId);
    if (subcategoryIds.length) params.set('subcategoryIds', subcategoryIds.join(','));
    if (ageGroups.length) params.set('ageGroups', ageGroups.join(','));
    if (skillLevels.length) params.set('skillLevels', skillLevels.join(','));
    if (city) params.set('city', city);
    if (q) params.set('q', q);
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  }

  useEffect(() => {
    setLoading(true);
    api<{ listings: ListingResult[]; nextCursor: string | null; categoryCounts: Record<string, number> }>(`/api/v1/public/listings?${buildQuery()}`)
      .then((r) => {
        setListings(r.listings);
        setNextCursor(r.nextCursor);
        setCategoryCounts(r.categoryCounts);
      })
      .catch(() => {
        setListings([]);
        setNextCursor(null);
        setCategoryCounts({});
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, subcategoryIds.join(','), ageGroups.join(','), skillLevels.join(','), city, q]);

  function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    api<{ listings: ListingResult[]; nextCursor: string | null }>(`/api/v1/public/listings?${buildQuery(nextCursor)}`)
      .then((r) => {
        setListings((prev) => [...prev, ...r.listings]);
        setNextCursor(r.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  }

  const activeCategory = categories.find((c) => c.id === categoryId) ?? null;
  const activeFilterCount =
    (categoryId ? 1 : 0) + subcategoryIds.length + ageGroups.length + skillLevels.length + (city ? 1 : 0);

  function clearAll() {
    router.push('/explore/academies');
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Same two-column widths (w-56 sidebar / flex-1 results) as the row
          below, so "Back to Discovery" sits above the filter rail and the
          city+search bar's left edge lines up with the results column
          instead of sitting flush next to the back link. */}
      <div className="mb-6 flex items-center gap-6">
        <Link href="/explore" className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200 lg:w-56">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Discovery
        </Link>

        {/* Same city+search field composition as /explore/search — see that
            page's header for why, just shorter. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl glass-panel p-1.5 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 px-2.5 py-0.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
            <input
              key={city}
              ref={cityInputRef}
              list="academy-search-city-options"
              defaultValue={cities.find((c) => c.key === city)?.label ?? ''}
              onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
              placeholder="City or Area (e.g. Hyderabad)"
              className="w-full min-w-0 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
            />
            <datalist id="academy-search-city-options">
              {cities.map((c) => (
                <option key={c.key} value={c.label} />
              ))}
            </datalist>
          </div>
          <div className="hidden w-px self-stretch bg-white/10 sm:block" />
          <div className="flex flex-1 items-center gap-2 px-2.5 py-0.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <input
              ref={qInputRef}
              defaultValue={q}
              onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
              placeholder="Search academies…"
              className="w-full min-w-0 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
            />
          </div>
          <button
            onClick={submitSearch}
            className="btn-premium flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold"
          >
            <Search className="h-3.5 w-3.5" /> Search
          </button>
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-400 transition-colors hover:text-slate-200 lg:hidden"
            aria-label="Toggle filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> {activeFilterCount > 0 && <span className="text-xs">{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <FilterRail
            categories={categories}
            categoryCounts={categoryCounts}
            activeCategory={activeCategory}
            categoryId={categoryId}
            subcategoryIds={subcategoryIds}
            ageGroups={ageGroups}
            skillLevels={skillLevels}
            setParams={setParams}
            clearAll={clearAll}
          />
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <p className="text-sm text-slate-400">
              {loading ? 'Searching…' : `${listings.length}${nextCursor ? '+' : ''} academ${listings.length === 1 ? 'y' : 'ies'} found`}
            </p>
            {activeFilterCount > 0 && (
              <>
                <span className="text-xs text-slate-600">·</span>
                <div className="flex flex-wrap gap-1.5">
                  {activeCategory && (
                    <FilterChip label={activeCategory.name} onRemove={() => setParams({ categoryId: null, subcategoryIds: null })} />
                  )}
                  {subcategoryIds.map((id) => {
                    const label = activeCategory?.subcategories.find((s) => s.id === id)?.name ?? id;
                    return (
                      <FilterChip
                        key={id}
                        label={label}
                        onRemove={() => setParams({ subcategoryIds: subcategoryIds.filter((x) => x !== id).join(',') || null })}
                      />
                    );
                  })}
                  {ageGroups.map((a) => (
                    <FilterChip key={a} label={a} onRemove={() => setParams({ ageGroups: toggle(ageGroups, a).join(',') || null })} />
                  ))}
                  {skillLevels.map((s) => (
                    <FilterChip key={s} label={s} onRemove={() => setParams({ skillLevels: toggle(skillLevels, s).join(',') || null })} />
                  ))}
                  {city && (
                    <FilterChip label={cities.find((c) => c.key === city)?.label ?? city} onRemove={() => setParams({ city: null })} />
                  )}
                </div>
              </>
            )}
          </div>

          {!loading && listings.length === 0 ? (
            <div className="py-24 text-center">
              <p className="mb-3 text-4xl">🏫</p>
              <p className="text-sm text-slate-400">No academies found for your search.</p>
              <p className="mt-1 text-xs text-slate-600">Try different keywords, category or location.</p>
              {activeFilterCount > 0 && (
                <button onClick={clearAll} className="mt-4 text-xs text-indigo-400 transition-colors hover:text-indigo-300">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing) => (
                  <ListingCard key={listing.slug} listing={listing} />
                ))}
              </div>
              {nextCursor && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-6 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 lg:hidden" onClick={() => setMobileFiltersOpen(false)}>
          <div className="glass-panel max-h-[80vh] w-full overflow-y-auto rounded-t-3xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Filters</span>
              <button onClick={() => setMobileFiltersOpen(false)} className="text-slate-500 hover:text-slate-200"><X className="h-4 w-4" /></button>
            </div>
            <FilterRail
              categories={categories}
              categoryCounts={categoryCounts}
              activeCategory={activeCategory}
              categoryId={categoryId}
              subcategoryIds={subcategoryIds}
              ageGroups={ageGroups}
              skillLevels={skillLevels}
              setParams={setParams}
              clearAll={clearAll}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      onClick={onRemove}
      className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/[0.1]"
    >
      {label} <X className="h-2.5 w-2.5" />
    </button>
  );
}

// Identical to /explore/search's FilterRail (same sections, same sizes) —
// the two filter rails are meant to feel like one shared component, just
// wired to listings instead of coach_profiles. Shows academyCount (live
// listings per category, migration 0024) instead of Coaches' coachCount —
// same shared /api/v1/public/categories tree, different count column.
function FilterRail({
  categories,
  categoryCounts,
  activeCategory,
  categoryId,
  subcategoryIds,
  ageGroups,
  skillLevels,
  setParams,
  clearAll,
}: {
  categories: Category[];
  categoryCounts: Record<string, number>;
  activeCategory: Category | null;
  categoryId: string;
  subcategoryIds: string[];
  ageGroups: string[];
  skillLevels: string[];
  setParams: (patch: Record<string, string | null>) => void;
  clearAll: () => void;
}) {
  const anyFilterActive = categoryId || subcategoryIds.length > 0 || ageGroups.length > 0 || skillLevels.length > 0;

  return (
    <div className="glass-panel sticky top-24 space-y-6 rounded-2xl p-4">
      <div>
        <h3 className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Category</h3>
        <div className="no-scrollbar max-h-64 space-y-0.5 overflow-y-auto">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setParams({ categoryId: categoryId === c.id ? null : c.id, subcategoryIds: null })}
              className={`w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-all ${
                categoryId === c.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
              }`}
            >
              {c.icon ? `${c.icon} ` : ''}{c.name} ({categoryCounts[c.id] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {activeCategory && activeCategory.subcategories.length > 0 && (
        <div>
          <h3 className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Speciality</h3>
          <div className="flex flex-wrap gap-1.5">
            {activeCategory.subcategories.map((s) => {
              const selected = subcategoryIds.includes(s.id);
              return (
                <Chip key={s.id} theme="dark" clickable selected={selected} onClick={() => setParams({ subcategoryIds: toggle(subcategoryIds, s.id).join(',') || null })}>
                  {s.name}
                </Chip>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Age Group</h3>
        <div className="flex flex-wrap gap-1.5">
          {AGE_GROUPS.map((a) => (
            <Chip key={a} theme="dark" clickable selected={ageGroups.includes(a)} onClick={() => setParams({ ageGroups: toggle(ageGroups, a).join(',') || null })}>
              {a}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Skill Level</h3>
        <div className="flex flex-wrap gap-1.5">
          {SKILL_LEVELS.map((s) => (
            <Chip key={s} theme="dark" clickable selected={skillLevels.includes(s)} onClick={() => setParams({ skillLevels: toggle(skillLevels, s).join(',') || null })}>
              {s}
            </Chip>
          ))}
        </div>
      </div>

      {anyFilterActive && (
        <button onClick={clearAll} className="w-full py-1 text-center text-xs text-red-400 transition-colors hover:text-red-300">
          Clear All Filters
        </button>
      )}
    </div>
  );
}

function ListingCard({ listing }: { listing: ListingResult }) {
  const name = listing.headline || 'Academy';
  const price = priceLabel(listing.priceDisplay);
  const cover = listing.mediaPaths?.[0] ?? null;

  return (
    <Link href={`/explore/${listing.slug}`} className="glass-panel glass-panel-hover group overflow-hidden rounded-2xl transition-all duration-200">
      <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-900/40 to-slate-900/60">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-4xl">🏫</span>
        )}
        {listing.featured && (
          <div className="absolute right-2 top-2 rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 backdrop-blur-sm">
            ★ Featured
          </div>
        )}
        <div className="absolute bottom-2 left-2 rounded-full bg-indigo-600/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          {listing.primarySubcategoryName ?? listing.category?.name ?? 'Academy'}
        </div>
      </div>
      <div className="p-4">
        <h3 className="truncate text-sm font-bold text-slate-100 transition-colors group-hover:text-indigo-300">{name}</h3>
        <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="h-3 w-3" /> {listing.cityKey}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-slate-500">
            {listing.avgRating !== null && (
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {listing.avgRating.toFixed(1)}
              </span>
            )}
            {price}
          </span>
          <span className="flex items-center gap-0.5 text-xs text-indigo-400">
            View <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
