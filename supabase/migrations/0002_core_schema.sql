-- ============================================================
-- MIGRATION: 0002_core_schema.sql
-- Abhyas — Tables, relationships, constraints (final shape)
-- ============================================================
-- Tables are ordered by dependency (parent before child) so this file
-- runs top-to-bottom with no forward references. FK ON DELETE policy
-- is applied consistently across the whole schema:
--   - "ownership" FKs (tenant_id, coach_id, student_id, batch_id, ...)
--     use CASCADE — deleting the parent removes its dependents.
--   - "actor" FKs (who performed/approved/verified an action) use
--     SET NULL — deleting a user should never be silently blocked by
--     an unrelated historical record they once touched.
-- Partial and expression unique indexes (e.g. "at most one primary
-- category per coach") live in 0003_indexes.sql, since Postgres unique
-- table constraints can't carry a WHERE clause.
-- ============================================================

-- ================================================================
-- 1. tenants — one row per institute / coaching center / academy
-- ================================================================
CREATE TABLE public.tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    slug                VARCHAR(100) UNIQUE NOT NULL,
    domain              VARCHAR(100) UNIQUE,
    subscription_status VARCHAR(50)  NOT NULL DEFAULT 'trial'
                            CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
    logo_url            TEXT,
    country             VARCHAR(100) DEFAULT 'India',
    state               VARCHAR(100) DEFAULT 'Telangana',
    city                VARCHAR(100) DEFAULT 'Hyderabad',
    address             TEXT,
    email               VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 2. permissions — global RBAC permission catalogue (module/action)
-- ================================================================
CREATE TABLE public.permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module      VARCHAR(100) NOT NULL,
    action      VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (module, action)
);

-- ================================================================
-- 3. roles — tenant_id NULL = global/system role (Admin, Coach, ...),
-- visible to every tenant. Non-null scopes a custom role to one tenant.
-- ================================================================
CREATE TABLE public.roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (tenant_id, name)
);

-- ================================================================
-- 4. role_permissions — join: which permissions a role grants
-- ================================================================
CREATE TABLE public.role_permissions (
    role_id       UUID NOT NULL REFERENCES public.roles(id)       ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ================================================================
-- 5. users — 1:1 with Supabase auth.users via shared UUID.
-- email is intentionally NOT unique: the same email may be reused
-- across multiple rows (e.g. a parent and student sharing an inbox).
-- role is the coarse enum mirrored into the JWT app_metadata and used
-- by every RLS policy; role_id is the finer-grained custom-RBAC role.
-- ================================================================
CREATE TABLE public.users (
    id                       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id                UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    role_id                  UUID         REFERENCES public.roles(id) ON DELETE SET NULL,
    email                    VARCHAR(255) NOT NULL,
    role                     VARCHAR(50)  NOT NULL
                                 CHECK (role IN ('superadmin', 'admin', 'student', 'parent', 'coach')),
    first_name               VARCHAR(100) NOT NULL,
    last_name                VARCHAR(100) NOT NULL,
    phone                    VARCHAR(20),
    alternate_phone          VARCHAR(20),
    avatar_url               TEXT,
    is_active                BOOLEAN      NOT NULL DEFAULT true,
    available_roles          VARCHAR(50)[] NOT NULL DEFAULT '{}'
                                 CHECK (available_roles <@ ARRAY['superadmin', 'admin', 'student', 'parent', 'coach']::VARCHAR(50)[]),
    notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "whatsapp": false, "attendance_reminders": true, "announcement_alerts": true}'::jsonb,
    last_login               TIMESTAMPTZ,
    login_device             TEXT,
    expo_push_token          VARCHAR(255),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 6. classes — a subject/discipline offered by the tenant
-- ================================================================
CREATE TABLE public.classes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

-- ================================================================
-- 7. batches — a scheduled time-slot for a class.
-- days_of_week: 1=Monday … 7=Sunday (ISO weekday)
-- ================================================================
CREATE TABLE public.batches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    class_id     UUID         NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    start_time   TIME         NOT NULL,
    end_time     TIME         NOT NULL,
    days_of_week SMALLINT[]   NOT NULL CHECK (days_of_week <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]),
    max_capacity INTEGER      NOT NULL DEFAULT 50,
    is_active    BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- ================================================================
