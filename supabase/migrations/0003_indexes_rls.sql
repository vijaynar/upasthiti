-- ============================================================
-- MIGRATION: 0003_indexes_rls.sql
-- Abhyas — Performance Indexes & Row Level Security Policies
-- (core schema tables only — coach/taxonomy/governance RLS lives
-- alongside those tables in their own migrations)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION A: Multi-tenant isolation indexes
-- All high-traffic queries filter on tenant_id first.
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_users_tenant_id
    ON users (tenant_id);

CREATE INDEX idx_users_tenant_role
    ON users (tenant_id, role);

CREATE INDEX idx_students_tenant_id
    ON students (tenant_id);

CREATE INDEX idx_students_tenant_batch
    ON students (tenant_id, batch_id)
    WHERE status = 'active';                    -- partial index: only active students

CREATE INDEX idx_classes_tenant_id
    ON classes (tenant_id)
    WHERE is_active = true;

CREATE INDEX idx_batches_tenant_class
    ON batches (tenant_id, class_id)
    WHERE is_active = true;

CREATE INDEX idx_attendance_tenant_date
    ON attendance_logs (tenant_id, date DESC);  -- most recent date first

CREATE INDEX idx_attendance_student_date
    ON attendance_logs (student_id, date DESC);

CREATE INDEX idx_attendance_batch_date
    ON attendance_logs (batch_id, date DESC);

CREATE INDEX idx_fines_tenant_status
    ON fines (tenant_id, status);

CREATE INDEX idx_fines_student_id
    ON fines (student_id);

CREATE INDEX idx_face_samples_tenant
    ON student_face_samples (tenant_id);

CREATE INDEX idx_face_samples_student
    ON student_face_samples (student_id);

-- ────────────────────────────────────────────────────────────
-- SECTION B: pgvector IVFFlat index for fast ANN search
-- lists = 100 is a good default for up to ~1M vectors.
-- Rebuild with higher lists as dataset grows.
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_face_embedding_ivfflat
    ON student_face_samples
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ────────────────────────────────────────────────────────────
-- SECTION C: Row Level Security (RLS) Policies
-- Enforces data isolation at the database layer.
-- ────────────────────────────────────────────────────────────

-- Enable RLS on all core tables
ALTER TABLE tenants                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE students                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_student_map        ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_face_samples      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fines                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_attendance_photos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_join_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_removals          ENABLE ROW LEVEL SECURITY;

-- Helper function: get calling user's tenant_id from JWT metadata
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
    SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID;
$$;

-- Helper function: get calling user's role from JWT metadata
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
    SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$;

