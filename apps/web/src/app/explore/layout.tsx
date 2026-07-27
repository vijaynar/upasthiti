// Top nav for the public marketplace (`/explore`, `/explore/[slug]`) —
// wireframe 5a's header (logo, nav, Log in/Dashboard), reusing the same
// dark glass-panel look as the rest of the app (admin console, auth pages)
// rather than a bespoke light theme. Header itself lives in
// components/PublicSiteHeader.tsx so /coaches/[slug] (linked from these
// pages' result cards) can share the exact same chrome instead of
// duplicating it.

import PublicSiteHeader from '@/components/PublicSiteHeader';

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen text-slate-100">
      <div className="radial-mesh-bg" />
      <PublicSiteHeader />
      {children}
    </div>
  );
}
