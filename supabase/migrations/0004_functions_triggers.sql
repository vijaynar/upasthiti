-- Abhyas V2 — Functions, RLS helper functions, and triggers.
--
-- All tables/indexes already exist (0002/0003). Functions are ordered so any
-- function calling another function has its callee defined first. Where a
-- function was superseded across the original migration history (has_perm/
-- has_perm_branch went from "any held role" to "active role only" in the
-- 2026-07-24 single-active-role change), only the FINAL version is defined
-- here — no intermediate versions, no DROP FUNCTION.

-- ── Generic triggers ──────────────────────────────────────────────

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── RLS session-context helpers (Doc 07 §17) ─────────────────────
-- Read session context set by packages/platform/src/db's withRequestContext
-- (set_config, Doc 05 §6).

create or replace function current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function current_org() returns uuid
language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;

-- NULL = org-wide scope for the caller's own membership in `org`; also NULL
-- (indistinguishable) if the caller has no active membership there.
-- SECURITY DEFINER: called from RLS policies on tables its own query would
-- otherwise re-trigger RLS on.
create or replace function my_branch_scope(org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from memberships
  where organization_id = org and user_id = current_user_id() and status = 'active'
  limit 1
$$;

-- ── RBAC: has_perm() / has_perm_branch() (Doc 07 §17) ────────────
-- FINAL form (2026-07-24 single-active-role change): scoped to the
-- membership's ACTIVE role only (memberships.active_role_id), not every role
-- the membership holds. SECURITY DEFINER is required: these are called FROM
-- RLS policies on memberships/membership_roles themselves — without it, the
-- internal query would re-trigger the calling policy and recurse.
create or replace function has_perm(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from memberships m
    join role_permissions rp on rp.role_id = m.active_role_id
    where m.user_id = current_user_id()
      and m.organization_id = current_org()
      and m.status = 'active'
      and rp.permission_key = perm
  )
$$;

-- Branch-refined has_perm(): true if the caller's active membership in
-- current_org() grants perm via its ACTIVE role AND is org-wide (branch_id
-- is null) or matches branch `b`. A NULL `b` (org-wide target) only matches
-- an org-wide membership, never a branch-scoped one.
create or replace function has_perm_branch(perm text, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from memberships m
    join role_permissions rp on rp.role_id = m.active_role_id
    where m.user_id = current_user_id()
      and m.organization_id = current_org()
      and m.status = 'active'
      and (m.branch_id is null or m.branch_id = b)
      and rp.permission_key = perm
  )
$$;

-- "Own batches" (Doc 04 §6) — batches assigned to any of the caller's active
-- memberships in current_org().
create or replace function my_batch_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select ca.batch_id
  from coach_assignments ca
  join memberships m on m.id = ca.membership_id
  where m.user_id = current_user_id()
    and m.organization_id = current_org()
    and m.status = 'active'
$$;

-- P5 support-access path (Doc 04 §9, Doc 07 §17) — true if the caller holds
-- an active, unexpired, unrevoked support_access_grants row for `org`.
create or replace function support_grant_active(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from support_access_grants
    where organization_id = org
      and grantee_user_id = current_user_id()
      and revoked_at is null
      and expires_at > now()
  )
$$;

-- has_platform_perm(): platform-scope equivalent of has_perm() — checks
-- platform_role_assignments -> role_permissions instead of
-- memberships -> membership_roles -> role_permissions, not parameterized by
-- current_org() (platform actions aren't org-scoped).
create or replace function has_platform_perm(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from platform_role_assignments pra
    join role_permissions rp on rp.role_id = pra.role_id
    where pra.user_id = current_user_id()
      and rp.permission_key = perm
  )
$$;

-- is_org_owner(): "does an arbitrary user own an arbitrary org" — a
-- different shape than has_perm()'s "does the caller hold X in THEIR
-- current org", needed by the cross-org referral-attribution check below.
create or replace function is_org_owner(p_user uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from memberships m
    join membership_roles mr on mr.membership_id = m.id
    join roles r on r.id = mr.role_id
    where m.user_id = p_user and m.organization_id = p_org
      and m.status = 'active' and r.key = 'owner'
  )
$$;

-- ── Guardianship-aware RLS primitives (Doc 04 §7, Doc 02 §5) ─────

create or replace function is_guardian_of(p_ward_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from guardianships
    where guardian_user_id = current_user_id()
      and ward_user_id = p_ward_user_id
      and status = 'active'
  )
$$;

create or replace function has_consent_authority(p_ward_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from guardianships
    where guardian_user_id = current_user_id()
      and ward_user_id = p_ward_user_id
      and consent_authority = true
      and status = 'active'
  )
$$;

-- Guardian read access to a ward's org-scoped data: active guardianship AND
-- the ward has an active enrollment in the target org AND that org hasn't
-- turned guardian visibility off (default on).
create or replace function is_my_ward(p_ward_user_id uuid, p_organization_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_guardian_of(p_ward_user_id)
    and exists (
      select 1 from enrollments
      where student_user_id = p_ward_user_id
        and organization_id = p_organization_id
        and status = 'active'
    )
    and coalesce((
      select (settings->>'guardian_visibility')::boolean
      from organizations where id = p_organization_id
    ), true)
$$;

-- `batches` and `batch_enrollments` each need to read the other in their own
-- RLS policies — a direct EXISTS subquery each way is a genuine policy
-- cycle. SECURITY DEFINER breaks it (internal query runs as the owning
-- role, bypassing RLS entirely rather than re-scoping it).
create or replace function is_batch_participant(p_batch_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from batch_enrollments be
    join enrollments e on e.id = be.enrollment_id
    where be.batch_id = p_batch_id
      and (e.student_user_id = current_user_id() or is_my_ward(e.student_user_id, e.organization_id))
  )
$$;

-- ── Audit log: write_audit_log() — the only insert path (Doc 07 §16) ──
-- SECURITY DEFINER so actor_user_id is always current_user_id() (never a
-- caller-supplied value) and `authenticated` never needs a direct INSERT
-- grant on audit_log itself. p_org null = platform-scope action.
create or replace function write_audit_log(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_org uuid default null,
  p_detail jsonb default null,
  p_support_grant_id uuid default null
) returns uuid
language sql security definer set search_path = public as $$
  insert into audit_log (organization_id, actor_user_id, support_grant_id, action, target_type, target_id, detail)
  values (p_org, current_user_id(), p_support_grant_id, p_action, p_target_type, p_target_id, p_detail)
  returning id
$$;

-- ── Finance: ledger account/entry helpers ────────────────────────

create or replace function get_or_create_ledger_account(p_org uuid, p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  acct_id uuid;
begin
  select id into acct_id from ledger_accounts where organization_id = p_org and kind = p_kind and owner_user_id is null;
  if acct_id is not null then return acct_id; end if;

  insert into ledger_accounts (organization_id, kind)
  values (p_org, p_kind)
  on conflict (organization_id, kind) where organization_id is not null and owner_user_id is null do nothing
  returning id into acct_id;

  if acct_id is null then
    select id into acct_id from ledger_accounts where organization_id = p_org and kind = p_kind and owner_user_id is null;
  end if;
  return acct_id;
end;
$$;

-- get_or_create_ledger_account(p_org, p_kind) can only ever match org-scoped
-- rows (organization_id = p_org is NULL, never true, when p_org is NULL), so
-- referral rewards (which need a user-owned and a platform-wide account)
-- need these two additional shapes.
create or replace function get_or_create_user_ledger_account(p_user uuid, p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  acct_id uuid;
begin
  select id into acct_id from ledger_accounts where owner_user_id = p_user and kind = p_kind;
  if acct_id is not null then return acct_id; end if;

  insert into ledger_accounts (owner_user_id, kind)
  values (p_user, p_kind)
  on conflict (owner_user_id, kind) where owner_user_id is not null do nothing
  returning id into acct_id;

  if acct_id is null then
    select id into acct_id from ledger_accounts where owner_user_id = p_user and kind = p_kind;
  end if;
  return acct_id;
end;
$$;

create or replace function get_or_create_platform_ledger_account(p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  acct_id uuid;
begin
  select id into acct_id from ledger_accounts where organization_id is null and owner_user_id is null and kind = p_kind;
  if acct_id is not null then return acct_id; end if;

  insert into ledger_accounts (kind)
  values (p_kind)
  on conflict (kind) where organization_id is null and owner_user_id is null do nothing
  returning id into acct_id;

  if acct_id is null then
    select id into acct_id from ledger_accounts where organization_id is null and owner_user_id is null and kind = p_kind;
  end if;
  return acct_id;
end;
$$;

-- post_ledger_entries(): the ONLY insert path into ledger_entries.
-- p_entries: jsonb array of {accountId, amountMinor, currency, refType, refId}.
-- SECURITY DEFINER so `authenticated` never needs a direct grant. Balance is
-- re-validated here (fast, friendly error) in addition to the constraint
-- trigger below (the real guarantee).
create or replace function post_ledger_entries(p_entries jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  grp uuid := gen_random_uuid();
  total bigint;
  leg jsonb;
begin
  select coalesce(sum((e->>'amountMinor')::bigint), 0) into total from jsonb_array_elements(p_entries) e;
  if total <> 0 then
    raise exception 'ledger_entry_group_unbalanced: legs sum to %, expected 0', total;
  end if;

  for leg in select * from jsonb_array_elements(p_entries) loop
    insert into ledger_entries (entry_group, account_id, organization_id, amount_minor, currency, ref_type, ref_id)
    values (
      grp,
      (leg->>'accountId')::uuid,
      (select organization_id from ledger_accounts where id = (leg->>'accountId')::uuid),
      (leg->>'amountMinor')::bigint,
      leg->>'currency',
      leg->>'refType',
      (leg->>'refId')::uuid
    );
  end loop;

  return grp;
end;
$$;

-- Doc 07 §9: "sum(entry_group) must = 0" — the real accounting-truth
-- invariant, enforced regardless of which application code path wrote the
-- rows.
create or replace function check_ledger_entry_group_balanced() returns trigger
language plpgsql as $$
declare
  total bigint;
  distinct_currencies int;
begin
  select coalesce(sum(amount_minor), 0), count(distinct currency)
    into total, distinct_currencies
    from ledger_entries where entry_group = new.entry_group;

  if distinct_currencies > 1 then
    raise exception 'ledger_entry_group_currency_mismatch: entry_group % mixes currencies', new.entry_group;
  end if;
  if total <> 0 then
    raise exception 'ledger_entry_group_unbalanced: entry_group % sums to %, expected 0', new.entry_group, total;
  end if;
  return null;
end;
$$;

-- ── Marketplace ───────────────────────────────────────────────────

-- Promotes an org's pending_verification listings to live once the org
-- itself is verified. Called from marketplace's service-role
-- activateOrgListings(), not from RLS.
create or replace function activate_org_listings(p_org uuid) returns void
language sql security definer set search_path = public as $$
  update listings set status = 'live', published_at = coalesce(published_at, now())
  where organization_id = p_org and status = 'pending_verification'
$$;

-- Self/circular referral rejection (US-8 AC2). Fires only when
-- referred_org_id transitions from null to a value (the attribution moment).
create or replace function enforce_referral_attribution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referred_org_id is not null and old.referred_org_id is null then
    if is_org_owner(new.referrer_user_id, new.referred_org_id) then
      raise exception 'referral_self_referral: referrer already owns the referred organization';
    end if;

    if exists (
      select 1 from referrals r2
      where r2.id <> new.id
        and r2.referred_org_id is not null
        and is_org_owner(r2.referrer_user_id, new.referred_org_id)
        and is_org_owner(new.referrer_user_id, r2.referred_org_id)
    ) then
      raise exception 'referral_circular: reciprocal referral detected';
    end if;

    new.status := 'attributed';
  end if;
  return new;
end;
$$;

-- ── Attendance: match_face(), face-enrollment consent guard ──────

-- SECURITY DEFINER, org derived from session (not a caller-supplied
-- parameter — closes the V1 gap where an arbitrary tenant_id let any caller
-- search another org's enrolled faces).
create or replace function match_face(p_batch_id uuid, p_embedding vector(128), p_match_count int default 3)
returns table (enrollment_id uuid, similarity real)
language sql stable security definer set search_path = public as $$
  select fe.enrollment_id, (1 - (fe.embedding <=> p_embedding))::real as similarity
  from face_enrollments fe
  join enrollments e on e.id = fe.enrollment_id
  join batch_enrollments be on be.enrollment_id = e.id
  join batches b on b.id = be.batch_id
  where b.id = p_batch_id
    and b.organization_id = current_org()
    and fe.embedding is not null
    and fe.deleted_at is null
    and be.status = 'active'
  order by fe.embedding <=> p_embedding asc
  limit p_match_count
$$;

-- "No consent row → no embedding, DB-enforced." SECURITY DEFINER: the
-- enrolling caller is staff (holds attendance.face.enroll), not the
-- consent's own subject/granter, so consents_select_related's RLS would
-- otherwise filter this lookup to zero rows and reject every legitimate
-- enrollment.
create or replace function enforce_face_enrollment_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  subject_id uuid;
begin
  if new.enrollment_id is not null then
    select student_user_id into subject_id from enrollments where id = new.enrollment_id;
  else
    select user_id into subject_id from memberships where id = new.membership_id;
  end if;

  if not exists (
    select 1 from consents
    where id = new.consent_id
      and kind = 'biometric_face'
      and subject_user_id = subject_id
      and withdrawn_at is null
  ) then
    raise exception 'face_enrollment requires an active biometric_face consent for the same subject';
  end if;

  return new;
end;
$$;

-- ── Scheduling: batch-archive permission gate ────────────────────
-- schedule.batch.archive is stricter than schedule.batch.update (a Coach may
-- hold the latter but not the former) — a BEFORE UPDATE trigger, not a
-- second RLS policy, since WITH CHECK can't compare OLD vs NEW status.
create or replace function enforce_batch_archive_perm() returns trigger
language plpgsql as $$
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    if not has_perm_branch('schedule.batch.archive', old.branch_id) then
      raise exception 'insufficient_permission: schedule.batch.archive required to archive this batch';
    end if;
  end if;
  return new;
end;
$$;

-- ── Finance: charge-status transition gate ───────────────────────
-- Each status transition requires a DIFFERENT permission than the base
-- finance.charge.create/.waive RLS gate can express in one WITH CHECK
-- clause (can't compare OLD vs NEW status there).
create or replace function enforce_charge_status_transition() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'waived' and not has_perm_branch('finance.charge.waive', old.branch_id) then
      raise exception 'insufficient_permission: finance.charge.waive required to waive this charge';
    elsif new.status = 'paid' and not has_perm_branch('finance.proof.approve', old.branch_id) then
      raise exception 'insufficient_permission: finance.proof.approve required to mark this charge paid';
    elsif new.status = 'refunded' and not has_perm_branch('finance.refund.issue', old.branch_id) then
      raise exception 'insufficient_permission: finance.refund.issue required to refund this charge';
    elsif new.status = 'cancelled' and not has_perm_branch('finance.charge.create', old.branch_id) then
      raise exception 'insufficient_permission: finance.charge.create required to cancel this charge';
    end if;
  end if;
  return new;
end;
$$;

-- ── Identity: >=1 verified auth method per user ──────────────────
-- Deferred to end of transaction so resolve-or-create can insert user +
-- first verified method together.
create or replace function assert_user_has_verified_method() returns trigger
language plpgsql as $$
declare
  v_user_id uuid := coalesce(new.user_id, old.user_id);
begin
  if not exists (
    select 1 from auth_methods
    where user_id = v_user_id and verified_at is not null
  ) then
    raise exception 'User % must have at least one verified auth method', v_user_id;
  end if;
  return null;
end;
$$;

-- ── RBAC: Last-Owner protection (Doc 04 §8.3, Doc 07 §5) ─────────
-- Two triggers, not one shared function — BEFORE DELETE on membership_roles
-- and BEFORE UPDATE of memberships.status have different OLD/NEW shapes.

create or replace function assert_owner_remains_on_role_delete() returns trigger
language plpgsql as $$
declare
  v_owner_role_id uuid;
  v_org uuid;
  v_remaining int;
begin
  select id into v_owner_role_id from roles where key = 'owner' and organization_id is null;
  if old.role_id is distinct from v_owner_role_id then
    return old;
  end if;
  select organization_id into v_org from memberships where id = old.membership_id;
  select count(*) into v_remaining
  from membership_roles mr
  join memberships m on m.id = mr.membership_id
  where mr.role_id = v_owner_role_id
    and m.organization_id = v_org
    and m.status = 'active'
    and mr.membership_id <> old.membership_id;
  if v_remaining = 0 then
    raise exception 'Cannot remove the last Owner of organization %', v_org;
  end if;
  return old;
end;
$$;

create or replace function assert_owner_remains_on_membership_suspend() returns trigger
language plpgsql as $$
declare
  v_owner_role_id uuid;
  v_remaining int;
begin
  if new.status = old.status or old.status <> 'active' then
    return new;
  end if;
  select id into v_owner_role_id from roles where key = 'owner' and organization_id is null;
  if not exists (select 1 from membership_roles where membership_id = old.id and role_id = v_owner_role_id) then
    return new;
  end if;
  select count(*) into v_remaining
  from membership_roles mr
  join memberships m on m.id = mr.membership_id
  where mr.role_id = v_owner_role_id
    and m.organization_id = old.organization_id
    and m.status = 'active'
    and m.id <> old.id;
  if v_remaining = 0 then
    raise exception 'Cannot deactivate the last Owner of organization %', old.organization_id;
  end if;
  return new;
end;
$$;

-- ── RBAC: Seed-super-admin protection (Doc 02 §9, Doc 07 §5) ─────

create or replace function protect_seed_platform_role() returns trigger
language plpgsql as $$
begin
  if old.seed then
    raise exception 'Cannot remove the seed platform role assignment (user %, role %)', old.user_id, old.role_id;
  end if;
  return old;
end;
$$;

create or replace function protect_seed_super_admin_user() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and exists (
    select 1 from platform_role_assignments where user_id = old.id and seed = true
  ) then
    raise exception 'Cannot delete the seed super admin user %', old.id;
  end if;
  return new;
end;
$$;

-- ── Active-role switching (2026-07-24) ───────────────────────────

-- Grant: first role ever granted to a membership becomes active
-- automatically. Later grants don't reassign — the member keeps working as
-- whatever role they were already active as; they switch explicitly via the
-- memberships_switch_active_role_self RLS policy.
create or replace function set_active_role_on_first_grant() returns trigger
language plpgsql as $$
begin
  update memberships set active_role_id = new.role_id
  where id = new.membership_id and active_role_id is null;
  return new;
end;
$$;

-- Revoke: if the role being removed was the active one, fall back to
-- another held role (earliest-granted) or null if none remain. Runs AFTER
-- DELETE, so membership_roles_protect_last_owner (BEFORE DELETE, same
-- table) still gets first refusal.
create or replace function reassign_active_role_on_revoke() returns trigger
language plpgsql as $$
declare
  v_next_role_id uuid;
begin
  if not exists (
    select 1 from memberships where id = old.membership_id and active_role_id = old.role_id
  ) then
    return old;
  end if;
  select mr.role_id into v_next_role_id from membership_roles mr
  where mr.membership_id = old.membership_id
  order by mr.granted_at
  limit 1;
  update memberships set active_role_id = v_next_role_id where id = old.membership_id;
  return old;
end;
$$;

-- ── Triggers ──────────────────────────────────────────────────────

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

create trigger users_protect_seed_super_admin
  before update of deleted_at on users
  for each row execute function protect_seed_super_admin_user();

-- >=1 verified auth method per user (Doc 07 §3).
create constraint trigger auth_methods_verified_method_required
  after insert or update or delete on auth_methods
  deferrable initially deferred
  for each row execute function assert_user_has_verified_method();

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

create trigger membership_roles_protect_last_owner
  before delete on membership_roles
  for each row execute function assert_owner_remains_on_role_delete();

create trigger memberships_protect_last_owner
  before update of status on memberships
  for each row execute function assert_owner_remains_on_membership_suspend();

create trigger membership_roles_set_active_on_insert
  after insert on membership_roles
  for each row execute function set_active_role_on_first_grant();

create trigger membership_roles_reassign_active_on_delete
  after delete on membership_roles
  for each row execute function reassign_active_role_on_revoke();

create trigger platform_role_assignments_protect_seed
  before delete on platform_role_assignments
  for each row execute function protect_seed_platform_role();

create trigger enrollments_set_updated_at
  before update on enrollments
  for each row execute function set_updated_at();

create trigger batches_set_updated_at
  before update on batches
  for each row execute function set_updated_at();

create trigger batches_enforce_archive_perm
  before update on batches
  for each row execute function enforce_batch_archive_perm();

create trigger charges_set_updated_at
  before update on charges
  for each row execute function set_updated_at();

create trigger charges_enforce_status_transition
  before update on charges
  for each row execute function enforce_charge_status_transition();

create constraint trigger ledger_entries_balanced
  after insert on ledger_entries
  deferrable initially deferred
  for each row execute function check_ledger_entry_group_balanced();

create trigger face_enrollments_enforce_consent
  before insert on face_enrollments
  for each row execute function enforce_face_enrollment_consent();

create trigger notification_templates_set_updated_at
  before update on notification_templates
  for each row execute function set_updated_at();

create trigger referrals_enforce_attribution
  before update on referrals
  for each row execute function enforce_referral_attribution();

create trigger staff_profiles_set_updated_at
  before update on staff_profiles
  for each row execute function set_updated_at();

create trigger payout_settings_set_updated_at
  before update on payout_settings
  for each row execute function set_updated_at();

create trigger coach_profiles_set_updated_at
  before update on coach_profiles
  for each row execute function set_updated_at();

create trigger coach_pricing_policies_set_updated_at
  before update on coach_pricing_policies
  for each row execute function set_updated_at();
