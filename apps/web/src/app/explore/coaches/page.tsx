// /explore/coaches — kept as a stable URL for anything that links directly
// to "Coaches" (nav already goes straight to /explore/search); forwards to
// the same full-filter results page rather than duplicating it.
import { redirect } from 'next/navigation';

export default function CoachesPage() {
  redirect('/explore/search');
}
