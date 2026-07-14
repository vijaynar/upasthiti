-- ============================================================
-- MIGRATION: 0004_functions_triggers.sql
-- Abhyas — Functions, RPCs, and triggers
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION A: Generic updated_at trigger
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_attendance_updated_at BEFORE UPDATE ON public.attendance_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fines_updated_at BEFORE UPDATE ON public.fines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_coaches_updated_at BEFORE UPDATE ON public.coaches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coach_docs_updated_at BEFORE UPDATE ON public.coach_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coach_financials_updated_at BEFORE UPDATE ON public.coach_financial_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coach_payouts_updated_at BEFORE UPDATE ON public.coach_payouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coach_attendance_updated_at BEFORE UPDATE ON public.coach_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coach_leaves_updated_at BEFORE UPDATE ON public.coach_leaves FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Previously missing: coach_batch_assignments has an updated_at column but
-- (in the original migration history) no trigger ever kept it current.
CREATE TRIGGER trg_cba_updated_at BEFORE UPDATE ON public.coach_batch_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_coach_pricing_policies_updated_at BEFORE UPDATE ON public.coach_pricing_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coach_pricing_rules_updated_at BEFORE UPDATE ON public.coach_pricing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coach_pricing_settings_updated_at BEFORE UPDATE ON public.coach_pricing_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coach_student_pricing_overrides_updated_at BEFORE UPDATE ON public.coach_student_pricing_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ────────────────────────────────────────────────────────────
-- SECTION B: RLS helper functions (read JWT app_metadata)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
    SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
    SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$;

-- Looks up a student's tenant_id while bypassing RLS. Needed because a
-- direct `EXISTS (SELECT 1 FROM students ...)` inside a parent_student_map
-- policy re-triggers students' own RLS, which (via students_parent_select)
-- queries back into parent_student_map — infinite recursion (Postgres
-- error 42P17). SECURITY DEFINER runs this lookup as the function owner,
-- bypassing RLS and breaking the cycle.
CREATE OR REPLACE FUNCTION public.student_tenant_id(p_student_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM public.students WHERE id = p_student_id;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION C: Face-matching RPC (pgvector cosine similarity)
-- ────────────────────────────────────────────────────────────
-- Called by the Next.js API route: POST /api/v1/attendance/match-face
-- Accepts a 128-float embedding computed client-side (face-api.js on
-- web, TensorFlow.js on mobile) and returns the best-matching student
-- within the tenant.
--
-- SECURITY DEFINER: runs as the function owner so it can bypass RLS for
-- the vector scan; the calling API layer enforces tenant isolation via
-- the p_tenant_id parameter.
CREATE OR REPLACE FUNCTION public.match_face_embedding(
    p_tenant_id     UUID,
    input_embedding vector(128),
    match_threshold FLOAT,
    match_count     INT
)
RETURNS TABLE (
    student_id      UUID,
    similarity      FLOAT,
    student_name    TEXT,
    batch_id        UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id                                                        AS student_id,
        (1 - (sfs.embedding <=> input_embedding))::FLOAT            AS similarity,
        (u.first_name || ' ' || u.last_name)                        AS student_name,
        s.batch_id
    FROM student_face_samples sfs
    JOIN students s  ON s.id = sfs.student_id
    JOIN users    u  ON u.id = s.id
    WHERE
        sfs.tenant_id = p_tenant_id
        AND s.status  = 'active'
        AND (1 - (sfs.embedding <=> input_embedding)) > match_threshold
    ORDER BY sfs.embedding <=> input_embedding ASC
    LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION D: Coach employee-ID auto-generation
-- ────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.coach_employee_id_seq;

CREATE OR REPLACE FUNCTION public.generate_coach_employee_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.employee_id IS NULL OR NEW.employee_id = '' THEN
        NEW.employee_id := 'COACH' || nextval('public.coach_employee_id_seq');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_coaches_employee_id
    BEFORE INSERT ON public.coaches
    FOR EACH ROW EXECUTE FUNCTION public.generate_coach_employee_id();

-- ────────────────────────────────────────────────────────────
-- SECTION E: auth.users signup hooks — default tenant + profile
-- auto-creation. Two triggers make every Supabase Auth signup
-- automatically provision a public.users row (and a public.students
-- row, for the default 'student' role), enabling self-service signup
-- without a separate "create profile" API call.
--
-- KNOWN DESIGN SMELL (carried over, not fixed, in this baseline):
-- both functions hardcode a specific tenant UUID as the fallback for
-- any signup that doesn't already carry one in its JWT app_metadata.
-- Fine for this single-tenant-in-practice deployment; spinning up a
-- genuinely separate/multi-tenant environment requires updating the
-- hardcoded UUID below (or refactoring to a configurable setting).
-- The matching tenant seed row lives in 0006_seed_reference_data.sql.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enrich_auth_user_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    IF NEW.raw_app_meta_data IS NULL THEN
        NEW.raw_app_meta_data := jsonb_build_object('role', 'student', 'tenant_id', '022c1494-057e-4c80-80dd-88fa4b1287b5');
    ELSE
        IF NOT (NEW.raw_app_meta_data ? 'role') THEN
            NEW.raw_app_meta_data := NEW.raw_app_meta_data || jsonb_build_object('role', 'student');
        END IF;
        IF NOT (NEW.raw_app_meta_data ? 'tenant_id') THEN
            NEW.raw_app_meta_data := NEW.raw_app_meta_data || jsonb_build_object('tenant_id', '022c1494-057e-4c80-80dd-88fa4b1287b5');
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_enrich_auth_user_metadata
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.enrich_auth_user_metadata();

CREATE OR REPLACE FUNCTION public.sync_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_tenant_id uuid;
    v_role varchar(50);
    v_first_name varchar(100);
    v_last_name varchar(100);
BEGIN
    v_role := coalesce(NEW.raw_app_meta_data->>'role', 'student');

    v_tenant_id := coalesce(
        (NEW.raw_app_meta_data->>'tenant_id')::uuid,
        '022c1494-057e-4c80-80dd-88fa4b1287b5'::uuid
    );

    v_first_name := coalesce(
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );
    v_last_name := coalesce(
        NEW.raw_user_meta_data->>'last_name',
        ''
    );

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
        INSERT INTO public.users (id, tenant_id, email, role, first_name, last_name, phone, is_active, created_at, updated_at)
        VALUES (
            NEW.id,
            v_tenant_id,
            NEW.email,
            v_role,
            v_first_name,
            v_last_name,
            NEW.phone,
            true,
            now(),
            now()
        );
    END IF;

    IF v_role = 'student' AND NOT EXISTS (SELECT 1 FROM public.students WHERE id = NEW.id) THEN
        INSERT INTO public.students (id, tenant_id, student_custom_id, date_of_birth, joining_date, status, created_at, updated_at)
        VALUES (
            NEW.id,
            v_tenant_id,
            'vs-' || substring(NEW.id::text from 1 for 8),
            '2000-01-01'::date,
            CURRENT_DATE,
            'active',
            now(),
            now()
        );
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_auth_user_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_profile();
