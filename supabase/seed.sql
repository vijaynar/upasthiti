-- supabase/seed.sql
-- LOCAL-ONLY test data, applied automatically after migrations on every
-- `supabase db reset` (never applied to hosted projects — Doc 17 §4).
--
-- V1's fixture seed lived here (superseded — see supabase/migrations_v1_legacy/seed.sql.bak).
-- V2 fixture seed lands with the identity/org core (Phase 2-3): the
-- undeletable seed super admin and the canonical isolation fixture — two
-- orgs, two branches, cross-org parent, multi-role independent coach
-- (Doc 07 §19, Doc 17 step 4). Left empty until then so `db reset` stays green.

-- ── Seed Super Admin (superadmin@abhyas.local / admin123) ───────────
-- V2 has no admin-create-user path — identities are normally only ever
-- created by resolveOrCreateIdentity() as a side effect of a real
-- magic-link/OAuth login (packages/modules/identity-auth/src/service.ts).
-- This block hand-builds the same shape (auth.users + auth.identities for
-- GoTrue, public.users + public.auth_methods for the app's own identity
-- table) so a local `supabase db reset` always has one ready-to-use super
-- admin without a manual "sign in once, then run scripts/bootstrap-
-- superadmin.mjs" step. provider = 'email_otp' with verified_at set
-- mirrors what a real magic-link login would have produced — sign-in
-- still goes through the normal magic-link flow (Mailpit/Inbucket
-- captures the email locally); the password on auth.users is set for
-- convention/parity with V1's fixture but isn't checked by the app
-- (magic-link only, no email_password provider is built).
--
-- platform_role_assignments.seed = true makes this row (and this user)
-- undeletable — enforced by protect_seed_platform_role() /
-- protect_seed_super_admin_user() (migration 0004). Once this exists,
-- scripts/bootstrap-superadmin.mjs will refuse to run again on this DB —
-- expected, not a bug; use the platform console's role grant/revoke for
-- everything after.
do $$
declare
  v_auth_user_id uuid := '00000000-0000-0000-0000-00000000a001';
  v_user_id uuid;
  v_super_admin_role_id uuid;
begin
  if exists (select 1 from auth.users where id = v_auth_user_id) then
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_auth_user_id, 'authenticated', 'authenticated',
    'superadmin@abhyas.local', crypt('admin123', gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    '{}'::jsonb,
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_auth_user_id, v_auth_user_id::text,
    jsonb_build_object('sub', v_auth_user_id::text, 'email', 'superadmin@abhyas.local',
      'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  insert into public.users (display_name)
  values ('Super Admin')
  returning id into v_user_id;

  insert into public.auth_methods (user_id, provider, provider_uid, verified_identifier, verified_at, last_used_at)
  values (v_user_id, 'email_otp', v_auth_user_id::text, 'superadmin@abhyas.local', now(), now());

  select id into v_super_admin_role_id from public.roles where key = 'super_admin' and scope = 'platform';

  insert into public.platform_role_assignments (user_id, role_id, granted_by, seed)
  values (v_user_id, v_super_admin_role_id, v_user_id, true);
end $$;
