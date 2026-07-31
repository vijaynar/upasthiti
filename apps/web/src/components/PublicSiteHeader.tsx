// Shared top nav for public marketing/marketplace pages (/explore/*,
// /coaches/*) — extracted from explore/layout.tsx so /coaches/[slug] (linked
// from /explore and /explore/search result cards) gets the same app chrome
// instead of rendering as a disconnected, bespoke page.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { LayoutDashboard } from 'lucide-react';
import { jwt as platformJwt } from '@abhyas/platform';
import { TAGLINE } from '@/lib/brand';
import { isAcademyOperationEnabledServer } from '@/lib/featureFlags.server';

async function getOptionalUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('abhyas_access_token')?.value;
    if (!token) return null;
    return platformJwt.verifyAccessToken(token).sub;
  } catch {
    return null;
  }
}

const NAV_LINKS = [
  { label: 'Browse', href: '/explore' },
  { label: 'Coaches', href: '/explore/search' },
  { label: 'Academies', href: '/explore/academies' },
  { label: 'About Us', href: '/explore/about' },
];

export default async function PublicSiteHeader({ showAuthButtons = true }: { showAuthButtons?: boolean }) {
  const [userId, academyEnabled] = await Promise.all([getOptionalUserId(), isAcademyOperationEnabledServer()]);
  const navLinks = academyEnabled ? NAV_LINKS : NAV_LINKS.filter((item) => item.label !== 'Academies');

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-white/[0.08]">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center">
          <Link href="/explore" className="flex shrink-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Abhyas" className="h-8 w-auto object-contain" />
            <div className="leading-none">
              <div className="text-[13px] font-black tracking-tight text-white">ABHYAS</div>
              <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-widest text-indigo-400">
                {TAGLINE}
              </div>
            </div>
          </Link>

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 md:flex">
            {navLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-all duration-150 hover:bg-white/[0.06] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {userId ? (
              <Link
                href="/workspace"
                className="btn-premium flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
              >
                <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
              </Link>
            ) : showAuthButtons ? (
              <>
                <Link
                  href="/auth/login"
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition-all hover:bg-white/[0.08] hover:text-white"
                >
                  Login
                </Link>
                <Link href="/auth/login" className="btn-premium rounded-xl px-4 py-2 text-xs font-semibold">
                  Register
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
