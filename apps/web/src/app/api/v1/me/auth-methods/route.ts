// GET/POST /api/v1/me/auth-methods (Doc 08 §7, Doc 05 §5 — link/unlink)
import type { NextRequest } from 'next/server';
import { listAuthMethods, linkAuthMethod, AuthMethodTakenError } from '@abhyas/module-identity-auth';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  return jsonData(await listAuthMethods(session));
}

// Linking a NEW provider requires that provider's own verification to have
// already happened (this endpoint takes an already-verified provider_uid,
// e.g. from a completed OAuth/magic-link round trip while already logged
// in) — it never accepts an unverified credential from the client.
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const provider = body?.provider;
  const providerUid = body?.providerUid;
  if ((provider !== 'google' && provider !== 'email_otp') || typeof providerUid !== 'string' || !providerUid) {
    return jsonError('invalid_request', 'provider must be google|email_otp, providerUid is required.', 400);
  }

  try {
    await linkAuthMethod(session, provider, providerUid);
    return jsonData({ linked: true });
  } catch (err) {
    if (err instanceof AuthMethodTakenError) return jsonError('auth_method_taken', err.message, 409);
    throw err;
  }
}
