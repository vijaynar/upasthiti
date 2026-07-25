-- Abhyas V2 — Single active org role per membership (2026-07-24).
--
-- Prior behaviour (migration 0006): has_perm()/has_perm_branch() unioned
-- permissions across every role a membership held (Doc 04 §12's literal
-- signature). A membership holding both Owner and Coach (e.g. the
-- independent_coach bootstrap grant, this migration's own
-- createOrganization comment) therefore had Owner-level access at all
-- times, with no way to work "as Coach only" — surfaced as a UI bug report
-- (AppShell showing "OWNER, COACH" with no explanation of why a single
-- login could hold both simultaneously). This migration adds a genuine
-- single active-role concept: a membership may HOLD several roles
-- (membership_roles is unchanged, still many-to-many) but only ONE is
-- ACTIVE at a time, and has_perm()/has_perm_branch() are rescoped to check
-- only that role. Switching is a plain UPDATE the member makes on their own
-- membership row (RLS-gated below), not a new login/session concept — Doc
-- 05 §6's "roles are resolved per-request from the DB, never from the JWT"
-- still holds (see packages/kernel/src/session.ts), this just adds one more
-- per-request DB fact to resolve.

-- ── Schema ────────────────────────────────────────────────────
-- Nullable: a brand-new membership has no roles yet (chicken-and-egg,
-- same as membership_roles itself before the bootstrap grant runs).
alter table memberships add column active_role_id uuid;

-- Backfill existing memberships (pre-dates this migration) to their
-- earliest-granted held role, so has_perm() doesn't go dark for every
-- existing user the moment this migration lands.
update memberships m set active_role_id = (
  select mr.role_id from membership_roles mr
  where mr.membership_id = m.id
  order by mr.granted_at
  limit 1
)
where active_role_id is null;

-- Guarantees active_role_id, whenever set, is always a role this exact
-- membership actually holds — composite FK against membership_roles' own
-- PK (membership_id, role_id). NULL active_role_id skips the check
-- (Postgres MATCH SIMPLE default), which is exactly the "no roles yet"
-- state this column allows.
alter table memberships
  add constraint memberships_active_role_fkey
  foreign key (id, active_role_id) references membership_roles (membership_id, role_id);

-- ── Keep active_role_id in sync with what's actually held ────────
-- Grant: first role ever granted to a membership becomes active
-- automatically (no explicit "choose a role" step needed for the common
-- single-role case). Later grants don't reassign — the member keeps
-- working as whatever role they were already active as; they switch
-- explicitly via the UPDATE policy below.
create or replace function set_active_role_on_first_grant() returns trigger
language plpgsql as $$
begin
  update memberships set active_role_id = new.role_id
  where id = new.membership_id and active_role_id is null;
  return new;
end;
$$;

create trigger membership_roles_set_active_on_insert
  after insert on membership_roles
  for each row execute function set_active_role_on_first_grant();

-- Revoke: if the role being removed was the active one, fall back to
-- another held role (earliest-granted) or null if none remain. Runs AFTER
-- DELETE, so migration 0006's membership_roles_protect_last_owner (a
-- BEFORE DELETE trigger on the same table) still gets first refusal — this
-- only ever fires for deletes that already succeeded.
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

create trigger membership_roles_reassign_active_on_delete
  after delete on membership_roles
  for each row execute function reassign_active_role_on_revoke();

-- ── Rescope has_perm()/has_perm_branch() to the active role only ────
-- Same signature/callers as migration 0006 (RLS policies across every
-- later migration call these by name) — only the join changes, from "any
-- held role" to "the one active role".
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

-- ── Self-service role switch ─────────────────────────────────────
-- Mirrors memberships_leave_self's shape (migration 0004): a permissive
-- USING clause scoped to the caller's own row, a WITH CHECK that pins down
-- what the new row is allowed to look like, and a column-level GRANT below
-- that's the real lock — WITH CHECK alone can't stop the same UPDATE from
-- also touching other columns.
create policy memberships_switch_active_role_self on memberships for update
  using (user_id = current_user_id())
  with check (
    user_id = current_user_id()
    and exists (
      select 1 from membership_roles mr
      where mr.membership_id = memberships.id and mr.role_id = memberships.active_role_id
    )
  );

grant update (active_role_id) on memberships to authenticated;
