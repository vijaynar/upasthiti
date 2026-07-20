// GET/POST /api/v1/orgs/{id}/finance/bank-accounts — finance.payout.manage
import type { NextRequest } from 'next/server';
import { listBankAccounts, addBankAccount } from '@abhyas/module-finance';
import { getSessionFromRequest, jsonData, jsonError, isRlsDenied } from '@/lib/v2-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  return jsonData(await listBankAccounts(session, id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return jsonError('no_session', 'Not signed in.', 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const accountHolderName = typeof body?.accountHolderName === 'string' ? body.accountHolderName.trim() : '';
  const bankName = typeof body?.bankName === 'string' ? body.bankName.trim() : '';
  const accountLast4 = typeof body?.accountLast4 === 'string' ? body.accountLast4.trim() : '';

  if (!accountHolderName || !bankName || !accountLast4) {
    return jsonError('invalid_request', 'accountHolderName, bankName, and accountLast4 are required.', 400);
  }

  try {
    const account = await addBankAccount(session, { organizationId: id, accountHolderName, bankName, accountLast4 });
    return jsonData(account, 201);
  } catch (err) {
    if (isRlsDenied(err)) return jsonError('forbidden', 'You do not have permission to add a bank account here.', 403);
    throw err;
  }
}
