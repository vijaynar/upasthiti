// POST /api/v1/me/consents (Doc 08 §7)
import type { NextRequest } from 'next/server';
import { captureConsent, type ConsentKind } from '@abhyas/module-identity-auth';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

const VALID_KINDS: ConsentKind[] = ['biometric_face', 'minor_login', 'media_publish', 'medical_access', 'marketing'];

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const body = await req.json().catch(() => null);
  const subjectUserId = body?.subjectUserId ?? session.userId;
  const kind = body?.kind;
  if (!VALID_KINDS.includes(kind)) {
    return jsonError('invalid_kind', `kind must be one of ${VALID_KINDS.join(', ')}.`, 400);
  }

  const consentId = await captureConsent(session, subjectUserId, kind, body?.evidence ?? {});
  return jsonData({ consentId });
}
