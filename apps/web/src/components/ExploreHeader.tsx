import Link from 'next/link';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { LayoutDashboard } from 'lucide-react';

async function getOptionalUser() {
  try {
    const cookieStore = await cookies();
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return null;
    }
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

const NAV_LINKS = [
  { label: 'Browse',           href: '/explore' },
  { label: 'Coaches',          href: '/explore/coaches' },
  { label: 'Academies',        href: '/explore/academies' },
  { label: 'About Us',         href: '/explore/about' },
  { label: 'For Institutions', href: '/auth/login' },
];

export default async function ExploreHeader() {
  const user = await getOptionalUser();

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-white/[0.08]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-4">

          {/* ── Logo ── */}
          <Link href="/explore" className="flex items-center gap-2.5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt="Abhyas"
              className="h-8 w-auto object-contain"
            />
            <div className="leading-none">
              <div className="text-[13px] font-black text-white tracking-tight">
                ABHYAS
              </div>
              <div className="text-[8px] text-indigo-400 font-semibold tracking-widest mt-0.5">
                SMART ACADEMY
              </div>
            </div>
          </Link>

          {/* ── Centre nav ── */}
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_LINKS.map(item => (
              <Link
                key={item.label}
                href={item.href}
                className="px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all duration-150 font-medium"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* ── Auth buttons ── */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <Link
                href="/admin/dashboard"
                className="btn-premium flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/10 transition-all"
                >
                  Login
                </Link>
                <Link
                  href="/auth/login"
                  className="btn-premium px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Register
                </Link>
              </>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
