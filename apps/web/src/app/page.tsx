import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { jwt as platformJwt } from '@abhyas/platform';

// Root route: send a signed-in V2 user to their workspace switcher, everyone
// else to the public marketplace. Checks the same abhyas_access_token cookie
// explore/layout.tsx's getOptionalUserId() does — no more Supabase-session
// check (that was V1's `/admin/dashboard`, now removed).
async function hasActiveV2Session(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('abhyas_access_token')?.value;
    if (!token) return false;
    platformJwt.verifyAccessToken(token);
    return true;
  } catch {
    return false;
  }
}

export default async function Home() {
  const loggedIn = await hasActiveV2Session();
  redirect(loggedIn ? '/dashboard' : '/explore');
}

