'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  MapPin,
  Star,
  ChevronRight,
  SlidersHorizontal,
  Loader2,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { useCategoryTaxonomy, Tag } from '@/lib/useCategoryTaxonomy';
import { Chip } from '@/components/Chip';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Coach {
  id: string;
  public_profile_slug: string;
  primarySubcategoryName: string | null;
  bio: string | null;
  city: string | null;
  area: string | null;
  state: string | null;
  avg_rating: number | null;
  experience_years: number | null;
  service_types: string[];
  class_types: string[];
  age_groups: string[];
  skill_levels: string[];
  user_data: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  } | null;
}

// ─── Filter options ───────────────────────────────────────────────────────────

const RATING_OPTIONS = [
  { label: 'Any Rating',  value: 0   },
  { label: '4.0 & above', value: 4.0 },
  { label: '4.5 & above', value: 4.5 },
  { label: '4.8 & above', value: 4.8 },
];

const AGE_GROUPS = ['Kids', 'Teens', 'Adults'];
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const TAG_TYPE_LABELS: Record<Tag['tag_type'], string> = {
  board: 'Board',
  subject: 'Subjects',
  stream: 'Stream',
  exam: 'Exams',
};

const LIMIT = 12;

// ─── Main content (needs Suspense boundary for useSearchParams) ───────────────

