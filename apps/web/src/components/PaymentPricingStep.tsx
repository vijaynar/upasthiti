'use client';

import { IndianRupee, ToggleLeft, ToggleRight, Plus, Trash2 } from 'lucide-react';

// Student-facing pricing — how a coach charges STUDENTS. Distinct from
// coach_financial_settings (how the academy pays the coach).
//
// Revenue Share is intentionally not a selectable PolicyType here — it's
// Phase 2 (see docs/coach_pricing_policies.md), deferred until a real
// payment account/gateway exists.
export type PolicyType =
  | 'monthly_subscription'
  | 'per_class'
  | 'package'
  | 'trial_session'
  | 'fine_based'
  | 'one_time_registration';

export interface PricingRule {
  amount: number;
  currency?: string;
  billing_cycle?: 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
  auto_renew?: boolean;
  late_fee_amount?: number;
  late_fee_grace_days?: number;
  cancellation_window_hours?: number;
  min_booking_count?: number;
  class_count?: number;
  trial_type?: 'free' | 'paid';
  late_arrival_fee_amount?: number;
  late_arrival_threshold_minutes?: number;
  absence_fee_amount?: number;
}

export interface PricingPolicy {
  policyType: PolicyType;
  enabled: boolean;
  isDefault: boolean;
  rules: PricingRule[];
}

export interface PaymentPricingSelection {
  policies: PricingPolicy[];
  allowStudentOverrides: boolean;
}

const POLICY_ORDER: PolicyType[] = [
  'monthly_subscription', 'per_class', 'package', 'trial_session', 'fine_based', 'one_time_registration',
];

// Enabled by default when a coach first reaches this step — the most common
// starting combination. The rest remain available but off until toggled on.
const DEFAULT_ENABLED_POLICIES: PolicyType[] = ['monthly_subscription', 'per_class', 'trial_session'];

const POLICY_LABELS: Record<PolicyType, string> = {
  monthly_subscription: 'Monthly Subscription',
  per_class: 'Per Class',
  package: 'Class Packages',
  trial_session: 'Trial Session',
  fine_based: 'Fine-Based (Attendance-Linked)',
  one_time_registration: 'One-Time Registration',
};

function defaultRuleFor(policyType: PolicyType): PricingRule {
  switch (policyType) {
    case 'monthly_subscription':
      return { amount: 3000, currency: 'INR', billing_cycle: 'Monthly', auto_renew: true, late_fee_amount: 100, late_fee_grace_days: 5 };
    case 'per_class':
      return { amount: 500, currency: 'INR', cancellation_window_hours: 24, min_booking_count: 1 };
    case 'package':
      return { amount: 2200, currency: 'INR', class_count: 5 };
    case 'trial_session':
      return { amount: 0, currency: 'INR', trial_type: 'free' };
    case 'fine_based':
      return { amount: 0, currency: 'INR', late_arrival_fee_amount: 150, late_arrival_threshold_minutes: 10, absence_fee_amount: 500 };
    case 'one_time_registration':
      return { amount: 1000, currency: 'INR' };
  }
}

export function createDefaultPaymentPricingSelection(): PaymentPricingSelection {
  return {
    policies: POLICY_ORDER.map((policyType) => ({
      policyType,
      enabled: DEFAULT_ENABLED_POLICIES.includes(policyType),
      isDefault: policyType === 'monthly_subscription',
      rules: [defaultRuleFor(policyType)],
    })),
    allowStudentOverrides: false,
  };
}

export function isPaymentPricingValid(value: PaymentPricingSelection): boolean {
  const enabledPolicies = value.policies.filter((p) => p.enabled);
  if (enabledPolicies.length === 0) return false;

  return enabledPolicies.every((policy) => {
    if (policy.rules.length === 0) return false;
    return policy.rules.every((rule) => {
      if (policy.policyType === 'package') {
        return Number.isFinite(rule.amount) && rule.amount >= 0 && Number.isFinite(rule.class_count) && (rule.class_count ?? 0) >= 1;
      }
      if (policy.policyType === 'trial_session') {
        return rule.trial_type === 'free' || (Number.isFinite(rule.amount) && rule.amount >= 0);
      }
      if (policy.policyType === 'fine_based') {
        return Number.isFinite(rule.late_arrival_fee_amount) && Number.isFinite(rule.absence_fee_amount);
      }
      return Number.isFinite(rule.amount) && rule.amount >= 0;
    });
  });
}

