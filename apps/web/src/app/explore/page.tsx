import Link from 'next/link';
import { Search, MapPin, Star, ArrowRight, ChevronRight } from 'lucide-react';
import { adminDb } from '@/lib/api';

// ─── Category data ────────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    emoji: '🏃',
    label: 'Sports',
    key: 'sports',
    bg: 'from-indigo-500/15 to-indigo-600/5',
    border: 'border-indigo-500/20',
    text: 'text-indigo-300',
  },
  {
    emoji: '📚',
    label: 'Education',
    key: 'education',
    bg: 'from-purple-500/15 to-purple-600/5',
    border: 'border-purple-500/20',
    text: 'text-purple-300',
  },
  {
    emoji: '🎵',
    label: 'Music',
    key: 'music',
    bg: 'from-pink-500/15 to-pink-600/5',
    border: 'border-pink-500/20',
    text: 'text-pink-300',
  },
  {
    emoji: '💃',
    label: 'Dance',
    key: 'dance',
    bg: 'from-rose-500/15 to-rose-600/5',
    border: 'border-rose-500/20',
    text: 'text-rose-300',
  },
  {
    emoji: '🏋️',
    label: 'Fitness',
    key: 'fitness',
    bg: 'from-emerald-500/15 to-emerald-600/5',
    border: 'border-emerald-500/20',
    text: 'text-emerald-300',
  },
  {
    emoji: '🎨',
    label: 'Art',
    key: 'art',
    bg: 'from-amber-500/15 to-amber-600/5',
    border: 'border-amber-500/20',
    text: 'text-amber-300',
  },
  {
    emoji: '🌐',
    label: 'Language',
    key: 'language',
    bg: 'from-cyan-500/15 to-cyan-600/5',
    border: 'border-cyan-500/20',
    text: 'text-cyan-300',
  },
  {
    emoji: '⋯',
    label: 'More',
    key: 'all',
    bg: 'from-slate-500/15 to-slate-600/5',
    border: 'border-slate-500/20',
    text: 'text-slate-300',
  },
];

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getTopCoaches() {
  try {
    const db = adminDb();
    const { data } = await db
      .from('coaches')
      .select(
        `id, public_profile_slug, primary_skill, city, area, state,
         avg_rating, experience_years, service_types,
         user_data:users(first_name, last_name, avatar_url)`
      )
      .not('public_profile_slug', 'is', null)
      .order('avg_rating', { ascending: false, nullsFirst: false })
      .limit(8);
    return data ?? [];
  } catch {
    return [];
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ExploreLandingPage() {
  const topCoaches = await getTopCoaches();

  return (
    <div className="text-slate-100">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative py-20 lg:py-32 overflow-hidden">
        {/* Ambient glow blobs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-indigo-500/[0.08] rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-[400px] h-[300px] bg-purple-500/[0.06] rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center relative z-10">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-xs font-semibold tracking-wide mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Trusted by 500+ Academies Across India
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white mb-5 leading-tight">
            Find the{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Best Coaches
            </span>
            {' '}&amp;{' '}
            <br className="hidden sm:block" />
            Academies Near You
          </h1>
          <p className="text-slate-400 text-base sm:text-lg mb-10 max-w-2xl mx-auto">
            Search city/area-wise and discover top-rated professionals across
            sports, education, music, dance and more.
          </p>

          {/* Search bar */}
          <form action="/explore/coaches" method="GET">
            <div className="flex flex-col sm:flex-row gap-2 max-w-2xl mx-auto glass-panel rounded-2xl p-2 border border-indigo-500/15">
              <div className="flex items-center gap-2 flex-1 px-3 py-1">
                <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                <input
                  name="city"
                  placeholder="City or Area (e.g. Hyderabad)"
                  className="bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none w-full min-w-0"
                />
              </div>
              <div className="w-px bg-white/10 hidden sm:block self-stretch" />
              <div className="flex items-center gap-2 flex-1 px-3 py-1">
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  name="search"
                  placeholder="Sports, coaching, music..."
                  className="bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none w-full min-w-0"
                />
              </div>
              <button
                type="submit"
                className="btn-premium px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0"
              >
                <Search className="w-4 h-4" /> Search
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ── POPULAR CATEGORIES ────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-100">
            Popular Categories
          </h2>
          <Link
            href="/explore/coaches"
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {CATEGORIES.map(cat => (
            <Link
              key={cat.key}
              href={`/explore/coaches?category=${cat.key}`}
              className={`flex flex-col items-center gap-2 p-3 sm:p-4 rounded-2xl bg-gradient-to-b ${cat.bg} ${cat.border} border ${cat.text} hover:scale-105 transition-all duration-200 text-center`}
            >
              <span className="text-2xl">{cat.emoji}</span>
              <span className="text-xs font-semibold">{cat.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── TOP PICKS ─────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              Top Picks For You
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Highly rated coaches across all categories
            </p>
          </div>
          <Link
            href="/explore/coaches"
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
          >
            View all coaches <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {topCoaches.length === 0 ? (
          <div className="text-center py-16 text-slate-600">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-sm">No coaches found. Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {topCoaches.map((coach: any) => {
              const u = coach.user_data as any;
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
                  {/* Avatar area */}
                  <div className="relative h-36 bg-gradient-to-br from-indigo-900/40 to-slate-900/60 flex items-center justify-center overflow-hidden">
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
                    {/* Rating badge */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span className="text-amber-300 text-xs font-bold">
                        {rating}
                      </span>
                    </div>
                    {/* Skill badge */}
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-indigo-600/80 backdrop-blur-sm text-[10px] font-semibold text-white">
                      {coach.primary_skill}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-4">
                    <h3 className="text-sm font-bold text-slate-100 truncate group-hover:text-indigo-300 transition-colors">
                      Coach {name}
                    </h3>
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="text-xs text-slate-500 truncate">
                        {location || 'India'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-slate-500">
                        {coach.experience_years}+ yrs exp
                      </span>
                      <span className="text-xs font-medium text-indigo-400 flex items-center gap-0.5">
                        View Profile <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* CTA banner */}
        <div className="mt-12 glass-panel rounded-3xl p-8 sm:p-12 text-center border border-indigo-500/15 bg-indigo-500/[0.03] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 pointer-events-none" />
          <h3 className="text-2xl sm:text-3xl font-black text-white mb-3 relative">
            Are you a Coach or Academy?
          </h3>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto relative">
            List your profile on Abhyas and reach thousands of students looking
            for quality coaching in your city.
          </p>
          <Link
            href="/auth/login"
            className="btn-premium px-8 py-3 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
          >
            Get Listed Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

    </div>
  );
}
