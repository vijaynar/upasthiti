// GET/POST /api/v1/orgs/{id}/finance/charges (Doc 07 §9)
import type { NextRequest } from 'next/server';
import { listCharges, createCharge, type ChargeKind, type ChargeStatus } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

const VALID_KINDS: ChargeKind[] = ['fee', 'fine', 'adjustment'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  return jsonData(
    await listCharges(session, {
      organizationId: id,
      branchId: searchParams.get('branchId') ?? undefined,
      enrollmentId: searchParams.get('enrollmentId') ?? undefined,
      status: (searchParams.get('status') as ChargeStatus | null) ?? undefined,
    })
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const branchId = typeof body?.branchId === 'string' ? body.branchId : '';
  const enrollmentId = typeof body?.enrollmentId === 'string' ? body.enrollmentId : '';
  const kind = typeof body?.kind === 'string' && VALID_KINDS.includes(body.kind) ? (body.kind as ChargeKind) : undefined;
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const amountMinor = typeof body?.amountMinor === 'number' ? body.amountMinor : undefined;
  const dueOn = typeof body?.dueOn === 'string' ? body.dueOn : '';

  if (!branchId || !enrollmentId) return jsonError('invalid_request', 'branchId and enrollmentId are required.', 400);
  if (!kind) return jsonError('invalid_request', `kind must be one of ${VALID_KINDS.join(', ')}.`, 400);
  if (!description) return jsonError('invalid_request', 'description is required.', 400);
  if (typeof amountMinor !== 'number' || amountMinor <= 0) return jsonError('invalid_request', 'amountMinor must be a positive number.', 400);
  if (!dueOn) return jsonError('invalid_request', 'dueOn is required.', 400);

  try {
    const charge = await createCharge(session, {
      organizationId: id,
      branchId,
      enrollmentId,
      feePolicyId: typeof body?.feePolicyId === 'string' ? body.feePolicyId : undefined,
      kind,
      description,
      amountMinor,
      currency: typeof body?.currency === 'string' ? body.currency : undefined,
      dueOn,
    });
    return jsonData(charge, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to create a charge here.', 403);
    throw err;
  }
}
