// Chrome for public coach profile pages (/coaches/[slug]), linked from
// /explore and /explore/search result cards. Mirrors explore/layout.tsx
// (same radial-mesh-bg + PublicSiteHeader) so a coach profile feels like a
// page inside the marketplace rather than a disconnected, bespoke screen.
// Header auth buttons are hidden here (showAuthButtons=false) because the
// page itself already has a contextual "Login / Register" CTA gating the
// coach's contact details — showing it twice on one page isn't a pattern
// any other page in the app uses.

import PublicSiteHeader from '@/components/PublicSiteHeader';

export default function CoachesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen text-slate-100">
      <div className="radial-mesh-bg" />
      <PublicSiteHeader showAuthButtons={false} />
      {children}
    </div>
  );
}