-- Helper function: look up a student's tenant_id while bypassing RLS.
-- parent_student_map_admin_all needs a student's tenant, but a direct
-- `EXISTS (SELECT 1 FROM students ...)` there re-triggers students' own RLS,
-- which (via students_parent_select) queries back into parent_student_map —
-- an infinite recursion loop (Postgres error 42P17). SECURITY DEFINER runs
-- this lookup as the function owner, which bypasses RLS and breaks the cycle.
CREATE OR REPLACE FUNCTION student_tenant_id(p_student_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM students WHERE id = p_student_id;
$$;

-- ── tenants: admins see only their own tenant ──────────────
CREATE POLICY "tenants_select_own"
    ON tenants FOR SELECT
    USING (id = auth_tenant_id());

-- ── users: same-tenant reads; admins see all; students see self ──
CREATE POLICY "users_select_same_tenant"
    ON users FOR SELECT
    USING (tenant_id = auth_tenant_id());

CREATE POLICY "users_insert_admin"
    ON users FOR INSERT
    WITH CHECK (
        tenant_id = auth_tenant_id()
        AND auth_user_role() IN ('admin', 'superadmin')
    );

-- Coaches self-provision through the public onboarding wizard (client-side
-- insert, before an admin has touched the row), so they need their own
-- INSERT path alongside the admin one above.
CREATE POLICY "users_coach_insert"
    ON users FOR INSERT
    WITH CHECK (
        tenant_id = auth_tenant_id()
        AND auth_user_role() = 'coach'
    );

CREATE POLICY "users_update_admin_or_self"
    ON users FOR UPDATE
    USING (
        tenant_id = auth_tenant_id()
        AND (auth_user_role() IN ('admin', 'superadmin') OR id = auth.uid())
    );

-- Public Discovery pages need to read basic coach-user info (name, avatar)
-- for any coach, not just same-tenant callers.
CREATE POLICY "allow_public_read_coach_users"
    ON users FOR SELECT
    USING (role = 'coach');

-- ── classes & batches: tenant-scoped ──────────────────────
CREATE POLICY "classes_tenant_select"
    ON classes FOR SELECT
    USING (tenant_id = auth_tenant_id());

CREATE POLICY "classes_admin_write"
    ON classes FOR ALL
    USING (
        tenant_id = auth_tenant_id()
        AND auth_user_role() IN ('admin', 'superadmin')
    );

-- Public Discovery pages list active classes regardless of caller's tenant.
CREATE POLICY "allow_public_read_classes"
    ON classes FOR SELECT
    USING (is_active = true);

CREATE POLICY "batches_tenant_select"
    ON batches FOR SELECT
    USING (tenant_id = auth_tenant_id());

CREATE POLICY "batches_admin_write"
    ON batches FOR ALL
    USING (
        tenant_id = auth_tenant_id()
        AND auth_user_role() IN ('admin', 'superadmin')
    );

-- Coaches manage the batches they run.
CREATE POLICY "batches_coach_write"
    ON batches FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach')
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

-- Public Discovery pages list active batches regardless of caller's tenant.
CREATE POLICY "allow_public_read_batches"
    ON batches FOR SELECT
    USING (is_active = true);

-- ── students: admins see all; students see self; parents see linked ──
CREATE POLICY "students_admin_all"
    ON students FOR ALL
    USING (
        tenant_id = auth_tenant_id()
        AND auth_user_role() IN ('admin', 'superadmin')
    );

-- Coaches manage the roster of students in their tenant.
CREATE POLICY "students_coach_all"
    ON students FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach')
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

CREATE POLICY "students_self_select"
    ON students FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "students_parent_select"
    ON students FOR SELECT
    USING (
        id IN (
            SELECT student_id FROM parent_student_map
            WHERE parent_id = auth.uid()
        )
    );

-- ── parent_student_map: parents read their own links; admins manage in-tenant ──
CREATE POLICY "parent_student_map_parent_select"
    ON parent_student_map FOR SELECT
    USING (parent_id = auth.uid());

CREATE POLICY "parent_student_map_admin_all"
    ON parent_student_map FOR ALL
    USING (
        auth_user_role() IN ('admin', 'superadmin')
        AND student_tenant_id(parent_student_map.student_id) = auth_tenant_id()
    );

-- ── attendance_logs: tenant-scoped; students see own ──────
CREATE POLICY "attendance_tenant_admin"
    ON attendance_logs FOR ALL
    USING (
        tenant_id = auth_tenant_id()
        AND auth_user_role() IN ('admin', 'superadmin')
    );

-- Coaches mark/view attendance for their tenant.
CREATE POLICY "attendance_coach_all"
    ON attendance_logs FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach')
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

CREATE POLICY "attendance_student_self"
    ON attendance_logs FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "attendance_parent_children"
    ON attendance_logs FOR SELECT
    USING (
        student_id IN (
            SELECT student_id FROM parent_student_map
            WHERE parent_id = auth.uid()
        )
    );

-- ── fines: same pattern ───────────────────────────────────
CREATE POLICY "fines_tenant_admin"
    ON fines FOR ALL
    USING (
        tenant_id = auth_tenant_id()
        AND auth_user_role() IN ('admin', 'superadmin')
    );

-- Coaches can view (not manage) fines within their tenant.
CREATE POLICY "fines_coach_select"
    ON fines FOR SELECT
    USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

CREATE POLICY "fines_student_self"
    ON fines FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "fines_parent_children"
    ON fines FOR SELECT
    USING (
        student_id IN (
            SELECT student_id FROM parent_student_map
            WHERE parent_id = auth.uid()
        )
    );

-- ── face samples: admin-only write; RPC bypasses via SECURITY DEFINER ──
CREATE POLICY "face_samples_admin_write"
    ON student_face_samples FOR ALL
    USING (
        tenant_id = auth_tenant_id()
        AND auth_user_role() IN ('admin', 'superadmin')
    );

-- ── tenant_settings: admin-only ───────────────────────────
CREATE POLICY "settings_admin_all"
    ON tenant_settings FOR ALL
    USING (
        tenant_id = auth_tenant_id()
        AND auth_user_role() IN ('admin', 'superadmin')
    );

-- ── roster workflow tables ────────────────────────────────
CREATE POLICY "student_join_requests_admin_all"
    ON student_join_requests FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "student_join_requests_self_all"
    ON student_join_requests FOR ALL
    USING (student_id = auth.uid());

CREATE POLICY "student_join_requests_tenant_select"
    ON student_join_requests FOR SELECT
    USING (tenant_id = auth_tenant_id());

CREATE POLICY "student_removals_admin_all"
    ON student_removals FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "student_removals_self_select"
    ON student_removals FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "student_removals_tenant_select"
    ON student_removals FOR SELECT
    USING (tenant_id = auth_tenant_id());

-- ────────────────────────────────────────────────────────────
-- SECTION D: Blanket tenant-isolation safety net
-- Added later, on top of the fine-grained policies above, as a catch-all
-- so no tenant-scoped table can accidentally ship without *some* isolation
-- policy. RLS policies are permissive (OR'd together), so this only ever
-- widens access for rows within the caller's own tenant — it does not
-- narrow what the specific policies above already allow.
-- ────────────────────────────────────────────────────────────

CREATE POLICY "tenant_isolation_policy" ON tenants
    FOR ALL USING (id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON users
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON classes
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON batches
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON students
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON parents
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON student_face_samples
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON attendance_logs
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON tenant_settings
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON fines
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON group_attendance_photos
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON student_join_requests
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON student_removals
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));
