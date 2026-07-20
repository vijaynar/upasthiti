// DELETE /api/v1/platform/roles/{userId}/{roleKey} (Doc 04 §3 revoke)
import type { NextRequest } from 'next/server';
import { revokePlatformRole, PlatformPermissionError } from '@abhyas/module-platform-admin';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ userId: string; roleKey: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { userId, roleKey } = await params;
  try {
    await revokePlatformRole(session, userId, roleKey);
    return jsonData({ revoked: true });
  } catch (err) {
    if (err instanceof PlatformPermissionError) return jsonError('forbidden', err.message, 403);
    // protect_seed_platform_role (migration 0006) raises a plain Postgres
    // exception (no distinguishable error class) if this targets the seed
    // super admin — surfaced as a 409 rather than an opaque 500.
    if (typeof err === 'object' && err !== null && 'message' in err && String((err as { message: unknown }).message).includes('seed platform role')) {
      return jsonError('protected', 'The seed super admin role assignment cannot be revoked.', 409);
    }
    throw err;
  }
}
