// POST /api/v1/me/avatar/upload-url — issues a signed Supabase Storage
// upload URL for the caller's own avatar. The browser uploads the file
// bytes directly to that URL (platform/storage's signed-upload pattern);
// this route only ever hands out a slot scoped to `user/{callerId}/...`.
import type { NextRequest } from 'next/server';
import { storage } from '@abhyas/platform';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const AVATARS = storage.makeSupabaseStorageAdapter('avatars');

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => ({}));
  const ext = typeof body?.ext === 'string' && /^[a-z0-9]{1,5}$/i.test(body.ext) ? body.ext : 'jpg';
  const contentType = typeof body?.contentType === 'string' ? body.contentType : 'application/octet-stream';
  const path = `user/${session.userId}/avatar-${Date.now()}.${ext}` as const;

  try {
    const { signedUrl, token } = await AVATARS.signedUpload(path, contentType);
    return jsonData({ path, signedUrl, token });
  } catch (err) {
    return jsonError('upload_url_failed', err instanceof Error ? err.message : 'Could not create an upload slot.', 500);
  }
}
