import React from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  Award,
  Calendar,
  Globe,
  Lock,
  MapPin,
  MessageSquare,
  Star,
  Users,
  Wifi,
  Mail,
  Phone,
  Bookmark,
  CheckCircle2,
  Clock
} from 'lucide-react';
import Link from 'next/link';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { adminDb } from '@/lib/api';
import ExploreHeader from '@/components/ExploreHeader';

// ─── Auth helper (does not throw) ─────────────────────────────────────────────
async function getIsLoggedIn(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) return false;
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ─── SEO Metadata Generator ──────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const db = adminDb();

  const { data: coach } = await db
    .from('coaches')
    .select(`
      primary_skill,
      experience_years,
      city,
      area,
      users (first_name, last_name, bio)
    `)
    .eq('public_profile_slug', slug)
    .single();

  if (!coach) {
    return {
      title: 'Coach Not Found | Abhyas',
    };
  }

  const u = coach.users as any;
  const name = `${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim();
  const skill = coach.primary_skill;
  const location = [coach.area, coach.city].filter(Boolean).join(', ') || 'India';

  return {
    title: `Best ${skill} in ${location} - Coach ${name} | Abhyas`,
    description: `Book a trial session with Coach ${name}. ${coach.experience_years}+ years experience teaching ${skill} physically in ${location} and online. View slot times and student feedback.`,
    openGraph: {
      title: `Coach ${name} - Professional ${skill} Instructor`,
      description: `Expert ${skill} classes, batches, and personal training by Coach ${name}.`,
    }
  };
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default async function PublicCoachProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const db = adminDb();
  const isLoggedIn = await getIsLoggedIn();

  // 1. Fetch coach data from public schema
  const { data: coachData, error } = await db
    .from('coaches')
    .select(`
      id, primary_skill, experience_years, service_types, class_types, languages_known,
      qualification, certifications_summary, bio, country, state, city, area,
      avg_rating, satisfaction_score, achievements, gallery_urls,
      user:users(first_name, last_name, email, phone, avatar_url)
    `)
    .eq('public_profile_slug', slug)
    .single();

  if (error || !coachData) {
    notFound();
  }

  const coach = coachData as any;
  const u = coach.user;

  // 2. Fetch approved batch assignments mapped to this coach
  const { data: assignments } = await db
    .from('coach_batch_assignments')
    .select(`
      status,
      batch:batches(id, name, start_time, end_time, days_of_week, max_capacity,
        class:classes(name)
      )
    `)
    .eq('coach_id', coach.id)
    .eq('status', 'approved');

  // 3. Fetch recent performance reviews (student feedback rating subset)
  const { data: reviews } = await db
    .from('coach_reviews')
    .select(`
      id, overall_rating, review_period, comments,
      rated_by_user:users(first_name, last_name, avatar_url)
    `)
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: false })
    .limit(3);

  const activeBatches = assignments?.map((a: any) => a.batch).filter(Boolean) ?? [];

  const DAY_LABELS: Record<number, string> = {
    1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
  };

  function formatTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
  }

  return (
    <div className="min-h-screen bg-[#060814] text-slate-100 font-sans">
      {/* Public nav header */}
      <ExploreHeader />

      {/* Dynamic Ambient Background Glow */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 py-10 lg:py-16 relative z-10 space-y-10">
        
        {/* ── HERO BANNER CARD ────────────────────────────────────────────────── */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/5 flex flex-col md:flex-row gap-6 items-center md:items-start text-center md:text-left bg-slate-950/30">
          {/* Portrait Photo */}
          {u?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={u.avatar_url}
              alt={`${u.first_name} ${u.last_name}`}
              className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl object-cover border-2 border-indigo-500/20 shadow-2xl"
            />
          ) : (
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-indigo-500/10 border-2 border-dashed border-indigo-500/25 flex items-center justify-center text-indigo-300 font-bold text-3xl">
              {u?.first_name?.[0]}{u?.last_name?.[0]}
            </div>
          )}

          {/* Core Info */}
          <div className="flex-1 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-center md:justify-start gap-2.5">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 self-center sm:self-auto">
                {coach.primary_skill}
              </span>
              <div className="flex items-center justify-center gap-1 text-xs text-amber-400">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="font-bold text-sm">{Number(coach.avg_rating || 4.8).toFixed(1)}</span>
                <span className="text-slate-500">(15+ ratings)</span>
              </div>
            </div>

            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
                Coach {u?.first_name} {u?.last_name}
              </h1>
              <p className="text-slate-400 text-sm sm:text-base mt-1.5 flex items-center justify-center md:justify-start gap-1.5 font-medium">
                <MapPin className="w-4 h-4 text-indigo-400" />
                {[coach.area, coach.city, coach.state].filter(Boolean).join(', ')}
              </p>
            </div>

            {/* Quick Badges Row */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs bg-slate-900 border border-white/5 text-slate-300">
                <Bookmark className="w-3.5 h-3.5 text-indigo-400" /> {coach.experience_years}+ Years Exp
              </span>
              {coach.service_types.map((type: string) => (
                <span key={type} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs bg-slate-900 border border-white/5 text-slate-300">
                  {type === 'Online' ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <Globe className="w-3.5 h-3.5 text-indigo-400" />} {type}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── TWO COLUMN DETAILS ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* COLUMN 1: Profile & Batches */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* About Section */}
            <div className="glass-panel p-6 sm:p-7 rounded-2xl space-y-4">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" /> Professional Bio
              </h2>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                {coach.bio ?? `Coach ${u?.first_name} is a highly dedicated professional specializing in ${coach.primary_skill}. With a solid commitment to sports discipline, physical growth, and tailored instructional methodologies, students achieve outstanding growth trajectories.`}
              </p>
            </div>

            {/* Achievements Panel */}
            {coach.achievements?.length > 0 && (
              <div className="glass-panel p-6 sm:p-7 rounded-2xl space-y-4">
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-400" /> Notable Achievements
                </h2>
                <ul className="space-y-2.5">
                  {coach.achievements.map((ach: string, i: number) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span>{ach}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Active Schedules & Batches — auth-gated for guests */}
            <div className="glass-panel p-6 sm:p-7 rounded-2xl space-y-4">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-400" /> Active Schedules &amp; Batches
              </h2>

              {isLoggedIn ? (
                // ── Logged-in: show full batch details ──────────────────────
                activeBatches.length === 0 ? (
                  <p className="text-slate-500 text-xs py-4 text-center">
                    No open public schedules currently available.
                  </p>
                ) : (
                  <div className="space-y-3.5">
                    {activeBatches.map((b: any) => (
                      <div
                        key={b.id}
                        className="p-4 rounded-xl bg-slate-950/20 border border-white/5 hover:border-indigo-500/20 transition-all flex flex-col sm:flex-row justify-between sm:items-center gap-3"
                      >
                        <div>
                          <p className="text-slate-200 text-sm font-bold">{b.name}</p>
                          <p className="text-slate-400 text-xs mt-0.5">{b.class?.name || 'Class slot'}</p>
                          <div className="flex gap-1.5 mt-2">
                            {b.days_of_week.map((d: number) => (
                              <span
                                key={d}
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
                              >
                                {DAY_LABELS[d]}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div className="text-left sm:text-right">
                            <p className="text-slate-400 text-[10px] uppercase font-bold flex items-center sm:justify-end gap-1">
                              <Clock className="w-3 h-3" /> Timings
                            </p>
                            <p className="text-slate-200 text-xs mt-0.5 font-medium">
                              {formatTime(b.start_time)} &ndash; {formatTime(b.end_time)}
                            </p>
                          </div>
                          <button className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all">
                            Quick Enroll
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                // ── Guest: blurred preview + lock overlay ───────────────────
                <div className="relative rounded-2xl overflow-hidden">
                  {/* Blurred dummy preview rows */}
                  <div className="blur-sm pointer-events-none space-y-3 select-none" aria-hidden="true">
                    {[1, 2].map(i => (
                      <div
                        key={i}
                        className="p-4 rounded-xl bg-slate-950/20 border border-white/5 flex justify-between items-center"
                      >
                        <div className="space-y-2">
                          <div className="h-3 w-32 bg-slate-700/60 rounded" />
                          <div className="h-2 w-20 bg-slate-800/60 rounded" />
                          <div className="flex gap-1.5">
                            {['Mon', 'Wed', 'Fri'].map(d => (
                              <span
                                key={d}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="h-3 w-24 bg-slate-700/60 rounded" />
                      </div>
                    ))}
                  </div>

                  {/* Lock overlay */}
                  <div className="absolute inset-0 backdrop-blur-[2px] bg-slate-950/70 flex flex-col items-center justify-center gap-4 rounded-2xl z-10 px-6 py-8">
                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-white font-bold text-sm">
                        Active Schedules &amp; Batches
                      </p>
                      <p className="text-slate-400 text-xs mt-1.5 max-w-xs">
                        Login or register an account to view active schedules,
                        batch timings, fees, and slot availabilities.
                      </p>
                    </div>
                    <Link
                      href={`/auth/login?redirect=/coaches/${slug}`}
                      className="btn-premium px-6 py-2.5 rounded-xl text-sm font-semibold"
                    >
                      Login / Register
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Student Reviews & Ratings */}
            <div className="glass-panel p-6 sm:p-7 rounded-2xl space-y-4">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-400" /> Student Feedback Reviews
              </h2>
              {!reviews || reviews.length === 0 ? (
                <p className="text-slate-500 text-xs py-4 text-center">No reviews logged yet. Be the first to share your experience!</p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((rev: any) => (
                    <div key={rev.id} className="p-4 rounded-xl bg-slate-950/20 border border-white/5 space-y-2.5">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold text-xs">
                            {rev.rated_by_user?.first_name?.[0]}{rev.rated_by_user?.last_name?.[0]}
                          </div>
                          <div>
                            <p className="text-slate-200 text-xs font-bold">{rev.rated_by_user?.first_name} {rev.rated_by_user?.last_name?.slice(0, 1)}.</p>
                            <p className="text-slate-500 text-[9px]">{rev.review_period}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 text-xs text-amber-400 font-bold bg-amber-500/5 px-2 py-0.5 rounded-md border border-amber-500/10">
                          <Star className="w-3 h-3 fill-amber-400" /> {Number(rev.overall_rating).toFixed(1)}
                        </div>
                      </div>
                      <p className="text-slate-300 text-xs leading-relaxed italic">"{rev.comments}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* COLUMN 2: Checkout Action Cards */}
          <div className="space-y-6">
            
            {/* Book Trial Card */}
            <div className="glass-panel p-6 rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.02] space-y-4 sticky top-6">
              <div>
                <p className="text-[10px] text-indigo-400 uppercase tracking-widest font-extrabold">Introductory Session</p>
                <h3 className="text-xl font-bold text-slate-100 mt-1">Book a Free Trial Class</h3>
                <p className="text-slate-400 text-xs mt-1.5">Experience Coach {u?.first_name}'s training session first-hand before subscribing.</p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between p-2 rounded-lg bg-slate-900 border border-white/5">
                  <span className="text-slate-500">Duration</span>
                  <span className="text-slate-200 font-medium">60 Mins</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-slate-900 border border-white/5">
                  <span className="text-slate-500">Service Mode</span>
                  <span className="text-indigo-400 font-medium">{coach.service_types.join(' & ')}</span>
                </div>
              </div>

              <button className="btn-premium w-full rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5">
                Book Trial Slot Now
              </button>

              <button className="w-full rounded-xl py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/10 text-xs font-semibold transition-all">
                Contact Coach
              </button>

              {/* Direct Info */}
              <div className="pt-2 border-t border-white/5 space-y-2 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-600" />
                  <span>{u?.email}</span>
                </div>
                {u?.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-600" />
                    <span>{u.phone}</span>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
