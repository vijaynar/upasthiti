-- =========================================================================
-- MIGRATION: 0013_coach_ops_dashboard.sql
-- Abhyas — Coach Operations Dashboard: expanded status taxonomy, reason
-- tracking, document-request tracking, and internal admin notes on coaches.
-- =========================================================================

-- 1. Status taxonomy additions --------------------------------------------
-- Additive only — existing values are untouched. New values:
--   Paused    — temporary suspension from Active; coach keeps logging in.
--   Suspended — harder hold from Active/Paused; login blocked.
--   Rejected  — admin explicitly rejected a pending application.
--   Archived  — terminal, off-boarded coach.
ALTER TABLE public.coaches DROP CONSTRAINT IF EXISTS coaches_account_status_check;
ALTER TABLE public.coaches ADD CONSTRAINT coaches_account_status_check CHECK (account_status IN (
    'Onboarding', 'Document Upload Pending', 'Pending Verification',
    'Active', 'Inactive', 'On Leave', 'Terminated',
    'Rejected', 'Paused', 'Suspended', 'Archived'
));

-- 2. Reason tracking --------------------------------------------------------
-- One column, overwritten on every status-changing action that carries a
-- reason (Reject/Pause/Suspend/Archive); cleared when a coach is approved
-- / resumed back to Active.
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- 3. "Request Documents" action (logged in-app only — no email/SMS
-- provider exists in this codebase to actually deliver it).
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS document_request_note TEXT;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS document_request_at TIMESTAMPTZ;

-- 4. coach_notes — admin-only internal notes on a coach ---------------------
CREATE TABLE IF NOT EXISTS public.coach_notes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id    UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    author_id   UUID NOT NULL REFERENCES public.users(id),
    note        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_notes_coach ON public.coach_notes(coach_id, created_at DESC);

ALTER TABLE public.coach_notes ENABLE ROW LEVEL SECURITY;

-- Mirrors the tenant-isolation policy used for every other coach-module
-- table (0005_coach_module.sql) — internal-only, no public read.
CREATE POLICY "tenant_isolation_policy" ON public.coach_notes
    FOR ALL USING (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = ((auth.jwt() -> 'app_metadata') ->> 'tenant_id'));
