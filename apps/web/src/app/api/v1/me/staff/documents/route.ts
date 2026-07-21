// GET/POST /api/v1/me/staff/documents — list / upload my own HR documents
import type { NextRequest } from 'next/server';
import { getMyStaffProfile, listStaffDocuments, uploadStaffDocument, type DocType } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const DOC_TYPES: DocType[] = ['id_proof', 'address_proof', 'certification', 'background_check', 'other'];

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const profile = await getMyStaffProfile(session);
  if (!profile) return jsonData([]);
  return jsonData(await listStaffDocuments(session, profile.id));
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const profile = await getMyStaffProfile(session);
  if (!profile) return jsonError('no_staff_profile', 'You do not have an HR profile in this organization.', 404);

  const body = await req.json().catch(() => null);
  const docType = DOC_TYPES.includes(body?.docType) ? (body.docType as DocType) : null;
  const storagePath = typeof body?.storagePath === 'string' ? body.storagePath.trim() : '';
  if (!docType || !storagePath) return jsonError('invalid_request', 'A valid docType and storagePath are required.', 400);

  try {
    const doc = await uploadStaffDocument(session, { staffProfileId: profile.id, docType, storagePath });
    return jsonData(doc, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to upload documents.', 403);
    throw err;
  }
}
