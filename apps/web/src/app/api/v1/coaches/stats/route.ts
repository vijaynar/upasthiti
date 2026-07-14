// apps/web/src/app/api/v1/coaches/stats/route.ts
// GET /api/v1/coaches/stats — tenant-wide aggregate stats for the Coach
// Operations Dashboard (pending payout total, expiring docs, etc).
// Kept separate from GET /api/v1/coaches so the roster fetch doesn't have
// to run N per-coach payout/document queries.

import { getAuthContext, adminDb, ok, err, hasRole } from '@/lib/api';

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return err('Unauthorised', 401);
    if (!hasRole(ctx, 'admin', 'superadmin')) return err('Forbidden', 403);

    const db = adminDb();
    const tenantFilter = (query: any) =>
      ctx.role === 'superadmin' ? query : query.eq('tenant_id', ctx.tenantId);

    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const [payoutsRes, expiringDocsRes, pendingDocsRes, financialRes] = await Promise.all([
      tenantFilter(db.from('coach_payouts').select('net_payout, status, coach_id')).neq('status', 'Paid'),
      tenantFilter(db.from('coach_documents').select('id, expiry_date'))
        .not('expiry_date', 'is', null)
        .gte('expiry_date', today)
        .lte('expiry_date', thirtyDaysFromNow),
      tenantFilter(db.from('coach_documents').select('id')).eq('verification_status', 'Pending'),
      tenantFilter(db.from('coach_financial_settings').select('coach_id, bank_account_number, bank_ifsc_code')),
    ]);

    if (payoutsRes.error) throw payoutsRes.error;
    if (expiringDocsRes.error) throw expiringDocsRes.error;
    if (pendingDocsRes.error) throw pendingDocsRes.error;
    if (financialRes.error) throw financialRes.error;

    const pendingPayoutTotal = (payoutsRes.data ?? []).reduce((sum: number, p: any) => sum + Number(p.net_payout ?? 0), 0);
    const pendingPayoutCoachCount = new Set((payoutsRes.data ?? []).map((p: any) => p.coach_id)).size;
    const expiringDocsCount = (expiringDocsRes.data ?? []).length;
    const pendingDocVerificationCount = (pendingDocsRes.data ?? []).length;
    const missingBankDetailsCount = (financialRes.data ?? []).filter(
      (f: any) => !f.bank_account_number || !f.bank_ifsc_code
    ).length;

    return ok({
      pendingPayoutTotal,
      pendingPayoutCoachCount,
      expiringDocsCount,
      pendingDocVerificationCount,
      missingBankDetailsCount,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal server error', 500);
  }
}
