// POST /api/v1/me/staff/documents/upload-url — signed Storage upload URL for
// the caller's own KYC/verification documents. Identity-scoped (user/{id}/
// docs/...), same as /api/v1/me/avatar/upload-url — NOT staff_profile-scoped,
// because a self-serve coach uploads documents mid-wizard, before their
// staff_profiles row exists (that's only created at onboard-coach submit).
// The actual staff_documents row (which does need staff_profile_id) is
// inserted afterward by POST /api/v1/me/staff/documents once submit() runs.
import type { NextRequest } from 'next/server';
import { storage } from '@abhyas/platform';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const DOCS = storage.makeSupabaseStorageAdapter('coach-documents');

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => ({}));
  const ext = typeof body?.ext === 'string' && /^[a-z0-9]{1,5}$/i.test(body.ext) ? body.ext : 'pdf';
  const contentType = typeof body?.contentType === 'string' ? body.contentType : 'application/octet-stream';
  const docType = typeof body?.docType === 'string' && /^[a-z_]{1,40}$/.test(body.docType) ? body.docType : 'document';
  const path = `user/${session.userId}/docs/${docType}-${Date.now()}.${ext}` as const;

  try {
    const { signedUrl, token } = await DOCS.signedUpload(path, contentType);
    return jsonData({ path, signedUrl, token });
  } catch (err) {
    return jsonError('upload_url_failed', err instanceof Error ? err.message : 'Could not create an upload slot.', 500);
  }
}