-- 8. students — extended profile for users with role = 'student'
-- ================================================================
CREATE TABLE public.students (
    id                UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id         UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    batch_id          UUID         REFERENCES public.batches(id) ON DELETE SET NULL,
    student_custom_id VARCHAR(50)  NOT NULL,
    date_of_birth     DATE         NOT NULL,
    joining_date      DATE         NOT NULL DEFAULT CURRENT_DATE,
    address           TEXT,
    emergency_contact VARCHAR(20),
    status            VARCHAR(50)  NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, student_custom_id)
);

-- ================================================================
-- 9. parents — extended profile for users with role = 'parent'
-- ================================================================
CREATE TABLE public.parents (
    id         UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id  UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 10. parent_student_map — many-to-many: a parent may have multiple
-- children; a student may have mother + father both linked
-- ================================================================
CREATE TABLE public.parent_student_map (
    parent_id    UUID        NOT NULL REFERENCES public.parents(id)  ON DELETE CASCADE,
    student_id   UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    relationship VARCHAR(50) NOT NULL DEFAULT 'parent'
                     CHECK (relationship IN ('father', 'mother', 'guardian', 'parent')),
    PRIMARY KEY (parent_id, student_id)
);

-- ================================================================
-- 11. student_face_samples — one row per enrolled face photo.
-- embedding: 128-dim vector computed client-side (face-api.js / TF.js).
-- Multiple samples per student improve match accuracy (label is
-- free-text on purpose — not restricted to canonical angles).
-- ================================================================
CREATE TABLE public.student_face_samples (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    tenant_id   UUID        NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
    photo_url   TEXT        NOT NULL,
    embedding   vector(128) NOT NULL,
    label       VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 12. attendance_logs — one row per student per batch per date
-- ================================================================
CREATE TABLE public.attendance_logs (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID        NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
    student_id        UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    batch_id          UUID        NOT NULL REFERENCES public.batches(id)  ON DELETE CASCADE,
    date              DATE        NOT NULL DEFAULT CURRENT_DATE,
    check_in          TIMESTAMPTZ,
    status            VARCHAR(50) NOT NULL
                          CHECK (status IN ('present', 'late', 'absent')),
    verification_mode VARCHAR(50) NOT NULL
                          CHECK (verification_mode IN ('face_live', 'face_photo', 'manual')),
    confidence_score  NUMERIC(5,2),
    verified_by       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, batch_id, date)
);

-- ================================================================
-- 13. tenant_settings — one row per tenant; fine rules and calendar
-- ================================================================
CREATE TABLE public.tenant_settings (
    tenant_id               UUID          PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    absent_fine_rule_1      NUMERIC(10,2) NOT NULL DEFAULT 1000.00,
    absent_fine_rule_1_days INTEGER       NOT NULL DEFAULT 4,
    absent_fine_rule_2      NUMERIC(10,2) NOT NULL DEFAULT 2000.00,
    late_threshold_minutes  INTEGER       NOT NULL DEFAULT 5,
    grace_period_minutes    INTEGER       NOT NULL DEFAULT 0,
    currency                VARCHAR(10)   NOT NULL DEFAULT 'INR',
    holidays                DATE[]        NOT NULL DEFAULT '{}',
    weekends                SMALLINT[]    NOT NULL DEFAULT '{6,7}'
                                 CHECK (weekends <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]),
    auto_fine_enabled       BOOLEAN       NOT NULL DEFAULT true,
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ================================================================
-- 14. fines — auto-generated or manual fine records, with
-- payment-proof upload support
-- ================================================================
CREATE TABLE public.fines (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID          NOT NULL REFERENCES public.tenants(id)        ON DELETE CASCADE,
    student_id         UUID          NOT NULL REFERENCES public.students(id)       ON DELETE CASCADE,
    attendance_log_id  UUID          REFERENCES public.attendance_logs(id)         ON DELETE SET NULL,
    amount             NUMERIC(10,2) NOT NULL,
    reason             TEXT          NOT NULL,
    status             VARCHAR(50)   NOT NULL DEFAULT 'unpaid'
                            CHECK (status IN ('unpaid', 'pending_verification', 'paid', 'waived')),
    issued_date        DATE          NOT NULL DEFAULT CURRENT_DATE,
    paid_date          TIMESTAMPTZ,
    waived_by          UUID          REFERENCES public.users(id) ON DELETE SET NULL,
    waive_reason       TEXT,
    payment_proof_url  TEXT,
    transaction_id     VARCHAR(100),
    payment_method     VARCHAR(50)   CHECK (payment_method IN ('upi', 'bank_transfer', 'cash')),
    rejection_reason   TEXT,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ================================================================
-- 15. group_attendance_photos — one reference photo per batch/day,
-- used alongside per-student face matching
-- ================================================================
CREATE TABLE public.group_attendance_photos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    batch_id    UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    photo_url   TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 16. student_join_requests — a student requesting to join a batch
-- ================================================================
CREATE TABLE public.student_join_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    batch_id    UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    remark      TEXT,
    status      VARCHAR(50) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 17. student_removals — audit trail of a student being removed
-- from a batch
-- ================================================================
CREATE TABLE public.student_removals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    batch_id    UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    remark      TEXT,
    removed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 18. audit_logs — general admin/governance action trail
-- ================================================================
CREATE TABLE public.audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 19. coaches — extended profile for users with role = 'coach'.
-- No free-text primary_skill/specialization column: that data lives
-- entirely in the category/subcategory/tag taxonomy (tables 31-35)
-- via coach_categories and coach_tags.
-- ================================================================
CREATE TABLE public.coaches (
    id                      UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- Professional info
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
    joining_date            DATE NOT NULL DEFAULT CURRENT_DATE,
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
    employee_id                      VARCHAR(50),   -- auto-generated COACH<seq> if not supplied — see trigger
    designation                      VARCHAR(100),
    department                       VARCHAR(100),
    employee_type                    VARCHAR(50),
    gender                           VARCHAR(20),
    date_of_birth                    DATE,
    address                          TEXT,
    emergency_contact_name           VARCHAR(100),
    emergency_contact_relationship   VARCHAR(50),
    emergency_contact_phone          VARCHAR(20),
    emergency_contact_address        TEXT,

    -- Status & approvals — full lifecycle taxonomy
    account_status           VARCHAR(50) NOT NULL DEFAULT 'Onboarding'
                                CHECK (account_status IN (
                                    'Onboarding', 'Document Upload Pending', 'Pending Verification',
                                    'Active', 'Inactive', 'On Leave', 'Terminated',
                                    'Rejected', 'Paused', 'Suspended', 'Archived'
                                )),
    status_reason             TEXT,   -- reason for the current Reject/Pause/Suspend/Archive; cleared on reactivation
    document_request_note     TEXT,   -- "Request Documents" admin action (logged in-app only)
    document_request_at       TIMESTAMPTZ,

    -- SEO / marketing
    public_profile_slug     VARCHAR(150) UNIQUE,
    achievements             TEXT[] NOT NULL DEFAULT '{}',
    gallery_urls              TEXT[] NOT NULL DEFAULT '{}',

    -- Cached stats for fast Discovery rendering
    avg_rating                NUMERIC(3,2) DEFAULT 0.00 CHECK (avg_rating BETWEEN 0.00 AND 5.00),
    retention_rate             NUMERIC(5,2) DEFAULT 0.00,
    conversion_rate             NUMERIC(5,2) DEFAULT 0.00,
    satisfaction_score           NUMERIC(5,2) DEFAULT 0.00,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 20. coach_documents
-- ================================================================
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

    verified_by              UUID REFERENCES public.users(id) ON DELETE SET NULL,
    verified_at               TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 21. coach_face_data — canonical 3-angle biometric enrollment
-- (front/left/right); one row per angle per coach.
-- ================================================================
CREATE TABLE public.coach_face_data (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    label                   VARCHAR(50) NOT NULL CHECK (label IN ('front', 'left', 'right')),
    photo_url               TEXT NOT NULL,
    embedding               vector(128) NOT NULL,
    confidence_score         NUMERIC(5,2),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, label)
);

-- ================================================================
-- 22. coach_availability
-- ================================================================
CREATE TABLE public.coach_availability (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    day_of_week              SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time                TIME NOT NULL,
    end_time                   TIME NOT NULL,
    is_recurring                BOOLEAN NOT NULL DEFAULT true,

    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_avail_range CHECK (end_time > start_time),
    UNIQUE (coach_id, day_of_week, start_time)
);

-- ================================================================
-- 23. coach_leaves
-- ================================================================
CREATE TABLE public.coach_leaves (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    leave_type                VARCHAR(100) NOT NULL DEFAULT 'Casual Leave'
                                CHECK (leave_type IN ('Casual Leave', 'Sick Leave', 'Earned Leave')),
    start_date                 DATE NOT NULL,
    end_date                    DATE NOT NULL,
    reason                       TEXT NOT NULL,
    status                        VARCHAR(50) NOT NULL DEFAULT 'Pending'
                                    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    admin_comment                  TEXT,
    approved_by                     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_leave_range CHECK (end_date >= start_date)
);

-- ================================================================
-- 24. coach_financial_settings — how the ACADEMY pays the COACH
-- (distinct from coach_pricing_* below, which governs how STUDENTS
-- pay for coaching)
-- ================================================================
CREATE TABLE public.coach_financial_settings (
    coach_id                UUID PRIMARY KEY REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    salary_type               VARCHAR(50) NOT NULL DEFAULT 'Fixed Monthly'
                                CHECK (salary_type IN ('Fixed Monthly', 'Per Class', 'Revenue Share', 'Hybrid')),

    fixed_salary               NUMERIC(10,2) DEFAULT 0.00 CHECK (fixed_salary >= 0.00),
    per_class_rate               NUMERIC(10,2) DEFAULT 0.00 CHECK (per_class_rate >= 0.00),
    revenue_share_pct             NUMERIC(5,2) DEFAULT 0.00 CHECK (revenue_share_pct BETWEEN 0.00 AND 100.00),

    bank_account_holder_name       VARCHAR(150),
    bank_account_number             VARCHAR(100),
    bank_ifsc_code                    VARCHAR(50),
    bank_name                          VARCHAR(150),
    upi_id                               VARCHAR(100),
    pan_number                            VARCHAR(50),

    created_at                            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 25. coach_payouts
-- ================================================================
CREATE TABLE public.coach_payouts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    period_start              DATE NOT NULL,
    period_end                 DATE NOT NULL,

    base_salary_earned          NUMERIC(10,2) DEFAULT 0.00,
    class_sessions_conducted     INTEGER DEFAULT 0,
    class_rate_earned             NUMERIC(10,2) DEFAULT 0.00,
    revenue_share_earned           NUMERIC(10,2) DEFAULT 0.00,
    incentives                       NUMERIC(10,2) DEFAULT 0.00,
    deductions                        NUMERIC(10,2) DEFAULT 0.00,
    net_payout                         NUMERIC(10,2) NOT NULL CHECK (net_payout >= 0.00),

    status                               VARCHAR(50) NOT NULL DEFAULT 'Draft'
                                            CHECK (status IN ('Draft', 'Processing', 'Paid', 'Cancelled')),
    paid_at                               TIMESTAMPTZ,
    transaction_reference                   VARCHAR(150),

    created_at                             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_payout_period CHECK (period_end >= period_start)
);

-- ================================================================
-- 26. coach_reviews
-- ================================================================
CREATE TABLE public.coach_reviews (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    rated_by                  UUID REFERENCES public.users(id) ON DELETE SET NULL,

    discipline                 INTEGER NOT NULL CHECK (discipline BETWEEN 1 AND 5),
    communication                INTEGER NOT NULL CHECK (communication BETWEEN 1 AND 5),
    student_feedback               INTEGER NOT NULL CHECK (student_feedback BETWEEN 1 AND 5),
    attendance                       INTEGER NOT NULL CHECK (attendance BETWEEN 1 AND 5),
    teaching_quality                   INTEGER NOT NULL CHECK (teaching_quality BETWEEN 1 AND 5),
    professionalism                      INTEGER NOT NULL CHECK (professionalism BETWEEN 1 AND 5),
    overall_rating                         NUMERIC(3,2) NOT NULL,

    review_period                           VARCHAR(50) NOT NULL,
    comments                                  TEXT,
    created_at                                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 27. coach_attendance
-- ================================================================
CREATE TABLE public.coach_attendance (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id                UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    date                       DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in                     TIMESTAMPTZ,
    check_out                      TIMESTAMPTZ,
    status                           VARCHAR(50) NOT NULL DEFAULT 'absent'
                                        CHECK (status IN ('present', 'late', 'absent', 'on_leave', 'holiday')),
    method                             VARCHAR(50) CHECK (method IN ('face_recognition', 'qr_code', 'manual', 'geofenced')),
    confidence_score                    NUMERIC(5,2),
    geo_lat                              NUMERIC(10,8),
    geo_lng                               NUMERIC(11,8),
    verified_by                            UUID REFERENCES public.users(id) ON DELETE SET NULL,
    notes                                    TEXT,

    created_at                              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, date)
);

-- ================================================================
-- 28. coach_audit_logs — coach-lifecycle action trail (distinct from
-- the general audit_logs table, which covers admin/governance actions)
-- ================================================================
CREATE TABLE public.coach_audit_logs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    actor_id                  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    coach_id                    UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,

    action_type                  VARCHAR(100) NOT NULL,
    description                    TEXT NOT NULL,
    ip_address                       VARCHAR(50),
    device_info                        TEXT,
    meta_data                            JSONB,

    created_at                            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 29. coach_batch_assignments — which coaches run which batches, with
-- a request/approve flow. coach_id references coaches(id), consistent
-- with every other coach_* table (previously pointed at users(id) —
-- fixed after confirming every role='coach' user now always has a
-- coaches row created atomically with it; see 0005 for the RLS side
-- of this, which is unaffected since coaches.id = users.id 1:1).
-- ================================================================
CREATE TABLE public.coach_batch_assignments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    coach_id                  UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    batch_id                    UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    status                        TEXT NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'approved', 'rejected')),
    assigned_days                  INTEGER[],
    requested_by                     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    approved_by                        UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at                           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, batch_id)
);

