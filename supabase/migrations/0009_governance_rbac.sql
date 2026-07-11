-- =========================================================================
-- MIGRATION: 0009_governance_rbac.sql
-- Abhyas — Role/Permission governance tables (RBAC) + audit log
--
-- IMPORTANT CONTEXT: permissions, roles, role_permissions, and audit_logs
-- existed in production with zero migration history behind them — they
-- were created directly (dashboard/SQL editor), so no migration file ever
-- defined them. This migration reconstructs them from the live schema so
-- a fresh database actually has the tables the app already depends on
-- (apps/web/src/app/admin/layout.tsx and the governance API routes read
-- from these). Column shapes, constraints, RLS policies, and seed data
-- below were introspected directly from the running database.
-- =========================================================================

-- 1. permissions --------------------------------------------------------------
CREATE TABLE public.permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module      VARCHAR(100) NOT NULL,
    action      VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (module, action)
);

-- 2. roles ----------------------------------------------------------------------
-- tenant_id NULL = a global/system role (Admin, Coach, Student, Super Admin),
-- visible to every tenant. Non-null scopes a custom role to one tenant.
CREATE TABLE public.roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES public.tenants(id),
    name        VARCHAR(255) NOT NULL,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE NULLS NOT DISTINCT (tenant_id, name)
);

-- 3. role_permissions -------------------------------------------------------------
CREATE TABLE public.role_permissions (
    role_id       UUID NOT NULL REFERENCES public.roles(id),
    permission_id UUID NOT NULL REFERENCES public.permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

-- 4. audit_logs ---------------------------------------------------------------------
CREATE TABLE public.audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id),
    user_id     UUID REFERENCES public.users(id),
    action      VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. users.role_id now has a table to point to ----------------------------------------
ALTER TABLE public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);

-- 6. Row Level Security -----------------------------------------------------------------
ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs       ENABLE ROW LEVEL SECURITY;

-- permissions / role_permissions are global RBAC config (no tenant_id
-- column) — a blanket "authenticated can read" policy is the correct model.
CREATE POLICY "authenticated_read_permissions" ON public.permissions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_role_permissions" ON public.role_permissions
    FOR SELECT TO authenticated USING (true);

-- roles: authenticated users can read system (tenant_id IS NULL) roles plus
-- their own tenant's custom roles. `NULL = <tenant-uuid>` is never TRUE in
-- SQL, so the tenant_isolation_policy below alone would hide every system
-- role from everyone — this policy exists specifically to widen that back
-- open for the NULL-tenant rows (permissive policies OR together).
CREATE POLICY "authenticated_read_global_or_own_tenant_roles" ON public.roles
    FOR SELECT TO authenticated
    USING (
        tenant_id IS NULL
        OR tenant_id::text = (auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text
    );

CREATE POLICY "tenant_isolation_policy" ON public.roles
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

CREATE POLICY "tenant_isolation_policy" ON public.audit_logs
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));

-- 7. Seed system roles + the full permission catalogue -----------------------------------
INSERT INTO public.permissions (module, action) VALUES
    ('attendance', 'mark'),
    ('attendance', 'view'),
    ('attendance', 'viewOwn'),
    ('audit_logs', 'view'),
    ('batches', 'create'),
    ('batches', 'delete'),
    ('batches', 'edit'),
    ('batches', 'view'),
    ('classes', 'create'),
    ('classes', 'delete'),
    ('classes', 'edit'),
    ('classes', 'view'),
    ('coaches', 'create'),
    ('coaches', 'delete'),
    ('coaches', 'edit'),
    ('coaches', 'view'),
    ('payments', 'manage'),
    ('payments', 'view'),
    ('reports', 'view'),
    ('roles', 'manage'),
    ('settings', 'manage'),
    ('students', 'create'),
    ('students', 'delete'),
    ('students', 'edit'),
    ('students', 'view'),
    ('users', 'create'),
    ('users', 'delete'),
    ('users', 'edit'),
    ('users', 'view');

INSERT INTO public.roles (name, tenant_id, is_system) VALUES
    ('Super Admin', NULL, true),
    ('Admin',       NULL, true),
    ('Coach',       NULL, true),
    ('Student',     NULL, true);

-- Super Admin: everything.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Super Admin';

-- Admin: everything except roles:manage (Super-Admin-only) and
-- attendance:viewOwn (that's the student-self permission).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Admin'
  AND (p.module, p.action) NOT IN (('roles', 'manage'), ('attendance', 'viewOwn'));

-- Coach.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Coach' AND (p.module, p.action) IN (
    ('attendance', 'mark'), ('attendance', 'view'),
    ('batches', 'edit'), ('batches', 'view'),
    ('classes', 'view'),
    ('reports', 'view'),
    ('students', 'view')
);

-- Student.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Student' AND (p.module, p.action) IN (
    ('attendance', 'viewOwn'),
    ('payments', 'view'),
    ('reports', 'view')
);
