# Coach Pricing & Payment Policies

How **students pay for coaching** — collected during Coach Onboarding (Step 4,
"Payment & Pricing", between Documents and Account Security) and editable
afterward from the coach's own Profile settings.

This is the opposite direction from `coach_financial_settings`/`coach_payouts`
(`supabase/migrations/0005_coach_module.sql`), which govern how the **academy
pays the coach** (salary/per-class/revenue-share/hybrid payroll) — the two are
unrelated and must not be conflated.

## Model

A coach may enable **any combination** of pricing policies at once — never
mutually exclusive. A swimming coach might run Monthly Subscription for
regulars, Per Class for casual students, and a paid Trial Session for
newcomers, all at the same time.

| Policy type | What it charges for | Phase |
|---|---|---|
| `monthly_subscription` | Flat recurring fee per billing cycle, regardless of classes attended | 1 |
| `per_class` | Pay only for classes actually booked, no commitment | 1 |
| `package` | Prepaid bundle of a fixed class count (multiple tiers per coach) | 1 |
| `trial_session` | One-off first class, free or a nominal paid amount | 1 |
| `fine_based` | Free for attending as scheduled; charged only for a late arrival or an absence | 1 |
| `one_time_registration` | Single upfront fee at enrollment, stackable with any recurring policy | 1 |
| *(custom pricing)* | Not a policy row — a capability flag letting a coach set a unique amount for an individual student | 1 (schema); editor UI is a fast-follow |
| `revenue_share` | Split a student's payment with the academy by percentage | 2 — deferred |

**Why Revenue Share is deferred:** it's fundamentally a commission/settlement
concept — it only means something once a real payment gateway/account exists
to decide who collects the money and how the split gets paid out. There is no
Stripe/Razorpay (or any gateway) integration anywhere in this codebase today,
so building it now would be configuration with nothing to enforce it against.
It ships in Phase 2 alongside the Platform Fee / commission-plan panel and
payout automation, once a real payment account is connected.

**Fine-Based reuses the existing `fines` ledger.** Rather than a parallel
money-tracking table, a `fine_based` policy's issued charges land in the
existing `fines` table (`supabase/migrations/0001_initial_schema.sql` — proof
upload, `status: unpaid|pending_verification|paid|waived`); `coach_pricing_rules`
only supplies the per-coach amounts/thresholds. The tenant-wide auto-fine
trigger (`tenant_settings.absent_fine_rule_*`, tiered by monthly absence
count) is a separate, pre-existing disciplinary mechanism, untouched by this
work. Wiring "attendance event → auto-issue a fine from this policy" is a
**fast-follow**, contingent on confirming exactly where the app currently
marks attendance.

## Schema (`supabase/migrations/0011_coach_pricing_policies.sql`)

| Table | Purpose |
|---|---|
| `coach_pricing_policies` | One row per pricing model a coach has enabled: `id, tenant_id, coach_id -> coaches, policy_type, enabled, is_default`. Partial unique index enforces one `is_default` per coach. |
| `coach_pricing_rules` | Configurable fields for a policy: `id, policy_id -> coach_pricing_policies, amount, currency, billing_cycle, auto_renew, late_fee_amount, late_fee_grace_days` (monthly); `cancellation_window_hours, min_booking_count` (per-class); `class_count, sort_order` (package tiers — many rows per policy); `trial_type` (trial); `late_arrival_fee_amount, late_arrival_threshold_minutes, absence_fee_amount` (fine-based). One row per policy, except package (one row per tier). |
| `coach_pricing_settings` | 1:1 with coach: `coach_id, tenant_id, default_policy_type, allow_student_overrides` (the "Custom Pricing" toggle). Mirrors `coach_financial_settings`'s 1:1 pattern. |
| `coach_student_pricing_overrides` | Per-student custom pricing: `id, tenant_id, coach_id, student_id -> students, override_type, override_amount, class_count, reason, effective_from, effective_to, created_by`. Partial unique index on `(coach_id, student_id) WHERE effective_to IS NULL` — one active override at a time. Schema ships in Phase 1; no editor UI yet (see below). |

`late_fee_amount` (monthly — late *payment*) and `late_arrival_fee_amount`
(fine-based — late *arrival*) are deliberately distinct columns even though
both read as "late fee" in casual conversation; they live on different
`policy_type` rows and mean different things.

