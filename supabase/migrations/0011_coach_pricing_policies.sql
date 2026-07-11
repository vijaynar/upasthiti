-- =========================================================================
-- MIGRATION: 0011_coach_pricing_policies.sql
-- Abhyas — Coach Pricing & Payment Policy Engine (Phase 1)
-- =========================================================================
-- How STUDENTS pay for coaching — distinct from coach_financial_settings /
-- coach_payouts (0005_coach_module.sql), which govern how the ACADEMY pays
-- the COACH. A coach may enable any combination of pricing policies at once
-- (not mutually exclusive): monthly subscription, per-class, class packages,
-- trial session, fine-based/attendance-linked, and one-time registration.
--
-- Revenue Share and platform commission are intentionally NOT part of this
-- migration — they depend on a real payment gateway/account (none exists in
-- this codebase yet) and ship in a later Phase 2 migration.
-- =========================================================================

-- 1. coach_pricing_policies ---------------------------------------------------
-- One row per pricing model a coach has enabled.
CREATE TABLE public.coach_pricing_policies (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,

    policy_type             VARCHAR(50) NOT NULL
                                CHECK (policy_type IN (
                                    'monthly_subscription', 'per_class', 'package',
                                    'trial_session', 'fine_based', 'one_time_registration'
                                )),
    enabled                 BOOLEAN NOT NULL DEFAULT true,
    is_default               BOOLEAN NOT NULL DEFAULT false,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one default policy per coach.
CREATE UNIQUE INDEX idx_coach_pricing_policies_one_default
    ON public.coach_pricing_policies(coach_id) WHERE is_default;

-- 2. coach_pricing_rules -------------------------------------------------------
-- Configurable fields for a policy. One row for monthly/per-class/trial/
-- registration/fine-based; many rows (one per tier) for package.
CREATE TABLE public.coach_pricing_rules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id               UUID NOT NULL REFERENCES public.coach_pricing_policies(id) ON DELETE CASCADE,

    amount                   NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0.00),
    currency                 VARCHAR(10) NOT NULL DEFAULT 'INR',

    -- Monthly Subscription
    billing_cycle             VARCHAR(20) CHECK (billing_cycle IN ('Weekly', 'Monthly', 'Quarterly', 'Yearly')),
    auto_renew                 BOOLEAN,
    late_fee_amount             NUMERIC(10,2) CHECK (late_fee_amount >= 0.00),      -- late *payment* penalty
    late_fee_grace_days         INTEGER CHECK (late_fee_grace_days >= 0),

    -- Per Class
    cancellation_window_hours    INTEGER CHECK (cancellation_window_hours >= 0),
    min_booking_count             INTEGER CHECK (min_booking_count >= 1),

    -- Class Packages
    class_count                    INTEGER CHECK (class_count >= 1),
    sort_order                      INTEGER NOT NULL DEFAULT 0,

    -- Trial Session
    trial_type                       VARCHAR(20) CHECK (trial_type IN ('free', 'paid')),

    -- Fine-Based (Attendance-Linked) — late *arrival*/absence penalty, distinct
    -- from late_fee_amount above (which is about late bill payment)
    late_arrival_fee_amount            NUMERIC(10,2) CHECK (late_arrival_fee_amount >= 0.00),
    late_arrival_threshold_minutes      INTEGER CHECK (late_arrival_threshold_minutes >= 0),
    absence_fee_amount                   NUMERIC(10,2) CHECK (absence_fee_amount >= 0.00),

    created_at                            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. coach_pricing_settings ----------------------------------------------------
