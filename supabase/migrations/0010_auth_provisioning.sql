-- =========================================================================
-- MIGRATION: 0010_auth_provisioning.sql
-- Abhyas — auth.users signup hooks: default tenant + profile auto-creation
--
-- Two BEFORE/AFTER triggers on auth.users make every Supabase Auth signup
-- automatically provision a public.users row (and a public.students row,
-- for the default 'student' role) — this is what makes self-service signup
-- work without a separate "create profile" API call.
--
-- ⚠ KNOWN DESIGN SMELL — flagged, not fixed, in this pass:
-- Both trigger functions hardcode a specific production tenant UUID
-- ('VidyaSopan Sports school') as the fallback tenant_id for any signup
-- that doesn't already carry one in its JWT app_metadata. That's fine for
-- this single-tenant-in-practice deployment, but it means:
--   1. This migration must seed that exact tenant row for signups to work
--      at all (the FK would otherwise reject every new user).
--   2. Spinning up a genuinely separate/multi-tenant environment from this
--      migration set requires manually updating the hardcoded UUID in both
--      functions below (or better: refactor to read a configurable
--      default-tenant setting instead of a literal constant).
-- =========================================================================

-- Preserve current behavior byte-for-byte: seed the same tenant these
-- trigger functions already assume exists.
INSERT INTO public.tenants (id, name, slug)
VALUES ('022c1494-057e-4c80-80dd-88fa4b1287b5', 'VidyaSopan Sports school', 'vidyasopan-sports-school')
ON CONFLICT (id) DO NOTHING;

-- Ensures every new auth.users row has role/tenant_id in app_metadata even
-- if the client didn't set them (e.g. a bare email/password signup).
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

-- Mirrors the new auth.users row into public.users (and public.students,
-- for the 'student' role) right after signup.
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
