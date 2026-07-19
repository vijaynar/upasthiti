// platform/payments — createOrder/verifyWebhook/payout (Doc 14 §7, Doc 09 §9).
// Razorpay + Route. Implementation lands in Phase 9 (Finance & Ledger).

export interface PaymentOrder {
  orderId: string;
  amountMinor: number;
  currency: string;
}

export interface PaymentsAdapter {
  createOrder(amountMinor: number, currency: string, chargeIds: string[]): Promise<PaymentOrder>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean;
  initiatePayout(orgId: string, amountMinor: number, currency: string): Promise<{ payoutRef: string }>;
}
