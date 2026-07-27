'use client';

// Public coach profile detail — linked from Discovery search results
// (/explore/search). Rewritten to query coach_profiles (migration 0016/0019)
// via the new GET /api/v1/public/coaches/:id route instead of V1's dead
// coaches/coach_categories/coach_batch_assignments/coach_reviews tables,
// none of which exist in V2's active schema (this page 404'd unconditionally
// before this change). Route param stays named `slug` (Next.js route dir is
// literally `[slug]`) but is treated as a coach_profiles.id — V2 has no
// public-slug column to generate one from.
//
// Trimmed vs the old V1-era version: no live batch/schedule list
// (coach_batch_assignments has no V2 equivalent) and no reviews (no
// coach_reviews table in V2) — both are real, documented gaps rather than
// faked data. "Contact" is login-gated the same way /explore's listing
// detail gates schedules, rather than inventing a new anonymous lead-capture
// path for coach profiles specifically.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Award, Globe, Languages, Lock, MapPin, UserRound, Wifi } from 'lucide-react';

interface ServiceArea {
  key: string;
  label: string;
  cityLabel: string | null;
}

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface CoachDetail {
  id: string;
  bio: string | null;
  experienceYears: number | null;
  qualification: string | null;
  languagesKnown: string[];
  ageGroups: string[];
  skillLevels: string[];
  serviceTypes: string[];
  classTypes: string[];
  category: { id: string; name: string; slug: string; icon: string | null } | null;
  primarySubcategoryName: string | null;
  specialtyNames: string[];
  tagNames: string[];
  displayName: string | null;
  avatarPath: string | null;
  serviceAreas: ServiceArea[];
  cityLabels: string[];
}

