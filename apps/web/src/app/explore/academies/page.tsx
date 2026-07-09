import Link from 'next/link';
import { Building2, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Find Academies Near You | Abhyas',
  description:
    'Discover top-rated academies for sports, education, music and more.',
};

export default function AcademiesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-24 text-center">
      <div className="w-20 h-20 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6">
        <Building2 className="w-9 h-9 text-indigo-400" />
      </div>
      <h1 className="text-3xl font-black text-white mb-3">Academy Directory</h1>
      <p className="text-slate-400 text-base mb-2">
        The full academy search is coming soon.
      </p>
      <p className="text-slate-500 text-sm mb-8">
        Meanwhile, browse individual coaches who teach at academies near you.
      </p>
      <Link
        href="/explore/coaches"
        className="btn-premium px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
      >
        Browse Coaches <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
