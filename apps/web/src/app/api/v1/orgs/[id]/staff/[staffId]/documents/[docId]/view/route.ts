// GET /api/v1/orgs/{id}/staff/{staffId}/documents/{docId}/view
// Generates a short-lived signed read URL for a staff KYC document and
// redirects the browser to it. listStaffDocuments is RLS-gated to the row
// owner or an org HR admin, so no extra ownership check is needed here.
import type { NextRequest } from 'next/server';
import { storage } from '@abhyas/platform';
import { listStaffDocuments } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonError } from '@/lib/v2-session';
import { NextResponse } from 'next/server';

const DOCS = storage.makeSupabaseStorageAdapter('coach-documents');

export async function GET(req: NextRequest, { params }: { params: Promise<{ staffId: string; docId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId, docId } = await params;
  const docs = await listStaffDocuments(session, staffId);
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return jsonError('not_found', 'Document not found.', 404);

  try {
    const signedUrl = await DOCS.signedRead(doc.storagePath as `user/${string}`, 300);
    return NextResponse.redirect(signedUrl);
  } catch {
    return jsonError('view_failed', 'Could not generate a view URL for this document.', 500);
  }
}
