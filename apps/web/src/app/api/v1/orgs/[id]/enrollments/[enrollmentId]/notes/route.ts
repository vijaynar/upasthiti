// GET/POST /api/v1/orgs/{id}/enrollments/{enrollmentId}/notes (Students page "Notes" tab)
import type { NextRequest } from 'next/server';
import { listStudentNotes, addStudentNote } from '@abhyas/module-people';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; enrollmentId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { enrollmentId } = await params;
  return jsonData(await listStudentNotes(session, enrollmentId));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; enrollmentId: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id, enrollmentId } = await params;
  const body = await req.json().catch(() => null);
  const noteBody = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!noteBody) return jsonError('invalid_request', 'body is required.', 400);

  try {
    const note = await addStudentNote(session, { organizationId: id, enrollmentId, body: noteBody });
    return jsonData(note, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to add a note for this student.', 403);
    throw err;
  }
}