-- ================================================================
-- 30. coach_notes — admin-only internal notes on a coach
-- ================================================================
CREATE TABLE public.coach_notes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id    UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    author_id   UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
    note        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 31. categories — Discovery top-level domains (Sports, Music, ...).
-- Platform-wide (not tenant-scoped) so Discovery filtering and Coach
-- onboarding tagging share the same structured vocabulary.
-- ================================================================
CREATE TABLE public.categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    icon            VARCHAR(10),
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 32. subcategories — leaf specialties under a category. For
-- Academic/Tuition these are grade-bands, not raw subjects.
-- ================================================================
CREATE TABLE public.subcategories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    slug            VARCHAR(150) NOT NULL UNIQUE,
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category_id, name)
);

-- ================================================================
-- 33. tags — cross-cutting attributes (board/subject/stream/exam)
-- layered on top of a subcategory. subcategory_id NULL = applies
-- broadly (e.g. Board tags apply across every Academic grade-band).
-- ================================================================
CREATE TABLE public.tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subcategory_id  UUID REFERENCES public.subcategories(id) ON DELETE CASCADE,
    tag_type        VARCHAR(20) NOT NULL CHECK (tag_type IN ('subject', 'board', 'stream', 'exam')),
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 34. coach_categories — which subcategories a coach teaches, one primary
-- ================================================================
CREATE TABLE public.coach_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id        UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    subcategory_id  UUID NOT NULL REFERENCES public.subcategories(id) ON DELETE CASCADE,
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, subcategory_id)
);

