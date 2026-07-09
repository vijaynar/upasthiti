import { type Metadata } from 'next';
import ExploreHeader from '@/components/ExploreHeader';

export const metadata: Metadata = {
  title: 'Find the Best Coaches & Academies Near You | Abhyas',
  description:
    'Discover top-rated coaches and academies in your city. Search by sport, education, music, dance, fitness and more.',
};

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ExploreHeader />
      <main className="min-h-screen">{children}</main>
      <footer className="border-t border-white/[0.06] mt-20 py-10">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-slate-600 text-xs">
            &copy; 2025 Abhyas &mdash; Smart Academy Management Platform
          </p>
          <p className="text-slate-700 text-[10px] mt-1">
            Empowering academies across India
          </p>
        </div>
      </footer>
    </>
  );
}
