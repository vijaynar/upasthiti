// GET /api/v1/me/staff/documents/{docId}/view
// Generates a short-lived signed read URL for a private coach-document and
// redirects the browser to it, so the user can view/download their own file.
// RLS on staff_documents ensures only the row owner (or org HR admin) can
// look it up — no extra ownership check needed here.
import type { NextRequest } from 'next/server';
import { storage } from '@abhyas/platform';
import { listStaffDocuments, getMyStaffProfile } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonError } from '@/lib/v2-session';
import { NextResponse } from 'next/server';

const DOCS = storage.makeSupabaseStorageAdapter('coach-documents');

export async function GET(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { docId } = await params;

  // Look up the document through the RLS-gated service so we get the storagePath
  // only if the caller is allowed to see it.
  const staffProfile = await getMyStaffProfile(session);
  if (!staffProfile) return jsonError('no_staff_profile', 'No HR profile found.', 404);

  const docs = await listStaffDocuments(session, staffProfile.id);
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return jsonError('not_found', 'Document not found.', 404);

  try {
    const signedUrl = await DOCS.signedRead(doc.storagePath as `user/${string}`, 300);
    // Redirect so the browser opens the file inline (images) or downloads it (PDFs).
    return NextResponse.redirect(signedUrl);
  } catch {
    return jsonError('view_failed', 'Could not generate a view URL for this document.', 500);
  }
}
