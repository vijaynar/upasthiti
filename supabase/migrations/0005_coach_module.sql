-- =========================================================================
-- MIGRATION: 0005_coach_module.sql
-- Abhyas — Coach Management Module Schema
-- =========================================================================
-- Consolidated: 'coaches' never carries a 'primary_skill' or 'specialization'
-- free-text column in this baseline — that data now lives entirely in the
-- category/subcategory/tag taxonomy (0006/0007) via coach_categories and
-- coach_tags. Earlier iterations added those columns and later dropped
-- them; the final shape (no legacy column at all) is what's captured here.
-- =========================================================================

-- 1. coaches ----------------------------------------------------------------
CREATE TABLE public.coaches (
    id                      UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- Professional Info
    experience_years        INTEGER NOT NULL CHECK (experience_years >= 0),
    service_types           VARCHAR(50)[] NOT NULL DEFAULT '{Offline}'
                                CHECK (service_types <@ ARRAY[
                                    'Online', 'Offline', 'Hybrid',
                                    'Personal Training', 'Group Training',
                                    'Online Coaching', 'Offline Coaching'
                                ]::VARCHAR(50)[]),
    class_types             VARCHAR(50)[] NOT NULL DEFAULT '{Group Classes}'
                                CHECK (class_types <@ ARRAY[
                                    'One-to-One', 'Group Classes', 'Regular Classes',
                                    'Crash Course', 'Tournament Coaching', 'Summer Camp'
                                ]::VARCHAR(50)[]),
    languages_known         VARCHAR(50)[] NOT NULL DEFAULT '{English}',
    qualification           TEXT,
    certifications_summary  TEXT,
    joining_date             DATE NOT NULL DEFAULT CURRENT_DATE,
    bio                     TEXT,

    -- Discovery filter metadata
    age_groups               VARCHAR(20)[] NOT NULL DEFAULT '{}'
                                CHECK (age_groups <@ ARRAY['Kids', 'Teens', 'Adults']::VARCHAR(20)[]),
    skill_levels              VARCHAR(20)[] NOT NULL DEFAULT '{}'
                                CHECK (skill_levels <@ ARRAY['Beginner', 'Intermediate', 'Advanced']::VARCHAR(20)[]),

    -- Location constraints
    country                 VARCHAR(100) DEFAULT 'India',
    state                   VARCHAR(100),
    city                    VARCHAR(100),
    area                    VARCHAR(200),

    -- Employment / HR profile
    employee_id                      VARCHAR(50),                 -- auto-generated: COACH<seq>, see trigger below
    designation                      VARCHAR(100),
    department                       VARCHAR(100),
    employee_type                    VARCHAR(50),
    working_days                     VARCHAR(100),
    gender                           VARCHAR(20),
    date_of_birth                    DATE,
    address                          TEXT,
    emergency_contact_name           VARCHAR(100),
    emergency_contact_relationship   VARCHAR(50),
    emergency_contact_phone          VARCHAR(20),
    emergency_contact_address        TEXT,

    -- Status & Approvals
    account_status           VARCHAR(50) NOT NULL DEFAULT 'Onboarding'
                                CHECK (account_status IN (
                                    'Onboarding', 'Document Upload Pending', 'Pending Verification',
                                    'Active', 'Inactive', 'On Leave', 'Terminated'
                                )),

    -- SEO / Marketing
    public_profile_slug     VARCHAR(150) UNIQUE,
    achievements            TEXT[] NOT NULL DEFAULT '{}',
    gallery_urls             TEXT[] NOT NULL DEFAULT '{}',

    -- Cached Stats for high performance
    avg_rating               NUMERIC(3,2) DEFAULT 0.00 CHECK (avg_rating BETWEEN 0.00 AND 5.00),
    retention_rate           NUMERIC(5,2) DEFAULT 0.00,
    conversion_rate          NUMERIC(5,2) DEFAULT 0.00,
    satisfaction_score       NUMERIC(5,2) DEFAULT 0.00,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generated employee IDs: COACH1, COACH2, ... (only when not supplied).
CREATE SEQUENCE public.coach_employee_id_seq;

CREATE OR REPLACE FUNCTION public.generate_coach_employee_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.employee_id IS NULL OR NEW.employee_id = '' THEN
        NEW.employee_id := 'COACH' || nextval('coach_employee_id_seq');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_coaches_employee_id
    BEFORE INSERT ON public.coaches
    FOR EACH ROW EXECUTE FUNCTION public.generate_coach_employee_id();

-- 2. coach_documents ----------------------------------------------------------
CREATE TABLE public.coach_documents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    document_type           VARCHAR(100) NOT NULL
                                CHECK (document_type IN ('Government ID', 'Resume', 'Employment Contract', 'Certification', 'Other')),
    document_name           VARCHAR(255) NOT NULL,
    file_url                TEXT NOT NULL,
    expiry_date              DATE,

    verification_status      VARCHAR(50) NOT NULL DEFAULT 'Pending'
                                CHECK (verification_status IN ('Pending', 'Verified', 'Rejected')),
    rejection_reason         TEXT,

    verified_by              UUID REFERENCES public.users(id),
    verified_at               TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. coach_face_data ------------------------------------------------------------
CREATE TABLE public.coach_face_data (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    label                   VARCHAR(50) NOT NULL CHECK (label IN ('front', 'left', 'right')),
    photo_url               TEXT NOT NULL,
    embedding               vector(128) NOT NULL,
    confidence_score         NUMERIC(5,2),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. coach_availability -------------------------------------------------------
CREATE TABLE public.coach_availability (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    day_of_week              SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1: Mon, 7: Sun
    start_time                TIME NOT NULL,
    end_time                  TIME NOT NULL,
    is_recurring              BOOLEAN NOT NULL DEFAULT true,

    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_avail_range CHECK (end_time > start_time)
);

-- 5. coach_leaves ---------------------------------------------------------------
CREATE TABLE public.coach_leaves (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    leave_type               VARCHAR(100) NOT NULL DEFAULT 'Casual Leave'
                                CHECK (leave_type IN ('Casual Leave', 'Sick Leave', 'Earned Leave')),
    start_date                DATE NOT NULL,
    end_date                  DATE NOT NULL,
    reason                    TEXT NOT NULL,
    status                    VARCHAR(50) NOT NULL DEFAULT 'Pending'
                                CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    admin_comment             TEXT,
    approved_by               UUID REFERENCES public.users(id),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_leave_range CHECK (end_date >= start_date)
);

-- 6. coach_financial_settings --------------------------------------------------
CREATE TABLE public.coach_financial_settings (
    coach_id                UUID PRIMARY KEY REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    salary_type               VARCHAR(50) NOT NULL DEFAULT 'Fixed Monthly'
                                CHECK (salary_type IN ('Fixed Monthly', 'Per Class', 'Revenue Share', 'Hybrid')),

    fixed_salary               NUMERIC(10,2) DEFAULT 0.00 CHECK (fixed_salary >= 0.00),
    per_class_rate              NUMERIC(10,2) DEFAULT 0.00 CHECK (per_class_rate >= 0.00),
    revenue_share_pct           NUMERIC(5,2) DEFAULT 0.00 CHECK (revenue_share_pct BETWEEN 0.00 AND 100.00),

    -- Bank Information
    bank_account_holder_name    VARCHAR(150),
    bank_account_number         VARCHAR(100),
    bank_ifsc_code               VARCHAR(50),
    bank_name                    VARCHAR(150),
    upi_id                        VARCHAR(100),
    pan_number                    VARCHAR(50),

    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. coach_payouts ---------------------------------------------------------------
CREATE TABLE public.coach_payouts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    period_start              DATE NOT NULL,
    period_end                DATE NOT NULL,

    base_salary_earned          NUMERIC(10,2) DEFAULT 0.00,
    class_sessions_conducted    INTEGER DEFAULT 0,
    class_rate_earned           NUMERIC(10,2) DEFAULT 0.00,
    revenue_share_earned        NUMERIC(10,2) DEFAULT 0.00,
    incentives                   NUMERIC(10,2) DEFAULT 0.00,
    deductions                    NUMERIC(10,2) DEFAULT 0.00,
    net_payout                    NUMERIC(10,2) NOT NULL CHECK (net_payout >= 0.00),

    status                        VARCHAR(50) NOT NULL DEFAULT 'Draft'
                                    CHECK (status IN ('Draft', 'Processing', 'Paid', 'Cancelled')),
    paid_at                       TIMESTAMPTZ,
    transaction_reference          VARCHAR(150),

    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. coach_reviews ---------------------------------------------------------------
CREATE TABLE public.coach_reviews (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    rated_by                  UUID REFERENCES public.users(id) ON DELETE SET NULL,

    discipline                 INTEGER NOT NULL CHECK (discipline BETWEEN 1 AND 5),
    communication               INTEGER NOT NULL CHECK (communication BETWEEN 1 AND 5),
    student_feedback             INTEGER NOT NULL CHECK (student_feedback BETWEEN 1 AND 5),
    attendance                   INTEGER NOT NULL CHECK (attendance BETWEEN 1 AND 5),
    teaching_quality              INTEGER NOT NULL CHECK (teaching_quality BETWEEN 1 AND 5),
    professionalism                INTEGER NOT NULL CHECK (professionalism BETWEEN 1 AND 5),
    overall_rating                  NUMERIC(3,2) NOT NULL,

    review_period                    VARCHAR(50) NOT NULL,
    comments                          TEXT,
    created_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. coach_attendance ---------------------------------------------------------------
CREATE TABLE public.coach_attendance (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    date                       DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in                    TIMESTAMPTZ,
    check_out                    TIMESTAMPTZ,
    status                        VARCHAR(50) NOT NULL DEFAULT 'absent'
                                    CHECK (status IN ('present', 'late', 'absent', 'on_leave', 'holiday')),
    method                        VARCHAR(50) CHECK (method IN ('face_recognition', 'qr_code', 'manual', 'geofenced')),
    confidence_score               NUMERIC(5,2),
    geo_lat                        NUMERIC(10,8),
    geo_lng                        NUMERIC(11,8),
    verified_by                    UUID REFERENCES public.users(id),
    notes                           TEXT,

    created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, date)
);

-- 10. coach_audit_logs ---------------------------------------------------------------
CREATE TABLE public.coach_audit_logs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    actor_id                  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    coach_id                  UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,

    action_type                 VARCHAR(100) NOT NULL,
    description                   TEXT NOT NULL,
    ip_address                     VARCHAR(50),
    device_info                     TEXT,
    meta_data                        JSONB,

    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. coach_batch_assignments ----------------------------------------------------
-- Which coaches are assigned to which batches, with a request/approve flow
-- (a coach can request a batch; an admin approves/rejects it).
CREATE TABLE public.coach_batch_assignments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    coach_id                  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    batch_id                    UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    status                        TEXT NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'approved', 'rejected')),
    assigned_days                  INTEGER[],
    requested_by                    UUID REFERENCES public.users(id),
    approved_by                      UUID REFERENCES public.users(id),
    created_at                        TIMESTAMPTZ DEFAULT now(),
    updated_at                        TIMESTAMPTZ DEFAULT now(),
    UNIQUE (coach_id, batch_id)
);

