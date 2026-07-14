-- Fixes Postgres error 42P17 ("infinite recursion detected in policy for
-- relation students"), hit on any query that needs both students' and
-- parent_student_map's RLS evaluated together (e.g. batches embedding
-- students(id)).
--
-- Cycle: students_parent_select (on students) subqueries
-- parent_student_map, while parent_student_map_admin_all (on
-- parent_student_map) subqueried students back via EXISTS — each policy's
-- evaluation re-triggered the other's, forever.
--
-- Fix: look up the student's tenant_id through a SECURITY DEFINER function,
-- which executes as the function owner and bypasses RLS, breaking the cycle.

CREATE OR REPLACE FUNCTION student_tenant_id(p_student_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM students WHERE id = p_student_id;
$$;

DROP POLICY IF EXISTS "parent_student_map_admin_all" ON parent_student_map;

CREATE POLICY "parent_student_map_admin_all"
    ON parent_student_map FOR ALL
    USING (
        auth_user_role() IN ('admin', 'superadmin')
        AND student_tenant_id(parent_student_map.student_id) = auth_tenant_id()
    );
