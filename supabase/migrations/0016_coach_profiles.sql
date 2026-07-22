-- Abhyas V2 — Coach professional profiles (Doc 04 §8 unification).
--
-- Scope: coach_profiles, a 1:1 extension of staff_profiles carrying the
-- coach-specific fields the old V1 6-step onboarding wireframe captured
-- (bio, experience, qualification, languages, specialties, teaching mode)
-- that staff_profiles deliberately left generic (Doc 07 §12 only specs
-- designation/employment_type — the same fields for a Front Desk hire and
-- a Coach). Owned by @abhyas/module-staff-hr (its README already scopes
-- "coach onboarding paths" into this module).
--
-- Why this exists now: all four Doc 04 §8 coach-onboarding paths (self-serve
-- independent, invited, org-added, platform-invited) need the SAME
-- professional-profile step, and none of them had anywhere to store it —
-- migration 0014 only built the generic HR data layer. This migration does
-- NOT touch how a person gets a `coach` role (memberships/invitations,
-- Phase 3/4, unchanged) — same boundary migration 0014 already drew.
--
-- Deliberately NOT built (V1 wireframe steps with no V2 equivalent):
--   * Per-coach student-facing pricing ("how you charge") — V1's
--     coach_pricing_policies has no V2 analogue; Finance's fee_policies
--     (migration 0011) are batch/program-scoped, which is the real V2
--     pricing mechanism. Inventing a parallel per-coach pricing table here
--     would be new, undiscussed scope, not a rewire.
--   * KYC/certification uploads reuse the existing staff_documents table
--     (migration 0014, doc_type already covers 'id_proof'/'certification')
--     — no new documents table needed.
--   * Specialty tagging reuses taxonomy_sports.key (migration 0013), same
--     convention as listings.sport_keys — one sport taxonomy, not two.
--
-- Scope decisions (2026-07-21):
--   * `staff_profiles_insert_self` (new policy below): migration 0014 only
--     let a permission-holder (`hr.staff.onboard`) create someone else's HR
--     profile ("not a second invite mechanism"). That's still true for
--     other staff, but coach self-serve onboarding (Doc 04 §8 path 3, and a
--     newly-invited coach completing their own profile) needs the coach to
--     create their OWN staff_profiles row without holding an HR-admin
--     permission. Scoped to `user_id = current_user_id()`, i.e. exactly
--     the same "self" carve-out staff_documents/staff_availability/
--     leave_requests already have for their own rows — this migration
--     extends that existing self-service precedent to the parent row
--     itself, it doesn't introduce a new trust boundary.
--   * Invitations RLS widened (below) to also allow a platform staffer
--     holding an active `support_access_grants` row for the target org to
--     create/list/revoke invitations there — reuses the exact
--     `support_grant_active()` mechanism migration 0007 already wired into
--     `organizations`/`memberships` reads, just extended to `invitations`
--     so a Super Admin can generate a coach invite link for an org without
--     being a member of it. No new permission key; same support-grant gate.

create table coach_profiles (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null unique references staff_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  user_id uuid not null references users(id),   -- denormalized for self-scoped RLS, same convention as staff_profiles
  bio text,
  experience_years int check (experience_years is null or experience_years >= 0),
  qualification text,
  languages_known text[] not null default '{}',
  sport_keys text[] not null default '{}',      -- taxonomy_sports.key values; unconstrained array, same rationale as listings.sport_keys (migration 0013)
  age_groups text[] not null default '{}',
  skill_levels text[] not null default '{}',
  service_types text[] not null default '{}',   -- 'offline' | 'online'
  class_types text[] not null default '{}',     -- 'group' | 'one_to_one'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coach_profiles_organization_id_idx on coach_profiles (organization_id);
create index coach_profiles_user_id_idx on coach_profiles (user_id);

create trigger coach_profiles_set_updated_at
  before update on coach_profiles
  for each row execute function set_updated_at();

-- ── RLS: coach_profiles (mirrors staff_documents' self+staff shape) ──

alter table coach_profiles enable row level security;

create policy coach_profiles_select_self on coach_profiles for select to authenticated
  using (user_id = current_user_id());

create policy coach_profiles_select_staff on coach_profiles for select to authenticated
  using (organization_id = current_org() and
    (has_perm_branch('hr.staff.onboard', branch_id) or has_perm_branch('hr.staff.read', branch_id)));

create policy coach_profiles_insert_self on coach_profiles for insert to authenticated
  with check (organization_id = current_org() and user_id = current_user_id());

create policy coach_profiles_insert_staff on coach_profiles for insert to authenticated
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id));

create policy coach_profiles_update_self on coach_profiles for update to authenticated
  using (user_id = current_user_id())
  with check (user_id = current_user_id());

create policy coach_profiles_update_staff on coach_profiles for update to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id))
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', branch_id));

grant select, insert, update on coach_profiles to authenticated;

-- ── staff_profiles: self-serve create (scope decision above) ────────

create policy staff_profiles_insert_self on staff_profiles for insert to authenticated
  with check (organization_id = current_org() and user_id = current_user_id());

-- ── invitations: platform support-grant carve-out (scope decision above) ──

drop policy invitations_select_permitted on invitations;
create policy invitations_select_permitted on invitations for select
  using (
    (organization_id = current_org() and has_perm_branch('people.member.read', branch_id))
    or support_grant_active(organization_id)
  );

drop policy invitations_insert_permitted on invitations;
create policy invitations_insert_permitted on invitations for insert
  with check (
    invited_by = current_user_id()
    and (
      (organization_id = current_org() and has_perm_branch('people.member.invite', branch_id))
      or support_grant_active(organization_id)
    )
  );

drop policy invitations_revoke_permitted on invitations;
create policy invitations_revoke_permitted on invitations for update
  using (
    (organization_id = current_org() and has_perm_branch('people.member.invite', branch_id))
    or support_grant_active(organization_id)
  )
  with check (
    revoked_at is not null
    and (
      (organization_id = current_org() and has_perm_branch('people.member.invite', branch_id))
      or support_grant_active(organization_id)
    )
  );
