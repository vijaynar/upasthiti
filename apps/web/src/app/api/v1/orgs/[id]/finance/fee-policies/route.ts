// GET/POST /api/v1/orgs/{id}/finance/fee-policies (Doc 07 §9)
import type { NextRequest } from 'next/server';
import { listFeePolicies, createFeePolicy, type FeePolicyKind } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const VALID_KINDS: FeePolicyKind[] = ['recurring_monthly', 'recurring_term', 'one_time', 'per_session'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listFeePolicies(session, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const kind = typeof body?.kind === 'string' && VALID_KINDS.includes(body.kind) ? (body.kind as FeePolicyKind) : undefined;
  const amountMinor = typeof body?.amountMinor === 'number' ? body.amountMinor : undefined;

  if (!name) return jsonError('invalid_request', 'name is required.', 400);
  if (!kind) return jsonError('invalid_request', `kind must be one of ${VALID_KINDS.join(', ')}.`, 400);
  if (typeof amountMinor !== 'number' || amountMinor < 0) return jsonError('invalid_request', 'amountMinor must be a non-negative number.', 400);

  try {
    const policy = await createFeePolicy(session, {
      organizationId: id,
      name,
      kind,
      amountMinor,
      currency: typeof body?.currency === 'string' ? body.currency : undefined,
      finePolicy: body?.finePolicy ?? undefined,
    });
    return jsonData(policy, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to create a fee policy here.', 403);
    throw err;
  }
}