-- 12. Indexes -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_coaches_tenant ON public.coaches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coaches_slug ON public.coaches(public_profile_slug);
CREATE INDEX IF NOT EXISTS idx_coach_docs_unverified ON public.coach_documents(tenant_id, verification_status) WHERE verification_status = 'Pending';
CREATE INDEX IF NOT EXISTS idx_coach_attendance_date ON public.coach_attendance(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_coach_payouts_unpaid ON public.coach_payouts(tenant_id, status) WHERE status IN ('Draft', 'Processing');

-- Face matching vector index (HNSW index for high speed sub-10ms similarity queries)
CREATE INDEX IF NOT EXISTS idx_coach_face_vectors ON public.coach_face_data USING hnsw (embedding vector_cosine_ops);

-- 13. Triggers for update_updated_at_column ------------------------------------------
CREATE TRIGGER trg_coaches_updated_at BEFORE UPDATE ON public.coaches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_coach_docs_updated_at BEFORE UPDATE ON public.coach_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_coach_financials_updated_at BEFORE UPDATE ON public.coach_financial_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_coach_payouts_updated_at BEFORE UPDATE ON public.coach_payouts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_coach_attendance_updated_at BEFORE UPDATE ON public.coach_attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_coach_leaves_updated_at BEFORE UPDATE ON public.coach_leaves FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 14. Row Level Security --------------------------------------------------------------
ALTER TABLE public.coaches                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_face_data            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_availability         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_leaves               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_financial_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_payouts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_reviews              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_attendance           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_batch_assignments    ENABLE ROW LEVEL SECURITY;

-- coaches: tenant-isolated read/write, plus a public-profile carve-out for
-- Discovery pages (any tenant may read a coach who has a published slug).
CREATE POLICY "tenant_isolation_policy" ON public.coaches
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "allow_public_read_coaches" ON public.coaches
    FOR SELECT USING (public_profile_slug IS NOT NULL);

-- All other coach-module tables: tenant-isolated only (no public read —
-- documents, financials, reviews, attendance, and audit trails are
-- internal-only; writes go through the service-role API layer).
CREATE POLICY "tenant_isolation_policy" ON public.coach_documents
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON public.coach_face_data
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON public.coach_availability
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON public.coach_leaves
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON public.coach_financial_settings
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON public.coach_payouts
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON public.coach_reviews
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON public.coach_attendance
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON public.coach_audit_logs
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

-- coach_batch_assignments: admins manage everything in-tenant; a coach can
-- see/request their own assignments; approved assignments are publicly
-- readable (Discovery needs to show which coach runs which batch).
CREATE POLICY "tenant_isolation_policy" ON public.coach_batch_assignments
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "cba_admin_all" ON public.coach_batch_assignments
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "cba_coach_select" ON public.coach_batch_assignments
    FOR SELECT
    USING (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

CREATE POLICY "cba_coach_insert" ON public.coach_batch_assignments
    FOR INSERT
    WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid() AND status = 'pending');

CREATE POLICY "allow_public_read_assignments" ON public.coach_batch_assignments
    FOR SELECT USING (status = 'approved');
