import { createServerClient } from '@supabase/ssr';
import type { AuthAdapter, CookieJar, OAuthStartResult, ProviderIdentity } from './index';
import { DeferredAuthMethodError } from './index';

// v1 implementation of the auth adapter (Doc 05 §3): Supabase Auth verifies
// identity only (Google OAuth + email magic link, PKCE flow) — the caller
// (identity-auth module) resolves-or-creates OUR user/auth_methods rows and
// issues OUR session (jwt.ts). Supabase's own session/tokens are discarded
// after this file hands back a ProviderIdentity.
//
// Uses @supabase/ssr's createServerClient (not the plain supabase-js
// client): PKCE requires a code-verifier to survive between the "start"
// request and the later "callback" request, which only works via the
// injected CookieJar — a stateless per-request client (what this file used
// before) has nowhere to persist it, which silently downgrades Supabase to
// implicit flow (fragment-based tokens our server can never see).

function getClient(cookieJar: CookieJar) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('[platform/auth/supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieJar.getAll(),
      setAll: (cookies: Array<{ name: string; value: string; options: Record<string, unknown> }>) =>
        cookieJar.setAll(cookies),
    },
  });
}

export const supabaseAuthAdapter: AuthAdapter = {
  async startOAuth(provider, cookieJar): Promise<OAuthStartResult> {
    const { data, error } = await getClient(cookieJar).auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/auth/oauth/google/callback` },
    });
    if (error || !data.url) {
      throw new Error(`[platform/auth/supabase] startOAuth(${provider}) failed: ${error?.message ?? 'no redirect url'}`);
    }
    return { redirectUrl: data.url };
  },

  async verifyOAuthCallback(_provider, callbackParams, cookieJar): Promise<ProviderIdentity> {
    const code = callbackParams.code;
    if (!code) throw new Error('[platform/auth/supabase] OAuth callback missing "code" param.');
    const { data, error } = await getClient(cookieJar).auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      throw new Error(`[platform/auth/supabase] verifyOAuthCallback failed: ${error?.message ?? 'no user'}`);
    }
    const verifiedEmail = data.user.email_confirmed_at ? data.user.email : undefined;
    return { providerUid: data.user.id, ...(verifiedEmail ? { verifiedEmail } : {}) };
  },

  async startMagicLink(email, cookieJar): Promise<void> {
    const { error } = await getClient(cookieJar).auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/auth/magic-link/callback` },
    });
    if (error) throw new Error(`[platform/auth/supabase] startMagicLink failed: ${error.message}`);
  },

  async verifyMagicLink(token, cookieJar): Promise<ProviderIdentity> {
    const { data, error } = await getClient(cookieJar).auth.exchangeCodeForSession(token);
    if (error || !data.user) {
      throw new Error(`[platform/auth/supabase] verifyMagicLink failed: ${error?.message ?? 'no user'}`);
    }
    // magic-link click IS the email verification
    return { providerUid: data.user.id, ...(data.user.email ? { verifiedEmail: data.user.email } : {}) };
  },

  async startOtp(): Promise<never> {
    throw new DeferredAuthMethodError('startOtp');
  },

  async verifyOtp(): Promise<never> {
    throw new DeferredAuthMethodError('verifyOtp');
  },
};