function CoachSearchContent() {
  const searchParams = useSearchParams();
  const { categories } = useCategoryTaxonomy();

  const [coaches,     setCoaches]     = useState<Coach[]>([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [page,        setPage]        = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  // Initialise filters from URL query params
  const [search,        setSearch]        = useState(searchParams.get('search')        ?? '');
  const [city,          setCity]          = useState(searchParams.get('city')          ?? '');
  const [categoryId,    setCategoryId]    = useState(searchParams.get('categoryId')    ?? '');
  const [subcategoryId, setSubcategoryId] = useState(searchParams.get('subcategoryId') ?? '');
  const [tagIds,        setTagIds]        = useState<string[]>([]);
  const [ageGroup,      setAgeGroup]      = useState('');
  const [skillLevel,    setSkillLevel]    = useState('');
  const [minRating,     setMinRating]     = useState(
    parseFloat(searchParams.get('minRating') ?? '0')
  );

  const activeCategory = categories.find(c => c.id === categoryId) ?? null;
  const activeSubcategory = activeCategory?.subcategories.find(s => s.id === subcategoryId) ?? null;

  const fetchCoaches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)        params.set('search',        search);
      if (city)          params.set('city',          city);
      if (subcategoryId) params.set('subcategoryId', subcategoryId);
      else if (categoryId) params.set('categoryId',  categoryId);
      if (tagIds.length > 0) params.set('tagIds',     tagIds.join(','));
      if (ageGroup)       params.set('ageGroup',      ageGroup);
      if (skillLevel)     params.set('skillLevel',    skillLevel);
      if (minRating > 0)  params.set('minRating',     String(minRating));
      params.set('page',  String(page));
      params.set('limit', String(LIMIT));

      const res  = await fetch(`/api/v1/public/coaches?${params}`);
      const json = await res.json();
      if (json.success) {
        setCoaches(json.data.coaches);
        setTotal(json.data.total);
      }
    } catch (e) {
      console.error('Failed to fetch coaches:', e);
    } finally {
      setLoading(false);
    }
  }, [search, city, categoryId, subcategoryId, tagIds, ageGroup, skillLevel, minRating, page]);

  useEffect(() => { fetchCoaches(); }, [fetchCoaches]);

  const applySearch  = () => { setPage(1); fetchCoaches(); };
  const clearFilters = () => {
    setSearch('');
    setCity('');
    setCategoryId('');
    setSubcategoryId('');
    setTagIds([]);
    setAgeGroup('');
    setSkillLevel('');
    setMinRating(0);
    setPage(1);
  };

  const selectCategory = (id: string) => {
    setCategoryId(id === categoryId ? '' : id);
    setSubcategoryId('');
    setTagIds([]);
    setPage(1);
  };

  const selectSubcategory = (id: string) => {
    setSubcategoryId(id === subcategoryId ? '' : id);
    setTagIds([]);
    setPage(1);
  };

  const toggleTag = (id: string) => {
    setTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
    setPage(1);
  };

  const tagsByType = new Map<Tag['tag_type'], Tag[]>();
  for (const tag of activeSubcategory?.tags ?? []) {
    if (!tagsByType.has(tag.tag_type)) tagsByType.set(tag.tag_type, []);
    tagsByType.get(tag.tag_type)!.push(tag);
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Discovery
        </Link>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-6 flex-wrap sm:flex-nowrap">
        <div className="flex-1 glass-panel rounded-xl flex items-center gap-2 px-3 py-2.5 border border-white/10 min-w-[130px]">
          <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
          <input
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="City or area..."
            className="bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none flex-1"
            onKeyDown={e => e.key === 'Enter' && applySearch()}
          />
        </div>
        <div className="flex-[2] glass-panel rounded-xl flex items-center gap-2 px-3 py-2.5 border border-white/10 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sports, coaching, music..."
            className="bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none flex-1"
            onKeyDown={e => e.key === 'Enter' && applySearch()}
          />
        </div>
        <button
          onClick={applySearch}
          className="btn-premium px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0"
        >
          <Search className="w-4 h-4" /> Search
        </button>
        {/* Mobile filter toggle */}
        <button
          onClick={() => setShowFilters(f => !f)}
          className="md:hidden px-4 py-2.5 rounded-xl border border-white/10 glass-panel text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Toggle filters"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-6">

        {/* ── Sidebar Filters ── */}
        <aside className={`${showFilters ? 'block' : 'hidden'} md:block w-full md:w-56 shrink-0`}>
          <div className="glass-panel rounded-2xl p-4 space-y-6 sticky top-24">

            {/* Category */}
            <div>
              <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">
                Category
              </h3>
              <div className="space-y-0.5 max-h-64 overflow-y-auto no-scrollbar">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => selectCategory(cat.id)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      categoryId === cat.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                    }`}
                  >
                    {cat.icon ? `${cat.icon} ` : ''}{cat.name} ({cat.coachCount})
                  </button>
                ))}
              </div>
            </div>

            {/* Subcategory (only once a category is picked) */}
            {activeCategory && (
              <div>
                <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">
                  Specialty
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {activeCategory.subcategories.map(sub => {
                    const isSelected = subcategoryId === sub.id;
                    return (
                      <Chip
                        key={sub.id}
                        theme="dark"
                        clickable
                        selected={isSelected}
                        onClick={() => selectSubcategory(sub.id)}
                        icon={isSelected ? <Check className="stroke-[3]" /> : undefined}
                      >
                        {sub.name}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tags (Board / Subject / Stream / Exam) — Academic subcategories only */}
            {activeSubcategory && ['board', 'subject', 'stream', 'exam'].map(type => {
              const typeTags = tagsByType.get(type as Tag['tag_type']);
              if (!typeTags || typeTags.length === 0) return null;
              return (
                <div key={type}>
                  <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">
                    {TAG_TYPE_LABELS[type as Tag['tag_type']]}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {typeTags.map(tag => {
                      const isSelected = tagIds.includes(tag.id);
                      return (
                        <Chip
                          key={tag.id}
                          theme="dark"
                          clickable
                          selected={isSelected}
                          onClick={() => toggleTag(tag.id)}
                          icon={isSelected ? <Check className="stroke-[3]" /> : undefined}
                        >
                          {tag.name}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Age Group */}
            <div>
              <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">
                Age Group
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {AGE_GROUPS.map(ag => (
                  <Chip
                    key={ag}
                    theme="dark"
                    clickable
                    selected={ageGroup === ag}
                    onClick={() => { setAgeGroup(ageGroup === ag ? '' : ag); setPage(1); }}
                  >
                    {ag}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Skill Level */}
            <div>
              <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">
                Skill Level
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {SKILL_LEVELS.map(sl => (
                  <Chip
                    key={sl}
                    theme="dark"
                    clickable
                    selected={skillLevel === sl}
                    onClick={() => { setSkillLevel(skillLevel === sl ? '' : sl); setPage(1); }}
                  >
                    {sl}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Rating */}
            <div>
              <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">
                Rating
              </h3>
              <div className="space-y-0.5">
                {RATING_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setMinRating(opt.value); setPage(1); }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      minRating === opt.value
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                    }`}
                  >
                    {opt.value > 0 && (
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear filters */}
            {(categoryId || subcategoryId || tagIds.length > 0 || ageGroup || skillLevel || minRating > 0 || city || search) && (
              <button
                onClick={clearFilters}
                className="w-full text-center text-xs text-red-400 hover:text-red-300 py-1 transition-colors"
              >
                Clear All Filters
              </button>
            )}
          </div>
        </aside>

        {/* ── Results panel ── */}
        <div className="flex-1 min-w-0">

          {/* Count row */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-400">
              {loading
                ? 'Loading...'
                : `${total.toLocaleString()} result${total !== 1 ? 's' : ''} found`}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : coaches.length === 0 ? (
            <div className="text-center py-24">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-slate-400 text-sm">
                No coaches found for your search.
              </p>
              <p className="text-slate-600 text-xs mt-1">
                Try different keywords, category or location.
              </p>
              <button
                onClick={clearFilters}
                className="mt-4 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* Cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {coaches.map(coach => {
                  const u = coach.user_data;
                  const name =
                    `${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim();
                  const location = [coach.area, coach.city]
                    .filter(Boolean)
                    .join(', ');
                  const rating = Number(coach.avg_rating || 4.8).toFixed(1);

                  return (
                    <Link
                      key={coach.id}
                      href={`/coaches/${coach.public_profile_slug}`}
                      className="glass-panel glass-panel-hover rounded-2xl overflow-hidden group transition-all duration-200"
                    >
                      {/* Avatar */}
                      <div className="relative h-40 bg-gradient-to-br from-indigo-900/40 to-slate-900/60 flex items-center justify-center overflow-hidden">
                        {u?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={u.avatar_url}
                            alt={name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-200 font-black text-2xl">
                            {u?.first_name?.[0]}
                            {u?.last_name?.[0]}
                          </div>
                        )}
                        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span className="text-amber-300 text-xs font-bold">
                            {rating}
                          </span>
                        </div>
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-indigo-600/80 backdrop-blur-sm text-[10px] font-semibold text-white">
                          {coach.primarySubcategoryName ?? 'Coach'}
                        </div>
                      </div>

                      {/* Body */}
                      <div className="p-4">
                        <h3 className="text-sm font-bold text-slate-100 truncate group-hover:text-indigo-300 transition-colors">
                          {name}
                        </h3>
                        <div className="flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="text-xs text-slate-500 truncate">
                            {location || 'India'}
                          </span>
                        </div>
                        {coach.bio && (
                          <p className="text-xs text-slate-600 mt-2 line-clamp-2">
                            {coach.bio}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex gap-1">
                            {(coach.service_types ?? [])
                              .slice(0, 2)
                              .map(t => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.05] border border-white/10 text-slate-400"
                                >
                                  {t}
                                </span>
                              ))}
                          </div>
                          <span className="text-xs text-indigo-400 flex items-center gap-0.5">
                            View <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg glass-panel text-xs text-slate-400 disabled:opacity-30 hover:text-white transition-all"
                  >
                    ←
                  </button>
                  {Array.from(
                    { length: Math.min(5, totalPages) },
                    (_, i) => {
                      const p = page <= 3 ? i + 1 : page - 2 + i;
                      if (p < 1 || p > totalPages) return null;
                      return (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                            p === page
                              ? 'bg-indigo-600 text-white'
                              : 'glass-panel text-slate-400 hover:text-white'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    }
                  )}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg glass-panel text-xs text-slate-400 disabled:opacity-30 hover:text-white transition-all"
                  >
                    →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page export (wrapped in Suspense for useSearchParams) ────────────────────

export default function CoachSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      }
    >
      <CoachSearchContent />
    </Suspense>
  );
}
