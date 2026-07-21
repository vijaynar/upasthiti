// GET/POST /api/v1/orgs/{id}/staff/{staffId}/documents — list / upload a staff KYC document
import type { NextRequest } from 'next/server';
import { listStaffDocuments, uploadStaffDocument, StaffStateError, type DocType } from '@abhyas/module-staff-hr';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const DOC_TYPES: DocType[] = ['id_proof', 'address_proof', 'certification', 'background_check', 'other'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId } = await params;
  return jsonData(await listStaffDocuments(session, staffId));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { staffId } = await params;
  const body = await req.json().catch(() => null);
  const docType = DOC_TYPES.includes(body?.docType) ? (body.docType as DocType) : null;
  const storagePath = typeof body?.storagePath === 'string' ? body.storagePath.trim() : '';
  if (!docType || !storagePath) return jsonError('invalid_request', 'A valid docType and storagePath are required.', 400);

  try {
    const doc = await uploadStaffDocument(session, { staffProfileId: staffId, docType, storagePath });
    return jsonData(doc, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to upload documents here.', 403);
    if (err instanceof StaffStateError) return jsonError('invalid_state', err.message, 409);
    throw err;
  }
}
