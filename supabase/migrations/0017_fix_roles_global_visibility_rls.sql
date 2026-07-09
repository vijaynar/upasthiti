-- =========================================================================
-- MIGRATION: 0017_fix_roles_global_visibility_rls.sql
-- Upasthiti — Fix roles table hiding global (system) roles from authenticated users
--
-- The existing `tenant_isolation_policy` on public.roles requires
-- roles.tenant_id to exactly equal the caller's JWT tenant claim. System
-- roles (Admin, Coach, Student, Super Admin) have tenant_id = NULL, and
-- `NULL = <tenant-uuid>` is never TRUE in SQL — so those rows were
-- invisible to every authenticated user, on top of the permissions/
-- role_permissions gap already fixed in 0016.
--
-- This silently broke the `users -> roles -> role_permissions ->
-- permissions` embed in the admin sidebar for any non-superadmin role
-- (superadmin bypasses the permission check in app code), leaving only
-- Dashboard and Leave Approvals (the two menu items with no
-- hasPermission gate) visible after switching to Admin or Coach.
--
-- Fix: add a permissive SELECT policy allowing authenticated users to
-- read globally-scoped roles (tenant_id IS NULL) in addition to their
-- own tenant's roles. Permissive policies OR together, so this only
-- widens SELECT visibility — INSERT/UPDATE/DELETE stay governed by the
-- original tenant_isolation_policy.
-- =========================================================================

CREATE POLICY "authenticated_read_global_or_own_tenant_roles" ON public.roles
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id::text = (auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text
  );
