// Top nav for the public marketplace (`/explore`, `/explore/[slug]`) —
// wireframe 5a's header (logo, nav, Log in/Dashboard), reusing the same
// dark glass-panel look as the rest of the app (admin console, auth pages)
// rather than a bespoke light theme — matches V1's `ExploreHeader` almost
// exactly, trimmed to routes that actually exist in this phase (no
// /explore/coaches, /explore/academies, /explore/about pages yet).

import Link from 'next/link';
import { cookies } from 'next/headers';
import { LayoutDashboard } from 'lucide-react';
import { jwt as platformJwt } from '@abhyas/platform';
import { TAGLINE } from '@/lib/brand';

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
  { label: 'For Institutions', href: '/auth/login' },
];

export default async function ExploreLayout({ children }: { children: React.ReactNode }) {
  const userId = await getOptionalUserId();

  return (
    <div className="relative min-h-screen text-slate-100">
      <div className="radial-mesh-bg" />

      <header className="sticky top-0 z-50 glass-panel border-b border-white/[0.08]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
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

            <nav className="hidden items-center gap-0.5 md:flex">
              {NAV_LINKS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-all duration-150 hover:bg-white/[0.06] hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              {userId ? (
                <Link
                  href="/workspace"
                  className="btn-premium flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
                </Link>
              ) : (
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
              )}
            </div>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
