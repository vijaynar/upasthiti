-- ============================================================
-- MIGRATION: 0005_storage_security.sql
-- Abhyas — Row Level Security, storage buckets, and grants
-- ============================================================
-- SECURITY FIX APPLIED IN THIS BASELINE (see review notes shipped with
-- this migration set for full detail):
--
-- The original schema layered a blanket "tenant_isolation_policy" —
-- FOR ALL USING (tenant_id = caller's tenant), with NO role check — on
-- top of the fine-grained, role-scoped policies below. Because RLS
-- policies are permissive (OR'd together), that blanket policy did not
-- just act as a inert "safety net": it silently widened INSERT/UPDATE/
-- DELETE on nearly every tenant-scoped table to *any* authenticated
-- same-tenant user, regardless of role. Concretely, under the original
-- policy set, a plain 'student' account could UPDATE/DELETE any other
-- student's row, and any tenant member could read/write coach bank
-- account numbers, PAN numbers, payout amounts, and admin-only internal
-- notes on coaches. Several tables (parents, group_attendance_photos,
-- coach_documents, coach_face_data, coach_availability, coach_leaves,
-- coach_financial_settings, coach_payouts, coach_reviews,
-- coach_attendance, coach_audit_logs, coach_notes, roles) had *no other
-- policy at all* — the blanket was their only access control.
--
-- This migration removes that blanket pattern entirely and replaces it
-- with explicit, role-scoped policies per table, following the same
-- admin-manages-all / coach-manages-own pattern already established
-- (and correctly scoped) elsewhere in the original schema, e.g.
-- coach_batch_assignments and coach_pricing_policies.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION A: Enable RLS on every table
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.tenants                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_student_map                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_face_samples              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fines                             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_attendance_photos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_join_requests             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_removals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_documents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_face_data                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_availability                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_leaves                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_financial_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_payouts                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_reviews                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_attendance                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_audit_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_batch_assignments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_notes                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags                              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_categories                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_tags                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_areas                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_communities               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_service_areas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_service_communities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_pricing_policies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_pricing_rules               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_pricing_settings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_student_pricing_overrides   ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- SECTION B: tenants
-- ────────────────────────────────────────────────────────────

CREATE POLICY "tenants_select_own" ON public.tenants
    FOR SELECT USING (id = auth_tenant_id());

CREATE POLICY "tenants_update_admin" ON public.tenants
    FOR UPDATE
    USING (id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

-- ────────────────────────────────────────────────────────────
-- SECTION C: RBAC governance (permissions / roles / role_permissions / audit_logs)
-- ────────────────────────────────────────────────────────────

-- permissions / role_permissions are global RBAC config (no tenant_id
-- column) — read-only to clients; writes are service-role only.
CREATE POLICY "authenticated_read_permissions" ON public.permissions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_role_permissions" ON public.role_permissions
    FOR SELECT TO authenticated USING (true);

-- roles: authenticated users can read system (tenant_id IS NULL) roles
-- plus their own tenant's custom roles. `NULL = <tenant-uuid>` is never
-- TRUE in SQL, so this policy exists specifically to widen read access
-- back open for the NULL-tenant rows (permissive policies OR together).
CREATE POLICY "authenticated_read_global_or_own_tenant_roles" ON public.roles
    FOR SELECT TO authenticated
    USING (tenant_id IS NULL OR tenant_id = auth_tenant_id());

-- Only tenant admins may create/edit custom roles for their own tenant.
-- tenant_id = auth_tenant_id() is never true for system rows (tenant_id
-- IS NULL), so system roles remain unwritable via client RLS.
CREATE POLICY "roles_admin_manage" ON public.roles
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "audit_logs_admin_all" ON public.audit_logs
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

-- ────────────────────────────────────────────────────────────
-- SECTION D: users
-- ────────────────────────────────────────────────────────────

CREATE POLICY "users_select_same_tenant" ON public.users
    FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "users_insert_admin" ON public.users
    FOR INSERT
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

-- Coaches self-provision through the public onboarding wizard (client-side
-- insert, before an admin has touched the row).
CREATE POLICY "users_coach_insert" ON public.users
    FOR INSERT
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

CREATE POLICY "users_update_admin_or_self" ON public.users
    FOR UPDATE
    USING (tenant_id = auth_tenant_id() AND (auth_user_role() IN ('admin', 'superadmin') OR id = auth.uid()));

-- Public Discovery pages need to read basic coach-user info (name, avatar)
-- for any coach, not just same-tenant callers.
CREATE POLICY "allow_public_read_coach_users" ON public.users
    FOR SELECT USING (role = 'coach');

-- ────────────────────────────────────────────────────────────
-- SECTION E: classes & batches
-- ────────────────────────────────────────────────────────────

CREATE POLICY "classes_tenant_select" ON public.classes
    FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "classes_admin_write" ON public.classes
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

-- Public Discovery pages list active classes regardless of caller's tenant.
CREATE POLICY "allow_public_read_classes" ON public.classes
    FOR SELECT USING (is_active = true);

CREATE POLICY "batches_tenant_select" ON public.batches
    FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "batches_admin_write" ON public.batches
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

-- Coaches manage the batches they run.
CREATE POLICY "batches_coach_write" ON public.batches
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach')
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

-- Public Discovery pages list active batches regardless of caller's tenant.
CREATE POLICY "allow_public_read_batches" ON public.batches
    FOR SELECT USING (is_active = true);

-- ────────────────────────────────────────────────────────────
-- SECTION F: students, parents, parent_student_map
-- ────────────────────────────────────────────────────────────

CREATE POLICY "students_admin_all" ON public.students
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

-- Coaches manage the roster of students in their tenant.
CREATE POLICY "students_coach_all" ON public.students
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach')
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

CREATE POLICY "students_self_select" ON public.students
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "students_parent_select" ON public.students
    FOR SELECT
    USING (id IN (SELECT student_id FROM public.parent_student_map WHERE parent_id = auth.uid()));

-- parents previously had NO explicit policy of its own (relied solely on
-- the removed blanket). Restored to the same admin/coach-manage + self-read
-- pattern used by students.
CREATE POLICY "parents_admin_all" ON public.parents
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "parents_coach_all" ON public.parents
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach')
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

CREATE POLICY "parents_self_select" ON public.parents
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "parent_student_map_parent_select" ON public.parent_student_map
    FOR SELECT USING (parent_id = auth.uid());

CREATE POLICY "parent_student_map_admin_all" ON public.parent_student_map
    FOR ALL
    USING (
        auth_user_role() IN ('admin', 'superadmin')
        AND student_tenant_id(parent_student_map.student_id) = auth_tenant_id()
    );

CREATE POLICY "parent_student_map_coach_all" ON public.parent_student_map
    FOR ALL
    USING (
        auth_user_role() = 'coach'
        AND student_tenant_id(parent_student_map.student_id) = auth_tenant_id()
    );

-- ────────────────────────────────────────────────────────────
-- SECTION G: attendance, fines, tenant_settings, face samples,
-- group photos, join requests, removals
-- ────────────────────────────────────────────────────────────

CREATE POLICY "attendance_tenant_admin" ON public.attendance_logs
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "attendance_coach_all" ON public.attendance_logs
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach')
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

CREATE POLICY "attendance_student_self" ON public.attendance_logs
    FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "attendance_parent_children" ON public.attendance_logs
    FOR SELECT
    USING (student_id IN (SELECT student_id FROM public.parent_student_map WHERE parent_id = auth.uid()));

CREATE POLICY "settings_admin_all" ON public.tenant_settings
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "fines_tenant_admin" ON public.fines
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

-- Coaches can view (not manage) fines within their tenant.
CREATE POLICY "fines_coach_select" ON public.fines
    FOR SELECT USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

CREATE POLICY "fines_student_self" ON public.fines
    FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "fines_parent_children" ON public.fines
    FOR SELECT
    USING (student_id IN (SELECT student_id FROM public.parent_student_map WHERE parent_id = auth.uid()));

-- Face samples contain biometric data: admin/coach-only, no student/parent
-- read path. The match_face_embedding RPC is SECURITY DEFINER and bypasses
-- RLS entirely for the actual matching query.
CREATE POLICY "face_samples_admin_write" ON public.student_face_samples
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "face_samples_coach_write" ON public.student_face_samples
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach')
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

-- group_attendance_photos previously had NO explicit policy of its own
-- (relied solely on the removed blanket). Contains photos of many
-- students' faces, so — like face samples — it's staff-only, no
-- tenant-wide or student/parent read.
CREATE POLICY "group_photos_admin_all" ON public.group_attendance_photos
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "group_photos_coach_all" ON public.group_attendance_photos
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach')
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

CREATE POLICY "student_join_requests_admin_all" ON public.student_join_requests
    FOR ALL USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "student_join_requests_coach_all" ON public.student_join_requests
    FOR ALL USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

CREATE POLICY "student_join_requests_self_all" ON public.student_join_requests
    FOR ALL USING (student_id = auth.uid());

CREATE POLICY "student_removals_admin_all" ON public.student_removals
    FOR ALL USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "student_removals_coach_select" ON public.student_removals
    FOR SELECT USING (tenant_id = auth_tenant_id() AND auth_user_role() = 'coach');

CREATE POLICY "student_removals_self_select" ON public.student_removals
    FOR SELECT USING (student_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- SECTION H: coaches
-- ────────────────────────────────────────────────────────────

CREATE POLICY "coaches_admin_all" ON public.coaches
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

-- Onboarding wizard: a coach creates and edits their own profile row.
CREATE POLICY "coaches_self_insert" ON public.coaches
    FOR INSERT WITH CHECK (id = auth.uid() AND tenant_id = auth_tenant_id());

CREATE POLICY "coaches_self_update" ON public.coaches
    FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "coaches_self_select" ON public.coaches
    FOR SELECT USING (id = auth.uid());

-- Public Discovery pages: any tenant may read a coach who has a published slug.
CREATE POLICY "allow_public_read_coaches" ON public.coaches
    FOR SELECT USING (public_profile_slug IS NOT NULL);

-- ────────────────────────────────────────────────────────────
-- SECTION I: sensitive coach-detail tables
-- These previously had NO explicit policy of their own (relied solely on
-- the removed blanket), which meant any same-tenant user — including a
-- student or parent account — could read/write coach documents, biometric
-- face data, leave requests, bank account/PAN details, payouts, and
-- internal admin notes. Tightened to admin-manages-all + coach-manages-
-- own, matching the pattern already used correctly elsewhere (e.g.
-- coach_batch_assignments, coach_pricing_policies).
-- ────────────────────────────────────────────────────────────

CREATE POLICY "coach_documents_admin_all" ON public.coach_documents
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "coach_documents_self_insert" ON public.coach_documents
    FOR INSERT WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

CREATE POLICY "coach_documents_self_select" ON public.coach_documents
    FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "coach_face_data_admin_all" ON public.coach_face_data
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "coach_face_data_self_insert" ON public.coach_face_data
    FOR INSERT WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

CREATE POLICY "coach_face_data_self_select" ON public.coach_face_data
    FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "coach_availability_admin_all" ON public.coach_availability
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "coach_availability_self_manage" ON public.coach_availability
    FOR ALL USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

CREATE POLICY "coach_leaves_admin_all" ON public.coach_leaves
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "coach_leaves_self_insert" ON public.coach_leaves
    FOR INSERT WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

CREATE POLICY "coach_leaves_self_select" ON public.coach_leaves
    FOR SELECT USING (coach_id = auth.uid());

-- Financial settings: coach self-manages their own payout info during
-- onboarding; admin can manage anyone's in-tenant.
CREATE POLICY "coach_financial_settings_admin_all" ON public.coach_financial_settings
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "coach_financial_settings_self_manage" ON public.coach_financial_settings
    FOR ALL USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

-- Payouts are computed/approved by the academy — coach may view, not edit.
CREATE POLICY "coach_payouts_admin_all" ON public.coach_payouts
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "coach_payouts_self_select" ON public.coach_payouts
    FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "coach_reviews_admin_all" ON public.coach_reviews
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "coach_reviews_self_select" ON public.coach_reviews
    FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "coach_attendance_admin_all" ON public.coach_attendance
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

-- Coach self-check-in (face/QR/geofenced).
CREATE POLICY "coach_attendance_self_insert" ON public.coach_attendance
    FOR INSERT WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

CREATE POLICY "coach_attendance_self_select" ON public.coach_attendance
    FOR SELECT USING (coach_id = auth.uid());

-- Internal audit trail: admin-only, no coach self-access.
CREATE POLICY "coach_audit_logs_admin_all" ON public.coach_audit_logs
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

-- coach_notes is explicitly documented as "admin-only internal notes on a
-- coach" — the coach being discussed must NOT be able to read these.
CREATE POLICY "coach_notes_admin_all" ON public.coach_notes
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

-- ────────────────────────────────────────────────────────────
-- SECTION J: coach_batch_assignments
-- (blanket dropped; existing role-scoped policies already correct)
-- ────────────────────────────────────────────────────────────

CREATE POLICY "cba_admin_all" ON public.coach_batch_assignments
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "cba_coach_select" ON public.coach_batch_assignments
    FOR SELECT
    USING (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

CREATE POLICY "cba_coach_insert" ON public.coach_batch_assignments
    FOR INSERT
    WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid() AND status = 'pending');

CREATE POLICY "allow_public_read_assignments" ON public.coach_batch_assignments
    FOR SELECT USING (status = 'approved');

-- ────────────────────────────────────────────────────────────
-- SECTION K: Discovery taxonomy & geography — platform-wide reference
-- data, public read, self-managed coach join tables
-- ────────────────────────────────────────────────────────────

CREATE POLICY "allow_public_read_categories"    ON public.categories    FOR SELECT USING (true);
CREATE POLICY "allow_public_read_subcategories" ON public.subcategories FOR SELECT USING (true);
CREATE POLICY "allow_public_read_tags"          ON public.tags          FOR SELECT USING (true);

CREATE POLICY "allow_public_read_coach_categories" ON public.coach_categories FOR SELECT USING (true);
CREATE POLICY "coach_categories_self_insert" ON public.coach_categories
    FOR INSERT WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_categories_self_manage" ON public.coach_categories
    FOR ALL USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

CREATE POLICY "allow_public_read_coach_tags" ON public.coach_tags FOR SELECT USING (true);
CREATE POLICY "coach_tags_self_insert" ON public.coach_tags
    FOR INSERT WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_tags_self_manage" ON public.coach_tags
    FOR ALL USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

CREATE POLICY "allow_public_read_service_areas"       ON public.service_areas       FOR SELECT USING (is_active = true);
CREATE POLICY "allow_public_read_service_communities" ON public.service_communities FOR SELECT USING (is_active = true);

CREATE POLICY "allow_public_read_coach_service_areas" ON public.coach_service_areas FOR SELECT USING (true);
CREATE POLICY "coach_service_areas_self_manage" ON public.coach_service_areas
    FOR ALL USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

CREATE POLICY "allow_public_read_coach_service_communities" ON public.coach_service_communities FOR SELECT USING (true);
CREATE POLICY "coach_service_communities_self_manage" ON public.coach_service_communities
    FOR ALL USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- SECTION L: coach pricing
-- (blanket dropped — it previously let any coach read/edit another
-- coach's pricing policies; existing role-scoped policies already
-- correctly restrict to admin + the owning coach)
-- ────────────────────────────────────────────────────────────

CREATE POLICY "cpp_admin_all" ON public.coach_pricing_policies
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "cpp_coach_manage_own" ON public.coach_pricing_policies
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND coach_id = auth.uid())
    WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

-- coach_pricing_rules has no tenant_id of its own — isolate via its parent policy.
CREATE POLICY "coach_pricing_rules_via_policy" ON public.coach_pricing_rules
    FOR ALL
    USING (
        policy_id IN (
            SELECT id FROM public.coach_pricing_policies
            WHERE tenant_id = auth_tenant_id()
              AND (auth_user_role() IN ('admin', 'superadmin') OR coach_id = auth.uid())
        )
    )
    WITH CHECK (
        policy_id IN (
            SELECT id FROM public.coach_pricing_policies
            WHERE tenant_id = auth_tenant_id()
              AND (auth_user_role() IN ('admin', 'superadmin') OR coach_id = auth.uid())
        )
    );

CREATE POLICY "cps_admin_all" ON public.coach_pricing_settings
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "cps_coach_manage_own" ON public.coach_pricing_settings
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND coach_id = auth.uid())
    WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

CREATE POLICY "cspo_admin_all" ON public.coach_student_pricing_overrides
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'))
    WITH CHECK (tenant_id = auth_tenant_id() AND auth_user_role() IN ('admin', 'superadmin'));

CREATE POLICY "cspo_coach_manage_own" ON public.coach_student_pricing_overrides
    FOR ALL
    USING (tenant_id = auth_tenant_id() AND coach_id = auth.uid())
    WITH CHECK (tenant_id = auth_tenant_id() AND coach_id = auth.uid());

-- A student may read their own active pricing override (e.g. a
-- "you're on a scholarship rate" billing screen).
CREATE POLICY "cspo_student_self_select" ON public.coach_student_pricing_overrides
    FOR SELECT USING (student_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- SECTION M: Storage buckets and object access policies
-- All buckets are public-read; INSERT/UPDATE/DELETE just require an
-- authenticated caller (file paths are namespaced by the app rather
-- than enforcing per-object ownership at the storage layer).
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public) VALUES
    ('student-portraits',  'student-portraits',  true),
    ('avatars',             'avatars',            true),
    ('coach-documents',     'coach-documents',    true),
    ('coach-certificates',  'coach-certificates', true),
    ('attendance-photos',   'attendance-photos',  true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
    bucket TEXT;
BEGIN
    FOREACH bucket IN ARRAY ARRAY['student-portraits', 'avatars', 'coach-documents', 'coach-certificates', 'attendance-photos']
    LOOP
        EXECUTE format(
            'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L)',
            'Public Access ' || bucket, bucket
        );
        EXECUTE format(
            'CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)',
            'Authenticated Insert ' || bucket, bucket
        );
        EXECUTE format(
            'CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L)',
            'Authenticated Update ' || bucket, bucket
        );
        EXECUTE format(
            'CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L)',
            'Authenticated Delete ' || bucket, bucket
        );
    END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- SECTION N: Grants
-- ────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.match_face_embedding(UUID, vector, FLOAT, INT)
    TO authenticated;
