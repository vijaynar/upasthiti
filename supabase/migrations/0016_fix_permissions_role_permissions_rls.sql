-- =========================================================================
-- MIGRATION: 0016_fix_permissions_role_permissions_rls.sql
-- Upasthiti — Fix missing RLS policies on permissions / role_permissions
--
-- Both tables have Row-Level Security enabled but had zero policies
-- defined, which means Postgres denies ALL access to every non-superuser
-- role (including the `authenticated` role PostgREST uses on behalf of
-- logged-in users). This silently broke the admin sidebar's permission
-- checks: the nested `users -> roles -> role_permissions -> permissions`
-- query returned an empty embed instead of erroring, so hasPermission()
-- always evaluated false and most menu items disappeared.
--
-- Neither table has a tenant_id column — they are global RBAC config
-- (permission definitions and role-to-permission mappings), not
-- tenant-scoped data — so a blanket "authenticated can read" policy is
-- the correct model, consistent with how these tables are actually used.
-- =========================================================================

CREATE POLICY "authenticated_read_permissions" ON public.permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);
