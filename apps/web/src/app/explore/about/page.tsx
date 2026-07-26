// Standard "About Us" page for the public marketplace nav. Static content,
// styled to match /explore's hero + CTA sections (dark glass-panel theme,
// gradient headline, glass-panel cards) rather than a bespoke layout.

import Link from 'next/link';
import { ArrowRight, Award, Compass, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { TAGLINE } from '@/lib/brand';

const VALUES = [
  {
    icon: Compass,
    title: 'Discovery, done right',
    body: 'City and area-wise search across sports, education, music, dance and more — so students find the right coach or academy, not just any coach or academy.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified before visible',
    body: 'Coaches and academies go through verification before their profile goes live, and every review comes only from a real, enrolled student.',
  },
  {
    icon: Users,
    title: 'Built for both sides',
    body: 'A discovery experience for students and parents, and a lightweight operations toolkit — attendance, batches, payments — for coaches and academies.',
  },
  {
    icon: Award,
    title: 'Real attendance, real reviews',
    body: 'Ratings are tied to actual enrollment and attendance, not open reviews — so the reputation you see reflects real outcomes.',
  },
];

export default function AboutPage() {
  return (
    <div>
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 py-16 sm:px-6 lg:py-24">
        <div className="pointer-events-none absolute left-1/4 top-0 h-[350px] w-[500px] rounded-full bg-indigo-500/[0.08] blur-[120px]" />
        <div className="pointer-events-none absolute right-1/4 top-6 h-[260px] w-[350px] rounded-full bg-purple-500/[0.06] blur-[100px]" />

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" /> {TAGLINE}
          </span>
          <h1 className="mb-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Connecting learners with{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              great coaches
            </span>{' '}
            &amp; academies
          </h1>
          <p className="mx-auto max-w-xl text-sm text-slate-400 sm:text-base">
            Abhyas is a discovery and operations platform for coaching and skill-building — helping students find quality
            instruction nearby, and helping coaches and academies run their practice without the admin overhead.
          </p>
        </div>
      </section>

      {/* ── VALUES ───────────────────────────────────────────────────── */}
      <section className="mx-auto mb-16 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 text-center">
          <h2 className="text-lg font-bold text-slate-100">What we care about</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass-panel rounded-2xl p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1.5 text-sm font-bold text-slate-100">{title}</h3>
              <p className="text-xs leading-relaxed text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── STORY ────────────────────────────────────────────────────── */}
      <section className="mx-auto mb-16 max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="glass-panel rounded-3xl p-8 sm:p-10">
          <h2 className="mb-3 text-xl font-bold text-slate-100">Our story</h2>
          <p className="mb-3 text-sm leading-relaxed text-slate-400">
            Finding a good coach or academy usually comes down to word of mouth — and running one means juggling
            attendance registers, batch timings and payment follow-ups across a dozen apps that were never built for the job.
          </p>
          <p className="text-sm leading-relaxed text-slate-400">
            Abhyas brings both sides onto one platform: a clean discovery experience for students and parents, and a
            purpose-built operations toolkit for coaches and academies, so the reputation you see on a profile is
            backed by real enrollment, real attendance and real reviews.
          </p>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="glass-panel relative overflow-hidden rounded-3xl border border-indigo-500/15 bg-indigo-500/[0.03] p-8 text-center sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5" />
          <h3 className="relative mb-3 text-2xl font-black text-white sm:text-3xl">Ready to get started?</h3>
          <p className="relative mx-auto mb-6 max-w-md text-sm text-slate-400">
            Explore coaches and academies near you, or list your own profile and reach students looking for quality coaching.
          </p>
          <div className="relative flex flex-wrap items-center justify-center gap-3">
            <Link href="/explore/search" className="btn-premium inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold">
              Find a coach <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-8 py-3 text-sm font-semibold text-slate-300 transition-all hover:bg-white/[0.08] hover:text-white"
            >
              Get listed free
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