RLS: blanket `tenant_isolation_policy` on all four tables (`coach_pricing_rules`
has no `tenant_id` of its own — isolated via its parent policy's `tenant_id`
through a subquery), plus role-scoped policies (`*_admin_all` for
admin/superadmin, `*_coach_manage_own` for `coach_id = auth.uid()`) using the
existing `auth_tenant_id()`/`auth_user_role()` helpers from
`0003_indexes_rls.sql`. A student can `SELECT` their own active override row
(`cspo_student_self_select`) for a future student-facing billing view. Reuses
the `('payments','manage')`/`('payments','view')` RBAC permission stubs
already seeded in `0009_governance_rbac.sql`.

## APIs

No standalone pricing endpoints — writes go through the same two existing
coach-onboarding entry points, matching how `coach_financial_settings` is
already threaded through them (`syncCoachCategories`/`syncCoachServiceAreas`
precedent):

- **`POST/PUT /api/v1/coaches/route.ts`** (admin onboarding + self-edit) and
  **`POST /api/v1/auth/register/route.ts`** (public self-registration) each
  accept `pricingPolicies: PricingPolicyInput[]` and `allowStudentOverrides:
  boolean` in the request body.
- Both routes call a local `syncCoachPricingPolicies()` helper (duplicated in
  each file, same rationale as the existing category/service-area helpers —
  "kept local to avoid a cross-route import between two independent
  onboarding entry points"). It delete-then-reinserts the coach's
  `coach_pricing_policies`/`coach_pricing_rules` and upserts
  `coach_pricing_settings`, deriving `is_default`/`default_policy_type` from
  whichever policy in the payload has `isDefault: true`.
- **Reads have no API route at all.** Following the same pattern
  `coach_financial_settings` already uses on `apps/web/src/app/admin/profile/page.tsx`,
  the settings page fetches `coach_pricing_policies` (joined with
  `coach_pricing_rules`) and `coach_pricing_settings` directly via the browser
  Supabase client — RLS's `cpp_coach_manage_own`/`cps_coach_manage_own`
  policies (OR'd with the blanket tenant policy) allow a coach to read their
  own rows with no service-role endpoint needed.

`coach_student_pricing_overrides` has no route yet — it ships alongside its
editor UI in the fast-follow described above.

## UI

`apps/web/src/components/PaymentPricingStep.tsx` — a controlled component
(parent owns state via `useState`, passes `value`/`onChange`; no
react-hook-form/zod-on-client, consistent with the rest of the app) reused in
two places:

1. **`CoachOnboardingWizard.tsx` Step 4** ("Payment & Pricing", between
   Documents and Account Security — inserted as the wizard's 6th step,
   renumbering Account Security → 5 and Review → 6). Shown for both
   `isAdminMode` and self-registration — student pricing is the coach's own
   call either way, not an HR decision. (The admin-only "Salary & Payroll"
   block that previously lived on Step 2 — `coach_financial_settings`
   payroll fields — has since been removed from onboarding entirely; that
   table still exists and defaults to `Fixed Monthly` / ₹0, configured
   elsewhere post-onboarding rather than during signup.)
   Monthly Subscription, Per Class, and Trial Session are enabled by default
   when a coach reaches this step (`DEFAULT_ENABLED_POLICIES` in
   `PaymentPricingStep.tsx`) — the rest stay off until toggled on.
2. **`apps/web/src/app/admin/profile/page.tsx`** — a "Payment & Pricing"
   section alongside the existing `coach_financial_settings` load, so a coach
   can edit pricing anytime after onboarding.

Toggle rows for the six Phase 1 policies plus a locked "Revenue Share — Coming
Soon (Phase 2)" row (communicates the full model lineup without implying it's
usable yet), a "Default Pricing for New Students" radio, and a "Custom
Pricing" checkbox (with a note that the actual per-student override list is
managed later, once students are enrolled — not during onboarding, since a
brand-new coach has no students yet). See the mockup and full model-by-model
spec (description, worked example, config fields) in the implementation plan
this module was built from.

## Related docs

- `docs/system_architecture.md` — Database section links back here
- `docs/feature_plan.md` — Admin capabilities section links back here
- `supabase/migrations/0005_coach_module.sql` — the separate, unrelated coach
  payroll schema (`coach_financial_settings`/`coach_payouts`)