-- ================================================================
-- 35. coach_tags — which tags (board/subject/stream/exam) apply
-- ================================================================
CREATE TABLE public.coach_tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id        UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tag_id          UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, tag_id)
);

-- ================================================================
-- 36. service_areas — Tier 1: small, stable, seeded list of Hyderabad
-- localities with lat/lng to anchor Places Autocomplete. Curated,
-- never coach-editable.
-- ================================================================
CREATE TABLE public.service_areas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    city            VARCHAR(100) NOT NULL DEFAULT 'Hyderabad',
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    lat             NUMERIC(9, 6),
    lng             NUMERIC(9, 6),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 37. service_communities — Tier 2: dynamic, coach-grown list of
-- residential communities, scoped to one service area.
-- google_place_id is the primary dedup key once resolved via Places
-- Autocomplete; nullable for the manual-entry fallback (deduped
-- best-effort by (area_id, name) in the API layer for that path).
-- ================================================================
CREATE TABLE public.service_communities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id             UUID NOT NULL REFERENCES public.service_areas(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    google_place_id     VARCHAR(255),
    lat                 NUMERIC(9, 6),
    lng                 NUMERIC(9, 6),
    formatted_address   TEXT,
    created_by_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 38. coach_service_areas
-- ================================================================
CREATE TABLE public.coach_service_areas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id    UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    area_id     UUID NOT NULL REFERENCES public.service_areas(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, area_id)
);

