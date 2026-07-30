// Shared conversion between PaymentPricingStep's UI shape (PricingRule/
// PricingPolicy, snake_case-ish fields, kept that way to match V1's file
// verbatim) and the /coach-profile/pricing API's wire shape (ApiPricingRule/
// ApiPricingPolicy, camelCase). Used by anything that reads or writes a
// coach's pricing policies — CoachProfileWizard's Pricing step and the My
// Profile page's Payment & Pricing section both need the identical mapping.

import type { PricingPolicy as UiPricingPolicy, PricingRule as UiPricingRule, PaymentPricingSelection } from '@/components/PaymentPricingStep';

export interface ApiPricingRule {
  amount: number;
  currency?: string;
  billingCycle?: string;
  autoRenew?: boolean;
  lateFeeAmount?: number;
  lateFeeGraceDays?: number;
  cancellationWindowHours?: number;
  minBookingCount?: number;
  classCount?: number;
  trialType?: string;
  lateArrivalFeeAmount?: number;
  lateArrivalThresholdMinutes?: number;
  absenceFeeAmount?: number;
}

export interface ApiPricingPolicy {
  policyType: string;
  enabled: boolean;
  isDefault: boolean;
  rules: ApiPricingRule[];
}

export function toApiRule(r: UiPricingRule): ApiPricingRule {
  return {
    amount: r.amount,
    currency: r.currency,
    billingCycle: r.billing_cycle,
    autoRenew: r.auto_renew,
    lateFeeAmount: r.late_fee_amount,
    lateFeeGraceDays: r.late_fee_grace_days,
    cancellationWindowHours: r.cancellation_window_hours,
    minBookingCount: r.min_booking_count,
    classCount: r.class_count,
    trialType: r.trial_type,
    lateArrivalFeeAmount: r.late_arrival_fee_amount,
    lateArrivalThresholdMinutes: r.late_arrival_threshold_minutes,
    absenceFeeAmount: r.absence_fee_amount,
  };
}

export function fromApiRule(r: ApiPricingRule): UiPricingRule {
  return {
    amount: r.amount,
    currency: r.currency,
    billing_cycle: r.billingCycle as UiPricingRule['billing_cycle'],
    auto_renew: r.autoRenew,
    late_fee_amount: r.lateFeeAmount,
    late_fee_grace_days: r.lateFeeGraceDays,
    cancellation_window_hours: r.cancellationWindowHours,
    min_booking_count: r.minBookingCount,
    class_count: r.classCount,
    trial_type: r.trialType as UiPricingRule['trial_type'],
    late_arrival_fee_amount: r.lateArrivalFeeAmount,
    late_arrival_threshold_minutes: r.lateArrivalThresholdMinutes,
    absence_fee_amount: r.absenceFeeAmount,
  };
}

export function applyExistingPricing(base: PaymentPricingSelection, existing: ApiPricingPolicy[]): PaymentPricingSelection {
  if (existing.length === 0) return base;
  return {
    ...base,
    policies: base.policies.map((p) => {
      const match = existing.find((e) => e.policyType === p.policyType);
      if (!match) return { ...p, enabled: false };
      return { policyType: p.policyType, enabled: true, isDefault: match.isDefault, rules: match.rules.map(fromApiRule) };
    }),
  };
}

export function toApiPolicies(selection: PaymentPricingSelection): ApiPricingPolicy[] {
  return selection.policies
    .filter((p) => p.enabled)
    .map((p): ApiPricingPolicy => ({ policyType: p.policyType, enabled: true, isDefault: p.isDefault, rules: p.rules.map(toApiRule) }));
}
