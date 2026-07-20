// GET/POST /api/v1/me/referrals — any signed-in user (Doc 04 §4 "any user"
// referral right, BR4/US-8). No org context needed.
import type { NextRequest } from 'next/server';
import { createReferral, listMyReferrals } from '@abhyas/module-marketplace';
import { getSessionFromRequest, jsonData, jsonError } from '@/lib/v2-session';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const referrals = await listMyReferrals(session);
  return jsonData(referrals);
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const referral = await createReferral(session);
  return jsonData(referral, 201);
}