-- ================================================================
-- 39. coach_service_communities
-- ================================================================
CREATE TABLE public.coach_service_communities (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id       UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    community_id   UUID NOT NULL REFERENCES public.service_communities(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, community_id)
);

-- ================================================================
-- 40. coach_pricing_policies — one row per pricing model a coach has
-- enabled (not mutually exclusive). How STUDENTS pay for coaching —
-- distinct from coach_financial_settings/coach_payouts above, which
-- govern how the ACADEMY pays the COACH.
-- ================================================================
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
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (coach_id, policy_type)
);

-- ================================================================
-- 41. coach_pricing_rules — configurable fields for a policy. One row
-- for monthly/per-class/trial/registration/fine-based; many rows (one
-- per tier) for package.
-- ================================================================
CREATE TABLE public.coach_pricing_rules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id               UUID NOT NULL REFERENCES public.coach_pricing_policies(id) ON DELETE CASCADE,

    amount                   NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0.00),
    currency                 VARCHAR(10) NOT NULL DEFAULT 'INR',

    -- Monthly Subscription
    billing_cycle             VARCHAR(20) CHECK (billing_cycle IN ('Weekly', 'Monthly', 'Quarterly', 'Yearly')),
    auto_renew                 BOOLEAN,
    late_fee_amount             NUMERIC(10,2) CHECK (late_fee_amount >= 0.00),        -- late *payment* penalty
    late_fee_grace_days         INTEGER CHECK (late_fee_grace_days >= 0),

    -- Per Class
    cancellation_window_hours    INTEGER CHECK (cancellation_window_hours >= 0),
    min_booking_count             INTEGER CHECK (min_booking_count >= 1),

    -- Class Packages
    class_count                    INTEGER CHECK (class_count >= 1),
    sort_order                      INTEGER NOT NULL DEFAULT 0,

    -- Trial Session
    trial_type                       VARCHAR(20) CHECK (trial_type IN ('free', 'paid')),

    -- Fine-Based (Attendance-Linked) — late *arrival*/absence penalty,
    -- distinct from late_fee_amount above (late bill payment)
    late_arrival_fee_amount            NUMERIC(10,2) CHECK (late_arrival_fee_amount >= 0.00),
    late_arrival_threshold_minutes      INTEGER CHECK (late_arrival_threshold_minutes >= 0),
    absence_fee_amount                   NUMERIC(10,2) CHECK (absence_fee_amount >= 0.00),

    created_at                            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 42. coach_pricing_settings — 1:1 with coach
-- ================================================================
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
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 43. coach_student_pricing_overrides — per-student pricing exception
-- ================================================================
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
    created_by                     UUID REFERENCES public.users(id) ON DELETE SET NULL,

    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_override_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
