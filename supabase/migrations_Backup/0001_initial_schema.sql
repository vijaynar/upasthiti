-- ============================================================
-- MIGRATION: 0001_initial_schema.sql
-- Abhyas — Core Database Schema
-- ============================================================
-- Run: supabase db reset  (applies all migrations fresh)
--
-- Consolidated baseline: this replaces what used to be 24 separate
-- migration files (many of which added a column in one migration and
-- dropped/renamed it a few migrations later). Every table here reflects
-- the final, current shape of the schema — no intermediate churn.
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";        -- pgvector for face embeddings
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE 1: tenants
-- One row per institute / coaching center / academy
-- ============================================================
CREATE TABLE tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    slug                VARCHAR(100) UNIQUE NOT NULL,          -- URL-safe identifier e.g. "elite-academy"
    domain              VARCHAR(100) UNIQUE,                   -- custom domain if any
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

-- ============================================================
-- TABLE 2: users
-- Linked 1-to-1 with Supabase auth.users via shared UUID.
-- email is intentionally NOT unique — the same email may be reused
-- across multiple user rows (e.g. a parent and student sharing an inbox).
-- role_id is nullable and has no FK yet; the FK to roles(id) is added in
-- 0009_governance_rbac.sql once that table exists.
-- ============================================================
CREATE TABLE users (
    id                       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id                UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email                    VARCHAR(255) NOT NULL,
    role                     VARCHAR(50)  NOT NULL
                                 CHECK (role IN ('superadmin', 'admin', 'student', 'parent', 'coach')),
    role_id                  UUID,                                         -- FK added in 0009 (governance RBAC)
    first_name               VARCHAR(100) NOT NULL,
    last_name                VARCHAR(100) NOT NULL,
    phone                    VARCHAR(20),
    alternate_phone          VARCHAR(20),
    avatar_url               TEXT,
    is_active                BOOLEAN      NOT NULL DEFAULT true,
    available_roles          VARCHAR(50)[] NOT NULL DEFAULT '{}',          -- roles this user can switch between
    notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "whatsapp": false, "attendance_reminders": true, "announcement_alerts": true}'::jsonb,
    last_login               TIMESTAMPTZ,
    login_device             TEXT,
    -- Notification tokens (populated when mobile app registers)
    expo_push_token          VARCHAR(255),                                 -- [LATER] mobile push
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_last_login ON users (last_login DESC);

-- ============================================================
-- TABLE 3: classes
-- A subject / discipline offered by the tenant
-- e.g. "Advanced Swimming", "Intermediate Karate"
-- ============================================================
CREATE TABLE classes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

-- ============================================================
-- TABLE 4: batches
-- A scheduled time-slot for a class
-- days_of_week: 1=Monday … 7=Sunday (ISO weekday)
-- ============================================================
CREATE TABLE batches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID         NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
    class_id     UUID         NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,                        -- e.g. "Morning Batch"
    start_time   TIME         NOT NULL,
    end_time     TIME         NOT NULL,
    days_of_week SMALLINT[]   NOT NULL,                        -- [1,3,5] = Mon/Wed/Fri
    max_capacity INTEGER      NOT NULL DEFAULT 50,
    is_active    BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- ============================================================