interface PaymentPricingStepProps {
  value: PaymentPricingSelection;
  onChange: (value: PaymentPricingSelection) => void;
  theme?: 'light' | 'dark';
}

export function PaymentPricingStep({ value, onChange, theme = 'light' }: PaymentPricingStepProps) {
  const isDark = theme === 'dark';

  const updatePolicy = (policyType: PolicyType, patch: Partial<PricingPolicy>) => {
    onChange({
      ...value,
      policies: value.policies.map((p) => (p.policyType === policyType ? { ...p, ...patch } : p)),
    });
  };

  const updateRule = (policyType: PolicyType, ruleIndex: number, patch: Partial<PricingRule>) => {
    onChange({
      ...value,
      policies: value.policies.map((p) =>
        p.policyType === policyType
          ? { ...p, rules: p.rules.map((r, i) => (i === ruleIndex ? { ...r, ...patch } : r)) }
          : p
      ),
    });
  };

  const addPackageTier = () => {
    const pkg = value.policies.find((p) => p.policyType === 'package');
    updatePolicy('package', { rules: [...(pkg?.rules ?? []), { amount: 0, currency: 'INR', class_count: 10 }] });
  };

  const removePackageTier = (index: number) => {
    const pkg = value.policies.find((p) => p.policyType === 'package');
    if (!pkg) return;
    updatePolicy('package', { rules: pkg.rules.filter((_, i) => i !== index) });
  };

  const setDefaultPolicy = (policyType: PolicyType) => {
    onChange({
      ...value,
      policies: value.policies.map((p) => ({ ...p, isDefault: p.policyType === policyType })),
    });
  };

  const inputClass = `rounded-xl px-2.5 py-1.5 text-xs w-full outline-none border ${
    isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
  }`;
  const labelClass = 'block text-[10px] text-slate-500 mb-1';
  const cardClass = `p-4 border rounded-2xl space-y-3 ${isDark ? 'border-white/5 bg-white/[0.01]' : 'border-slate-100 bg-slate-50/20'}`;

  const enabledPolicies = value.policies.filter((p) => p.enabled);

  return (
    <div className="space-y-4">
      <div>
        <h3 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>How would you like to charge students?</h3>
        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          You can enable one or more pricing methods — they aren&apos;t mutually exclusive.
        </p>
      </div>

      {POLICY_ORDER.map((policyType) => {
        const policy = value.policies.find((p) => p.policyType === policyType)!;
        const rule = policy.rules[0];

        return (
          <div key={policyType} className={cardClass}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                <IndianRupee className="w-3.5 h-3.5 text-indigo-500" /> {POLICY_LABELS[policyType]}
              </span>
              <button
                type="button"
                onClick={() => updatePolicy(policyType, { enabled: !policy.enabled })}
                className="cursor-pointer"
                aria-label={`Toggle ${POLICY_LABELS[policyType]}`}
              >
                {policy.enabled ? <ToggleRight className="w-9 h-6 text-indigo-500" /> : <ToggleLeft className="w-9 h-6 text-slate-400" />}
              </button>
            </div>

            {policy.enabled && policyType === 'monthly_subscription' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelClass}>Monthly Fee (₹)</label>
                  <input type="number" min={0} value={rule.amount} onChange={(e) => updateRule(policyType, 0, { amount: Number(e.target.value) })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Billing Cycle</label>
                  <select
                    value={rule.billing_cycle}
                    onChange={(e) => updateRule(policyType, 0, { billing_cycle: e.target.value as PricingRule['billing_cycle'] })}
                    className={inputClass}
                  >
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Late Fee (₹)</label>
                  <input type="number" min={0} value={rule.late_fee_amount} onChange={(e) => updateRule(policyType, 0, { late_fee_amount: Number(e.target.value) })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Grace Days</label>
                  <input type="number" min={0} value={rule.late_fee_grace_days} onChange={(e) => updateRule(policyType, 0, { late_fee_grace_days: Number(e.target.value) })} className={inputClass} />
                </div>
                <label className="col-span-2 sm:col-span-4 flex items-center gap-2">
                  <input type="checkbox" checked={!!rule.auto_renew} onChange={(e) => updateRule(policyType, 0, { auto_renew: e.target.checked })} className="accent-indigo-600" />
                  <span className="text-[11px]">Auto Renew</span>
                </label>
              </div>
            )}

            {policy.enabled && policyType === 'per_class' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Price per Session (₹)</label>
                  <input type="number" min={0} value={rule.amount} onChange={(e) => updateRule(policyType, 0, { amount: Number(e.target.value) })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Cancellation Window (hrs)</label>
                  <input
                    type="number"
                    min={0}
                    value={rule.cancellation_window_hours}
                    onChange={(e) => updateRule(policyType, 0, { cancellation_window_hours: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Minimum Booking</label>
                  <input
                    type="number"
                    min={1}
                    value={rule.min_booking_count}
                    onChange={(e) => updateRule(policyType, 0, { min_booking_count: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {policy.enabled && policyType === 'package' && (
              <div className="space-y-2">
                {policy.rules.map((tier, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className={labelClass}>Classes</label>
                      <input
                        type="number"
                        min={1}
                        value={tier.class_count}
                        onChange={(e) => updateRule(policyType, index, { class_count: Number(e.target.value) })}
                        className={inputClass}
                      />
                    </div>
                    <div className="flex-1">
                      <label className={labelClass}>Price (₹)</label>
                      <input type="number" min={0} value={tier.amount} onChange={(e) => updateRule(policyType, index, { amount: Number(e.target.value) })} className={inputClass} />
                    </div>
                    {policy.rules.length > 1 && (
                      <button type="button" onClick={() => removePackageTier(index)} className="p-1.5 text-red-400 hover:text-red-300">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addPackageTier} className={`inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                  <Plus className="w-3.5 h-3.5" /> Add Package
                </button>
              </div>
            )}

            {policy.enabled && policyType === 'trial_session' && (
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="radio" name="trial-type" checked={rule.trial_type === 'free'} onChange={() => updateRule(policyType, 0, { trial_type: 'free', amount: 0 })} /> Free
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="radio" name="trial-type" checked={rule.trial_type === 'paid'} onChange={() => updateRule(policyType, 0, { trial_type: 'paid' })} /> Paid
                </label>
                {rule.trial_type === 'paid' && (
                  <input type="number" min={0} value={rule.amount} onChange={(e) => updateRule(policyType, 0, { amount: Number(e.target.value) })} className={`${inputClass} w-24`} />
                )}
              </div>
            )}

            {policy.enabled && policyType === 'fine_based' && (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400">Free for attending on time. Charged only for a late arrival or an absence.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Late Arrival Fee (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={rule.late_arrival_fee_amount}
                      onChange={(e) => updateRule(policyType, 0, { late_arrival_fee_amount: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Late Threshold (min)</label>
                    <input
                      type="number"
                      min={0}
                      value={rule.late_arrival_threshold_minutes}
                      onChange={(e) => updateRule(policyType, 0, { late_arrival_threshold_minutes: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Absence Fee (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={rule.absence_fee_amount}
                      onChange={(e) => updateRule(policyType, 0, { absence_fee_amount: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {policy.enabled && policyType === 'one_time_registration' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelClass}>Registration Fee (₹)</label>
                  <input type="number" min={0} value={rule.amount} onChange={(e) => updateRule(policyType, 0, { amount: Number(e.target.value) })} className={inputClass} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className={cardClass}>
        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Default Pricing for New Students</p>
        {enabledPolicies.length === 0 ? (
          <p className="text-[11px] text-slate-400">Enable at least one pricing method above to choose a default.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {enabledPolicies.map((p) => (
              <label key={p.policyType} className="flex items-center gap-1.5 text-xs">
                <input type="radio" name="default-policy" checked={p.isDefault} onChange={() => setDefaultPolicy(p.policyType)} /> {POLICY_LABELS[p.policyType]}
              </label>
            ))}
          </div>
        )}

        <label className={`flex items-start gap-2 pt-2 border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
          <input
            type="checkbox"
            checked={value.allowStudentOverrides}
            onChange={(e) => onChange({ ...value, allowStudentOverrides: e.target.checked })}
            className="mt-0.5 accent-indigo-600"
          />
          <span className="text-xs">
            <span className="font-semibold">Custom Pricing</span>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Allow setting a unique price for an individual student (e.g. a scholarship or negotiated rate).
              Managed per-student once students are enrolled — not during this onboarding step.
            </p>
          </span>
        </label>
      </div>
    </div>
  );
}
