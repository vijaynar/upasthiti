// POST /api/v1/orgs/{id}/staff/{staffId}/documents/upload-url — an HR admin
// issuing a signed Storage upload URL for a member's KYC/verification
// documents. resolveStaffProfileOwner does the authorization check (RLS on
// staff_profiles: self OR hr.staff.*) and resolves the target user's id so
// the path stays user/{id}/docs/... regardless of who's uploading.
import type { NextRequest } from 'next/server';
import { storage } from '@abhyas/platform';
import { resolveStaffProfileOwner } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const DOCS = storage.makeSupabaseStorageAdapter('coach-documents');

export async function POST(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId } = await params;
  const owner = await resolveStaffProfileOwner(session, staffId);
  if (!owner) return jsonError('forbidden', 'You do not have permission to upload documents here.', 403);

  const body = await req.json().catch(() => ({}));
  const ext = typeof body?.ext === 'string' && /^[a-z0-9]{1,5}$/i.test(body.ext) ? body.ext : 'pdf';
  const contentType = typeof body?.contentType === 'string' ? body.contentType : 'application/octet-stream';
  const docType = typeof body?.docType === 'string' && /^[a-z_]{1,40}$/.test(body.docType) ? body.docType : 'document';
  const path = `user/${owner.userId}/docs/${docType}-${Date.now()}.${ext}` as const;

  try {
    const { signedUrl, token } = await DOCS.signedUpload(path, contentType);
    return jsonData({ path, signedUrl, token });
  } catch (err) {
    return jsonError('upload_url_failed', err instanceof Error ? err.message : 'Could not create an upload slot.', 500);
  }
}