-- TABLE 5: students
-- Extended profile for users with role = 'student'
-- ============================================================
CREATE TABLE students (
    id                UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tenant_id         UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    batch_id          UUID         REFERENCES batches(id) ON DELETE SET NULL,
    student_custom_id VARCHAR(50)  NOT NULL,                   -- Institute roll number
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

-- ============================================================
-- TABLE 6: parents
-- Extended profile for users with role = 'parent'
-- ============================================================
CREATE TABLE parents (
    id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE 7: parent_student_map
-- Many-to-many: one parent may have multiple children;
-- one student may have mother + father both linked
-- ============================================================
CREATE TABLE parent_student_map (
    parent_id    UUID        NOT NULL REFERENCES parents(id)  ON DELETE CASCADE,
    student_id   UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    relationship VARCHAR(50) NOT NULL DEFAULT 'parent'
                     CHECK (relationship IN ('father', 'mother', 'guardian', 'parent')),
    PRIMARY KEY (parent_id, student_id)
);

-- ============================================================
-- TABLE 8: student_face_samples
-- Stores one row per enrolled face photo for a student.
-- embedding: 128-dimensional float vector computed client-side
-- Multiple samples per student improves match accuracy.
-- ============================================================
CREATE TABLE student_face_samples (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    tenant_id   UUID        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
    photo_url   TEXT        NOT NULL,                         -- Supabase Storage URL (private bucket)
    embedding   vector(128) NOT NULL,                         -- face-api.js / TF.js computed descriptor
    label       VARCHAR(100),                                 -- optional: "front", "left_profile", etc.
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE 9: attendance_logs
-- One row per student per batch per date.
-- UNIQUE constraint prevents double check-ins.
-- ============================================================
CREATE TABLE attendance_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID        NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
    student_id        UUID        NOT NULL REFERENCES students(id)   ON DELETE CASCADE,
    batch_id          UUID        NOT NULL REFERENCES batches(id)    ON DELETE CASCADE,
    date              DATE        NOT NULL DEFAULT CURRENT_DATE,
    check_in          TIMESTAMPTZ,                                   -- NULL if absent
    status            VARCHAR(50) NOT NULL
                          CHECK (status IN ('present', 'late', 'absent')),
    verification_mode VARCHAR(50) NOT NULL
                          CHECK (verification_mode IN ('face_live', 'face_photo', 'manual')),
    confidence_score  NUMERIC(5,2),                                  -- face match % (NULL for manual)
    verified_by       UUID        REFERENCES users(id),              -- admin UUID if manual override
    notes             TEXT,                                          -- optional admin note
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, batch_id, date)
);

-- ============================================================
-- TABLE 10: tenant_settings
-- One row per tenant. Configures fine rules and schedules.
-- ============================================================
CREATE TABLE tenant_settings (
    tenant_id               UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    -- Fine structure
    absent_fine_rule_1      NUMERIC(10,2) NOT NULL DEFAULT 1000.00,   -- fine per day, up to 4 absences/month
    absent_fine_rule_1_days INTEGER       NOT NULL DEFAULT 4,          -- threshold day count
    absent_fine_rule_2      NUMERIC(10,2) NOT NULL DEFAULT 2000.00,   -- fine per day, 5+ absences/month
    -- Timing rules
    late_threshold_minutes  INTEGER       NOT NULL DEFAULT 5,          -- minutes after start = "late"
    grace_period_minutes    INTEGER       NOT NULL DEFAULT 0,          -- extra window before marking absent
    -- Calendar
    currency                VARCHAR(10)   NOT NULL DEFAULT 'INR',
    holidays                DATE[]        NOT NULL DEFAULT '{}',
    weekends                SMALLINT[]    NOT NULL DEFAULT '{6,7}',    -- 6=Sat, 7=Sun
    -- Auto-fine controls
    auto_fine_enabled       BOOLEAN       NOT NULL DEFAULT true,
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE 11: fines
-- Auto-generated or manually created fine records, including
-- payment-proof upload support (proof URL / transaction id / method).
-- ============================================================
CREATE TABLE fines (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID          NOT NULL REFERENCES tenants(id)        ON DELETE CASCADE,
    student_id         UUID          NOT NULL REFERENCES students(id)       ON DELETE CASCADE,
    attendance_log_id  UUID          REFERENCES attendance_logs(id)         ON DELETE SET NULL,
    amount             NUMERIC(10,2) NOT NULL,
    reason             TEXT          NOT NULL,
    status             VARCHAR(50)   NOT NULL DEFAULT 'unpaid'
                            CHECK (status IN ('unpaid', 'pending_verification', 'paid', 'waived')),
    issued_date        DATE          NOT NULL DEFAULT CURRENT_DATE,
    paid_date          TIMESTAMPTZ,
    waived_by          UUID          REFERENCES users(id),
    waive_reason       TEXT,
    payment_proof_url  TEXT,
    transaction_id     VARCHAR(100),
    payment_method     VARCHAR(50)   CHECK (payment_method IN ('upi', 'bank_transfer', 'cash')),
    rejection_reason   TEXT,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE 12: group_attendance_photos
-- One reference photo per batch per day, used alongside per-student face
-- matching for a batch-level attendance record.
-- ============================================================
CREATE TABLE group_attendance_photos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    batch_id    UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    photo_url   TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE 13: student_join_requests
-- A student requesting to join a batch, subject to admin approval.
-- ============================================================
CREATE TABLE student_join_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_id    UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    remark      TEXT,
    status      VARCHAR(50) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE 14: student_removals
-- Record of a student being removed from a batch (audit trail — who, when, why).
-- ============================================================
CREATE TABLE student_removals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_id    UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    remark      TEXT,
    removed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- UPDATED_AT triggers — auto-update timestamp on row change
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_classes_updated_at
    BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_batches_updated_at
    BEFORE UPDATE ON batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_students_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_attendance_updated_at
    BEFORE UPDATE ON attendance_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_settings_updated_at
    BEFORE UPDATE ON tenant_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_fines_updated_at
    BEFORE UPDATE ON fines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
