'use client';

// Discovery search results (wireframe frame 5b, "full filter rail"). Reached
// by clicking a category tile or searching on /explore's hero, instead of
// scrolling to an in-page results section — a genuinely separate results
// page, matching the wireframe's "5a discovery landing -> 5b search results"
// two-step flow.
//
// Searches coach_profiles (GET /api/v1/public/coaches), not org `listings` —
// the wireframe's baseline facets beyond Category (Speciality, Age Group,
// Skill Level) only exist as coach_profiles columns; listings has no
// equivalent. The wireframe's "new" (blue, beyond-current-schema) facets —
// area+radius, mode, availability, fees, batch type, coach gender/languages
// slider, trust, rating — have no V2 data source (no coach rating/review
// table) and are left out rather than faked; see the API route's own header
// for the same note.
//
// Sizes mirror V1's /explore/coaches (main branch) throughout — filter rail
// section labels, category list max-height, chip sizing (via the shared
// Chip component V1 used here), and the results card layout — rather than
// ad hoc values.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { useCategoryTaxonomy, type Category } from '@/lib/useCategoryTaxonomy';
import { Chip } from '@/components/Chip';

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface CoachResult {
  id: string;
  bio: string | null;
  experienceYears: number | null;
  languagesKnown: string[];
  category: { id: string; name: string; slug: string; icon: string | null } | null;
  primarySubcategoryName: string | null;
  specialtyNames: string[];
  displayName: string | null;
  avatarPath: string | null;
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

function initials(name: string | null): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function SearchResultsPage() {
  return (
    <Suspense fallback={null}>
      <SearchResults />
    </Suspense>
  );
}

function SearchResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { categories } = useCategoryTaxonomy();
  const [cities, setCities] = useState<City[]>([]);
  const [coaches, setCoaches] = useState<CoachResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
      router.push(`/explore/search?${next.toString()}`);
    },
    [router, searchParams]
  );

  useEffect(() => {
    api<{ cities: City[] }>('/api/v1/public/taxonomy').then((t) => setCities(t.cities)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoryId) params.set('categoryId', categoryId);
    if (subcategoryIds.length) params.set('subcategoryIds', subcategoryIds.join(','));
    if (ageGroups.length) params.set('ageGroups', ageGroups.join(','));
    if (skillLevels.length) params.set('skillLevels', skillLevels.join(','));
    if (city) params.set('city', city);
    if (q) params.set('search', q);
    api<{ coaches: CoachResult[]; total: number }>(`/api/v1/public/coaches?${params.toString()}`)
      .then((r) => {
        setCoaches(r.coaches);
        setTotal(r.total);
      })
      .catch(() => {
        setCoaches([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [categoryId, subcategoryIds.join(','), ageGroups.join(','), skillLevels.join(','), city, q]);

  const activeCategory = categories.find((c) => c.id === categoryId) ?? null;
  const activeFilterCount =
    (categoryId ? 1 : 0) + subcategoryIds.length + ageGroups.length + skillLevels.length + (city ? 1 : 0);

  function clearAll() {
    router.push('/explore/search');
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/explore" className="flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Discovery
        </Link>
        <div className="flex-1" />
        <select
          value={city}
          onChange={(e) => setParams({ city: e.target.value || null })}
          className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none"
        >
          <option value="">📍 Any city</option>
          {cities.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setParams({ q: (e.target as HTMLInputElement).value || null });
            }}
            placeholder="Search bio, e.g. badminton coach…"
            className="glass-input w-full rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none"
          />
        </div>
        <button
          onClick={() => setMobileFiltersOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-slate-400 transition-colors hover:text-slate-200 lg:hidden"
          aria-label="Toggle filters"
        >
          <SlidersHorizontal className="h-4 w-4" /> {activeFilterCount > 0 && <span className="text-xs">{activeFilterCount}</span>}
        </button>
      </div>

      <div className="flex gap-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <FilterRail
            categories={categories}
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
              {loading ? 'Searching…' : `${total} coach${total === 1 ? '' : 'es'} found`}
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

          {!loading && coaches.length === 0 ? (
            <div className="py-24 text-center">
              <p className="mb-3 text-4xl">🔍</p>
              <p className="text-sm text-slate-400">No coaches found for your search.</p>
              <p className="mt-1 text-xs text-slate-600">Try different keywords, category or location.</p>
              {activeFilterCount > 0 && (
                <button onClick={clearAll} className="mt-4 text-xs text-indigo-400 transition-colors hover:text-indigo-300">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {coaches.map((coach) => (
                <CoachCard key={coach.id} coach={coach} />
              ))}
            </div>
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

function FilterRail({
  categories,
  activeCategory,
  categoryId,
  subcategoryIds,
  ageGroups,
  skillLevels,
  setParams,
  clearAll,
}: {
  categories: Category[];
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
        {/* Capped to V1's max-h-64 (7ish rows) — the rest scroll rather than
            pushing the other facets (Speciality/Age/Skill) below the fold. */}
        <div className="no-scrollbar max-h-64 space-y-0.5 overflow-y-auto">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setParams({ categoryId: categoryId === c.id ? null : c.id, subcategoryIds: null })}
              className={`w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-all ${
                categoryId === c.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
              }`}
            >
              {c.icon ? `${c.icon} ` : ''}{c.name} ({c.coachCount})
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

function CoachCard({ coach }: { coach: CoachResult }) {
  const name = coach.displayName || 'Coach';

  return (
    <Link href={`/coaches/${coach.id}`} className="glass-panel glass-panel-hover group overflow-hidden rounded-2xl transition-all duration-200">
      <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-900/40 to-slate-900/60">
        {coach.avatarPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coach.avatarPath} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-indigo-500/30 bg-indigo-500/20 text-2xl font-black text-indigo-200">
            {initials(name)}
          </div>
        )}
        <div className="absolute bottom-2 left-2 rounded-full bg-indigo-600/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          {coach.primarySubcategoryName ?? coach.category?.name ?? 'Coach'}
        </div>
      </div>
      <div className="p-4">
        <h3 className="truncate text-sm font-bold text-slate-100 transition-colors group-hover:text-indigo-300">{name}</h3>
        {coach.bio && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{coach.bio}</p>}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">{coach.experienceYears !== null ? `${coach.experienceYears}+ yrs exp` : ''}</span>
          <span className="flex items-center gap-0.5 text-xs text-indigo-400">
            View <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