export default function PublicCoachProfilePage() {
  const params = useParams<{ slug: string }>();
  const [coach, setCoach] = useState<CoachDetail | null | undefined>(undefined);

  useEffect(() => {
    api<CoachDetail | null>(`/api/v1/public/coaches/${params.slug}`).then(setCoach).catch(() => setCoach(null));
  }, [params.slug]);

  if (coach === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (coach === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-medium text-slate-300">This coach profile isn&apos;t available.</p>
        <Link href="/explore/search" className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline">← Back to search</Link>
      </div>
    );
  }

  const name = coach.displayName || 'Coach';
  const otherSpecialties = coach.specialtyNames.filter((n) => n !== coach.primarySubcategoryName);

  return (
    <div className="pb-16">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 lg:py-14">
        <Link href="/explore/search" className="flex w-fit items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to search
        </Link>

        {/* ── HERO ─────────────────────────────────────────────────── */}
        <div className="glass-panel flex flex-col items-center gap-6 rounded-3xl border border-white/5 bg-slate-950/30 p-6 text-center sm:p-8 md:flex-row md:items-start md:text-left">
          {coach.avatarPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coach.avatarPath}
              alt={name}
              className="h-28 w-28 rounded-2xl border-2 border-indigo-500/20 object-cover shadow-2xl sm:h-36 sm:w-36"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl border-2 border-dashed border-indigo-500/25 bg-indigo-500/10 text-indigo-300 sm:h-36 sm:w-36">
              <UserRound className="h-10 w-10" />
            </div>
          )}

          <div className="flex-1 space-y-3.5">
            {coach.primarySubcategoryName && (
              <span className="self-center rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300 sm:self-auto">
                {coach.category?.icon ? `${coach.category.icon} ` : ''}{coach.primarySubcategoryName}
              </span>
            )}

            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-100 sm:text-4xl">Coach {name}</h1>
              {coach.category && (
                <p className="mt-1.5 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-400 md:justify-start">
                  <MapPin className="h-4 w-4 text-indigo-400" /> {coach.category.name}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1.5 md:justify-start">
              {coach.experienceYears !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/5 bg-slate-900 px-3 py-1 text-xs text-slate-300">
                  <Award className="h-3.5 w-3.5 text-indigo-400" /> {coach.experienceYears}+ Years Exp
                </span>
              )}
              {coach.serviceTypes.map((type) => (
                <span key={type} className="inline-flex items-center gap-1.5 rounded-xl border border-white/5 bg-slate-900 px-3 py-1 text-xs capitalize text-slate-300">
                  {type === 'online' ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <Globe className="h-3.5 w-3.5 text-indigo-400" />} {type}
                </span>
              ))}
              {otherSpecialties.map((n) => (
                <span key={n} className="inline-flex items-center gap-1.5 rounded-xl border border-white/5 bg-slate-900 px-3 py-1 text-xs text-slate-300">
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Arbitrary-value grid-template-columns (not `lg:grid-cols-3`) — globals.css force-collapses
            any class containing the substring "grid-cols-3" to 2 columns below 900px, which would
            otherwise turn this "1 column until desktop" layout into a squeezed 2-column mobile view. */}
        <div className="grid grid-cols-1 gap-8 lg:[grid-template-columns:repeat(3,minmax(0,1fr))]">
          {/* COLUMN 1 */}
          <div className="space-y-6 lg:col-span-2">
            <div className="glass-panel space-y-3 rounded-2xl p-6 sm:p-7">
              <h2 className="text-lg font-bold text-slate-100">About</h2>
              <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
                {coach.bio ?? `Coach ${name} teaches ${coach.primarySubcategoryName ?? coach.category?.name ?? 'a range of specialties'}.`}
              </p>
            </div>

            {coach.qualification && (
              <div className="glass-panel space-y-2 rounded-2xl p-6 sm:p-7">
                <h2 className="text-lg font-bold text-slate-100">Qualification</h2>
                <p className="text-sm text-slate-300">{coach.qualification}</p>
              </div>
            )}

            {coach.languagesKnown.length > 0 && (
              <div className="glass-panel space-y-3 rounded-2xl p-6 sm:p-7">
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
                  <Languages className="h-5 w-5 text-indigo-400" /> Languages
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {coach.languagesKnown.map((l) => (
                    <span key={l} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-slate-300">{l}</span>
                  ))}
                </div>
              </div>
            )}

            {(coach.ageGroups.length > 0 || coach.skillLevels.length > 0) && (
              <div className="glass-panel grid grid-cols-1 gap-4 rounded-2xl p-6 sm:grid-cols-2 sm:p-7">
                {coach.ageGroups.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Age groups taught</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {coach.ageGroups.map((a) => (
                        <span key={a} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-slate-300">{a}</span>
                      ))}
                    </div>
                  </div>
                )}
                {coach.skillLevels.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Skill levels coached</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {coach.skillLevels.map((s) => (
                        <span key={s} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-slate-300">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {coach.serviceAreas.length > 0 && (
              <div className="glass-panel space-y-3 rounded-2xl p-6 sm:p-7">
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
                  <MapPin className="h-5 w-5 text-indigo-400" /> Service city &amp; areas
                </h2>
                {coach.cityLabels.length > 0 && (
                  <p className="text-sm text-slate-300">{coach.cityLabels.join(', ')}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {coach.serviceAreas.map((a) => (
                    <span key={a.key} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-slate-300">{a.label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* COLUMN 2 — Contact */}
          <div className="space-y-6">
            <div className="glass-panel sticky top-6 space-y-4 rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.02] p-6">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400">Interested?</p>
                <h3 className="mt-1 text-xl font-bold text-slate-100">Get in touch with Coach {name}</h3>
              </div>

              <div className="relative isolate overflow-hidden rounded-2xl">
                {/* Blur is confined to this background-only layer so it can never bleed onto the CTA's own text (a real risk when backdrop-filter and its content share one clipped, rounded element). */}
                <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 space-y-3 select-none blur-sm">
                  <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/20 p-4">
                    <div className="space-y-2">
                      <div className="h-3 w-32 rounded bg-slate-700/60" />
                      <div className="h-2 w-20 rounded bg-slate-800/60" />
                    </div>
                  </div>
                </div>
                <div className="relative flex flex-col items-center gap-3 rounded-2xl bg-slate-950/85 px-6 py-8">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-500/20 bg-indigo-500/10">
                    <Lock className="h-4 w-4 text-indigo-400" />
                  </div>
                  <p className="text-center text-xs text-slate-400">
                    Login or register to view contact details and request a trial.
                  </p>
                  <Link
                    href={`/auth/login?redirect=/coaches/${coach.id}`}
                    className="btn-premium rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
                  >
                    Login / Register
                  </Link>
                </div>
              </div>

              {coach.classTypes.length > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-slate-900 p-2 text-xs">
                  <span className="text-slate-500">Class type</span>
                  <span className="font-medium capitalize text-slate-200">{coach.classTypes.join(' & ').replace(/_/g, ' ')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
