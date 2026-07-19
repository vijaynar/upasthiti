// platform/auth — the auth adapter (Doc 05 §3). The app never consumes
// Supabase JWTs or `auth.users` directly; every provider verifies identity
// only, then the caller resolves-or-creates our own `users`/`auth_methods`
// row and issues our own session (Phase 2, Doc 05 §6).
//
// Scope decision (2026-07-19): v1 ships Google OAuth + email magic link
// only. Phone OTP and email+password are kept in this interface as
// deferred methods — NOT implemented — so the adapter shape doesn't need
// to change when they're added later (SMS/DLT provider + WhatsApp template
// approval have long lead times and were deliberately pushed out of v1).

export interface OAuthStartResult {
  redirectUrl: string;
}

export interface ProviderIdentity {
  /** Provider-specific unique id (Supabase auth uid, verified email, ...). */
  providerUid: string;
  verifiedEmail?: string;
}

export interface AuthAdapter {
  startOAuth(provider: 'google'): Promise<OAuthStartResult>;
  verifyOAuthCallback(provider: 'google', callbackParams: Record<string, string>): Promise<ProviderIdentity>;

  startMagicLink(email: string): Promise<void>;
  verifyMagicLink(token: string): Promise<ProviderIdentity>;

  /** @deferred Phone OTP — not implemented in v1 (see scope decision above). */
  startOtp(phone: string): Promise<never>;
  /** @deferred Phone OTP — not implemented in v1 (see scope decision above). */
  verifyOtp(phone: string, code: string): Promise<never>;
}

export class DeferredAuthMethodError extends Error {
  constructor(method: string) {
    super(`[platform/auth] ${method} is deferred — not implemented in v1 (Google OAuth + email magic link only).`);
  }
}