-- 1:1 with coach — mirrors coach_financial_settings' 1:1 pattern.
CREATE TABLE public.coach_pricing_settings (
    coach_id                UUID PRIMARY KEY REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    default_policy_type       VARCHAR(50)
                                CHECK (default_policy_type IN (
                                    'monthly_subscription', 'per_class', 'package',
                                    'trial_session', 'fine_based', 'one_time_registration'
                                )),
    allow_student_overrides    BOOLEAN NOT NULL DEFAULT false,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. coach_student_pricing_overrides -------------------------------------------
-- Schema ships now; the per-student editor UI is a fast-follow (needs a real
-- enrolled-student list to attach to).
CREATE TABLE public.coach_student_pricing_overrides (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    student_id              UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

    override_type            VARCHAR(50) NOT NULL
                                CHECK (override_type IN (
                                    'monthly_subscription', 'per_class', 'package', 'trial_session',
                                    'fine_based', 'one_time_registration', 'scholarship', 'custom'
                                )),
    override_amount           NUMERIC(10,2) NOT NULL CHECK (override_amount >= 0.00),
    class_count                INTEGER CHECK (class_count >= 1),
    reason                      TEXT,

    effective_from               DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to                  DATE,
    created_by                     UUID REFERENCES public.users(id),

    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_override_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Only one *active* override per student at a time.
CREATE UNIQUE INDEX idx_coach_student_overrides_active
    ON public.coach_student_pricing_overrides(coach_id, student_id) WHERE effective_to IS NULL;

-- 5. Indexes --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_coach_pricing_policies_coach ON public.coach_pricing_policies(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_pricing_rules_policy ON public.coach_pricing_rules(policy_id);
CREATE INDEX IF NOT EXISTS idx_coach_student_overrides_student ON public.coach_student_pricing_overrides(student_id);

-- 6. Triggers for update_updated_at_column ---------------------------------------
CREATE TRIGGER trg_coach_pricing_policies_updated_at BEFORE UPDATE ON public.coach_pricing_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_coach_pricing_rules_updated_at BEFORE UPDATE ON public.coach_pricing_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_coach_pricing_settings_updated_at BEFORE UPDATE ON public.coach_pricing_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_coach_student_pricing_overrides_updated_at BEFORE UPDATE ON public.coach_student_pricing_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Row Level Security -----------------------------------------------------------
ALTER TABLE public.coach_pricing_policies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_pricing_rules                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_pricing_settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_student_pricing_overrides     ENABLE ROW LEVEL SECURITY;

-- Blanket tenant isolation on all four tables.
CREATE POLICY "tenant_isolation_policy" ON public.coach_pricing_policies
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON public.coach_pricing_settings
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON public.coach_student_pricing_overrides
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

-- coach_pricing_rules has no tenant_id of its own — isolate via its parent policy.
CREATE POLICY "tenant_isolation_via_policy" ON public.coach_pricing_rules
    FOR ALL USING (
        policy_id IN (
            SELECT id FROM public.coach_pricing_policies
            WHERE tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')
        )
    )
    WITH CHECK (
        policy_id IN (
            SELECT id FROM public.coach_pricing_policies
            WHERE tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id')
        )
    );

-- Role-scoped policies: a coach manages their own pricing; admins/superadmins
-- manage everyone's in-tenant. Reuses the ('payments','manage')/('payments','view')
-- RBAC permission stubs seeded in 0009_governance_rbac.sql — provisioned ahead
-- of exactly this feature.
CREATE POLICY "cpp_admin_all" ON public.coach_pricing_policies
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "cpp_coach_manage_own" ON public.coach_pricing_policies
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND coach_id = auth.uid())
    WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

CREATE POLICY "cps_admin_all" ON public.coach_pricing_settings
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "cps_coach_manage_own" ON public.coach_pricing_settings
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND coach_id = auth.uid())
    WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

CREATE POLICY "cspo_admin_all" ON public.coach_student_pricing_overrides
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "cspo_coach_manage_own" ON public.coach_student_pricing_overrides
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND coach_id = auth.uid())
    WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

-- A student may read their own active pricing override (so a student-facing
-- billing screen can show "you're on a scholarship rate" later).
CREATE POLICY "cspo_student_self_select" ON public.coach_student_pricing_overrides
    FOR SELECT
    USING (student_id = auth.uid());
