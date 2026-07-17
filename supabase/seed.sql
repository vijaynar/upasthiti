-- ============================================================
-- supabase/seed.sql
-- LOCAL-ONLY test data. Applied automatically after migrations on every
-- `supabase db reset`. NEVER applied to hosted projects — `supabase db push`
-- ignores this file entirely, so nothing here ever reaches staging/production.
--
-- To bootstrap the first real admin on a NEW hosted project instead, use:
--   node scripts/bootstrap-superadmin.mjs --staging   (or --prod)
-- ============================================================

DO $$
DECLARE
    v_user_id uuid := '00000000-0000-0000-0000-000000000001';
    v_tenant_id uuid := '022c1494-057e-4c80-80dd-88fa4b1287b5'; -- VidyaSopan Sports school (default tenant, see 0006)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at,
            confirmation_token, recovery_token, email_change_token_new, email_change
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            'admin@abhyas.local',
            crypt('admin123', gen_salt('bf')),
            now(),
            jsonb_build_object(
                'provider', 'email', 'providers', ARRAY['email'],
                'role', 'superadmin', 'tenant_id', v_tenant_id
            ),
            jsonb_build_object('first_name', 'Local', 'last_name', 'Admin'),
            now(), now(),
            '', '', '', ''
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id AND provider = 'email') THEN
        INSERT INTO auth.identities (
            id, user_id, provider_id, identity_data, provider,
            last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_user_id, v_user_id::text,
            jsonb_build_object('sub', v_user_id::text, 'email', 'admin@abhyas.local'),
            'email', now(), now(), now()
        );
    END IF;

    -- The auth.users insert above fires trg_sync_auth_user_profile (0004), which
    -- auto-creates the public.users row with role='superadmin'. Widen it to match
    -- the real admin pattern used in production: active role 'admin', with
    -- 'superadmin' available via the in-app role switcher.
    UPDATE public.users
    SET role = 'admin', available_roles = ARRAY['superadmin', 'admin']
    WHERE id = v_user_id;
END $$;

-- Local login: admin@abhyas.local / admin123
