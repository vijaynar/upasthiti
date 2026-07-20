-- Abhyas V2 — Finance & Ledger: fee_policies, charges, payments,
-- payment_allocations, ledger_accounts, ledger_entries, payouts,
-- org_bank_accounts (Doc 07 §9, literal schema + the accounting-truth
-- constraint-trigger pairing its prose calls out). Also wires up
-- `finance.assessFine()` as the real consumer of `attendance.absence_confirmed`
-- (Doc 14 §2 rule 2), emitted-but-unconsumed since Phase 8. See
-- IMPLEMENTATION_STATUS.md's Phase 9 section for the scope pointer.
--
-- Scope decisions (2026-07-20):
--   * `batches.default_fee_policy_id` (Doc 07 §21.3, otherwise a later
--     wireframe follow-up) is folded in now, not deferred — without it
--     there is no path from an attendance-triggered absence back to "which
--     fee_policy's fine rules apply to this student", which `assessFine()`
--     needs to do anything at all. The rest of §21.3 (packages, trials,
--     registration kinds, `enrollment_fee_overrides`, `package_balances`)
--     is NOT built — none of it is required for this phase's named
--     deliverables (fee policies, charges, payment recording, proof
--     approval, refunds, payouts, `assessFine()`), same "schema follows the
--     module that needs it" precedent as every prior phase's deferred
--     §21.x pieces.
--   * `fine_policy` jsonb (Doc 07 §9's own comment: "late-fee rules: grace
--     days, flat/percent, cap") is genuinely underspecified for this
--     phase's OTHER fine concept: Doc 14 §2 names `finance.assessFine()` as
--     the consumer of `attendance.absence_confirmed`, but no doc gives that
--     function's fine-amount shape. Rather than add a second table/column
--     for a concept the docs never structurally separated, this migration
--     reuses `fee_policies.fine_policy` for both, keyed apart:
--     `{ lateFee: { graceDays, flatMinor?, percentBp?, capMinor? },
--        absenceFine: { amountMinor } }`. `assessFine()` (service layer)
--     no-ops when a batch's `default_fee_policy_id` is unset or its
--     `fine_policy.absenceFine` is absent — an org that hasn't configured
--     an absence fine amount never gets auto-charged, the same
--     never-fine-without-explicit-signal posture Attendance's US-3 AC2
--     already established for face-match confidence.
--   * Automated recurring charge generation (what `fee_policies.kind in
--     ('recurring_monthly','recurring_term')` implies on a schedule) is NOT
--     built — IMPLEMENTATION_STATUS.md's Phase 9 scope names fee policies,
--     charges, payment recording, proof approval, refunds, and payouts as
--     the deliverables, not a billing cron (unlike Scheduling's explicitly
--     named "rolling 30-day window" job or Attendance's two named
--     background jobs). Charges are staff-created (`createCharge`) this
--     phase; a scheduled generator is a real, deliberate gap for a later
--     phase (Notifications is the natural place to also drive fee
--     reminders off it).
--   * `payments.method = 'gateway'` stays in the literal CHECK constraint
--     (schema-complete per Doc 07 §9) but has NO RLS insert path and no
--     service function this phase — `packages/platform/src/payments` is
--     still a typed interface only (Phase 1), no Razorpay account exists to
--     configure it against, same "designed, not wired" precedent as Phase
--     2's Google OAuth. The three real v1 payment methods —
--     `manual_proof`/`cash`/`waiver` — need no gateway and are fully built.
--   * Doc 04 §5's "Payouts & ledger" row shows Owner ✅, Org Admin 👁, and
--     Accountant ✅ all under ONE seeded key, `finance.payout.read` — no
--     existing permission distinguishes "can request/settle a payout" from
--     "can only view one", and `org.billing.manage` (the obvious reuse
--     candidate) doesn't fit either: Owner holds it, Accountant doesn't,
--     but the matrix wants both at full access. Added `finance.payout.manage`
--     (Owner + Accountant) here, same category as migration 0006's own
--     `people.join_request.read`/`finance.proof.submit` additions — the
--     matrix needs finer granularity than its literal catalogue lists.
--   * `charges.status` transitions to `'paid'`/`'waived'`/`'refunded'` each
--     require a DIFFERENT permission than the base
--     `finance.charge.create`/`.waive` RLS gate can express in one WITH
--     CHECK clause (can't compare OLD vs NEW status there) — a BEFORE
--     UPDATE trigger, `enforce_charge_status_transition()`, gates each
--     transition individually. Same shape as migration 0009's
--     `enforce_batch_archive_perm()`; the current seed happens to grant all
--     four finance permissions to the same roles together, so this doesn't
--     change behavior today, but Doc 04 §5 treats "Charges & payments" and
--     "Proof approval / waivers / refunds" as separate matrix rows and a
--     future role split shouldn't require touching this trigger.
--   * `ledger_entries`/`ledger_accounts` get NO write grant to
--     `authenticated` at all (Doc 07 §9's literal invariant: "no
--     UPDATE/DELETE grants on ledger_entries to any role including service
--     paths") — the only insert path is `post_ledger_entries()`, a
--     SECURITY DEFINER function mirroring migration 0007's
--     `write_audit_log()` exactly: any RLS-scoped finance write (payment
--     succeeding, refund issuing, payout settling) calls it from inside its
--     own `withRequestContext` transaction rather than needing service-role
--     escalation for routine work. A deferred constraint trigger,
--     `check_ledger_entry_group_balanced()`, is the actual DB-enforced
--     "sum(entry_group) = 0" invariant Doc 07 §9 calls out by name — the
--     one true accounting-safety guarantee that must hold regardless of any
--     application bug, so unlike the charges/payments status-transition
--     rules above (service-layer trust boundary, same precedent as
--     Attendance's append-only corrections) this gets real PL/pgSQL
--     enforcement.
--   * `get_or_create_ledger_account()` is also SECURITY DEFINER + grant
--     execute — every finance write needs an org's `org_receivable`/
--     `org_cash` account to exist without a separate org-bootstrap step;
--     idempotent get-or-create keeps this a no-op after the first call.
--   * `assessFine()` (service layer, not a SQL function — this codebase
--     keeps business logic in service.ts and reserves PL/pgSQL for
--     RLS-adjacent invariants, migration 0009's own precedent) runs as a
--     service-role background-job consumer of `attendance.absence_confirmed`
--     (added to SERVICE_ROLE_MANIFEST) — no caller session exists to scope
--     RLS to when a queue worker processes the event, same category as
--     every other module's background jobs.

-- ── fee_policies (Doc 07 §9, literal) ─────────────────────────────
create table fee_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  kind text not null check (kind in ('recurring_monthly','recurring_term','one_time','per_session')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null default 'INR',
  fine_policy jsonb,        -- { lateFee?: {...}, absenceFine?: {...} } — see header
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);

create index fee_policies_organization_id_idx on fee_policies (organization_id, status);

alter table batches add column default_fee_policy_id uuid references fee_policies(id);

-- ── charges (Doc 07 §9, literal) ──────────────────────────────────
create table charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  enrollment_id uuid not null references enrollments(id),
  fee_policy_id uuid references fee_policies(id),
  kind text not null check (kind in ('fee','fine','adjustment')),
  description text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  due_on date not null,
  status text not null default 'open' check (status in
    ('open','pending_verification','paid','waived','cancelled','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger charges_set_updated_at
  before update on charges
  for each row execute function set_updated_at();

create index charges_organization_id_idx on charges (organization_id, branch_id, status);
create index charges_enrollment_id_idx on charges (enrollment_id, status);

-- ── payments (Doc 07 §9, literal) ─────────────────────────────────
create table payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  payer_user_id uuid not null references users(id),
  method text not null check (method in ('gateway','manual_proof','cash','waiver')),
  gateway_ref text,
  proof_path text,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  status text not null default 'initiated' check (status in
    ('initiated','pending_verification','succeeded','failed','rejected','refunded')),
  verified_by uuid references users(id),
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create index payments_organization_id_idx on payments (organization_id, status);
create index payments_payer_user_id_idx on payments (payer_user_id);

-- ── payment_allocations (Doc 07 §9, literal) ──────────────────────
create table payment_allocations (
  payment_id uuid not null references payments(id),
  charge_id uuid not null references charges(id),
  amount_minor bigint not null check (amount_minor > 0),
  primary key (payment_id, charge_id)
);

create index payment_allocations_charge_id_idx on payment_allocations (charge_id);

-- ── ledger_accounts (Doc 07 §9, literal) ──────────────────────────
create table ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),  -- null = platform account
  owner_user_id uuid references users(id),             -- set for user accounts (referral earnings)
  kind text not null check (kind in ('org_receivable','org_cash','org_payout',
    'platform_revenue','platform_fees','user_referral','gateway_clearing')),
  currency char(3) not null default 'INR',
  created_at timestamptz not null default now()
);

-- One account per (org, kind) for org-scoped kinds; one per kind platform-wide
-- (organization_id and owner_user_id both null); one per (user, kind) for
-- referral-style user accounts. get_or_create_ledger_account() relies on
-- these being the only three shapes.
create unique index ledger_accounts_org_kind_uidx on ledger_accounts (organization_id, kind)
  where organization_id is not null and owner_user_id is null;
create unique index ledger_accounts_platform_kind_uidx on ledger_accounts (kind)
  where organization_id is null and owner_user_id is null;
create unique index ledger_accounts_user_kind_uidx on ledger_accounts (owner_user_id, kind)
  where owner_user_id is not null;

-- ── ledger_entries (Doc 07 §9, literal, append-only) ──────────────
create table ledger_entries (
  id uuid not null default gen_random_uuid(),
  entry_group uuid not null,
  account_id uuid not null references ledger_accounts(id),
  organization_id uuid,      -- denormalized for RLS + partition pruning
  amount_minor bigint not null,
  currency char(3) not null,
  ref_type text not null check (ref_type in ('payment','charge','payout','refund','referral','subscription')),
  ref_id uuid not null,
  occurred_at timestamptz not null default now(),
  primary key (id, occurred_at)
);

create index ledger_entries_entry_group_idx on ledger_entries (entry_group);
create index ledger_entries_organization_id_idx on ledger_entries (organization_id, occurred_at);
create index ledger_entries_account_id_idx on ledger_entries (account_id, occurred_at);

-- Doc 07 §9: "sum(entry_group) must = 0" — the real accounting-truth
-- invariant, enforced regardless of which application code path wrote the
-- rows (see header: this is the one place PL/pgSQL enforcement matters more
-- than the service-layer trust boundary this codebase otherwise relies on).
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

create constraint trigger ledger_entries_balanced
  after insert on ledger_entries
  deferrable initially deferred
  for each row execute function check_ledger_entry_group_balanced();

-- ── payouts (Doc 07 §9, literal) ──────────────────────────────────
create table org_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  account_holder_name text not null,
  bank_name text not null,
  account_last4 text not null,       -- display only — raw account numbers never stored (Doc 13 §9)
  gateway_token text,                -- opaque tokenized reference once a gateway is configured
  created_at timestamptz not null default now()
);

create index org_bank_accounts_organization_id_idx on org_bank_accounts (organization_id);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null default 'INR',
  gateway_ref text,
  bank_account_id uuid references org_bank_accounts(id),
  status text not null default 'pending' check (status in
    ('pending','processing','settled','failed','reversed')),
  period_start date,
  period_end date,
  created_at timestamptz not null default now()
);

create index payouts_organization_id_idx on payouts (organization_id, status);

-- ── get_or_create_ledger_account() ────────────────────────────────
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

-- ── post_ledger_entries(): the ONLY insert path into ledger_entries ──
-- p_entries: jsonb array of {accountId, amountMinor, currency, refType, refId}.
-- Mirrors write_audit_log()'s shape (migration 0007) — SECURITY DEFINER so
-- `authenticated` never needs a direct grant, callable from any
-- withRequestContext transaction. Balance is re-validated here too (fast,
-- friendly error) in addition to the constraint trigger (the real guarantee).
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

-- ── RLS: fee_policies ──────────────────────────────────────────────
alter table fee_policies enable row level security;

-- Doc 04 §5 "Fee policies & fines": Owner/Org Admin/Accountant ✅ (all hold
-- finance.policy.manage), Branch Admin 👁-only with no dedicated read key —
-- reuses org.settings.read (the same key already backs Branch Admin's 👁 on
-- the "Org settings & branding" row), an interpretive call in the same
-- category as this migration's other permission-reuse notes.
create policy fee_policies_select_finance on fee_policies for select
  using (organization_id = current_org() and (has_perm('finance.policy.manage') or has_perm('org.settings.read')));

create policy fee_policies_insert_finance on fee_policies for insert
  with check (organization_id = current_org() and has_perm('finance.policy.manage'));

create policy fee_policies_update_finance on fee_policies for update
  using (organization_id = current_org() and has_perm('finance.policy.manage'))
  with check (organization_id = current_org() and has_perm('finance.policy.manage'));

grant select, insert, update on fee_policies to authenticated;

-- ── RLS: charges ───────────────────────────────────────────────────
alter table charges enable row level security;

-- Staff read (Doc 04 §5: Coach "🔷 own batches 👁", Front Desk "🔷 branch 👁"
-- are both narrower than what finance.charge.read's branch-scoped grant
-- alone expresses — same "branch-scoped permission is sufficient at the RLS
-- layer, narrower scoping is an app-layer/UI concern" precedent migrations
-- 0008/0009/0010 already established for Coach's "own batches").
create policy charges_select_staff on charges for select
  using (organization_id = current_org() and has_perm_branch('finance.charge.read', branch_id));

create policy charges_select_self on charges for select
  using (exists (select 1 from enrollments e where e.id = charges.enrollment_id and e.student_user_id = current_user_id()));

create policy charges_select_guardian on charges for select
  using (exists (select 1 from enrollments e where e.id = charges.enrollment_id and is_my_ward(e.student_user_id, e.organization_id)));

create policy charges_insert_staff on charges for insert
  with check (organization_id = current_org() and has_perm_branch('finance.charge.create', branch_id));

-- Any finance-permission holder may attempt the UPDATE; the trigger below
-- gates which STATUS transition each of them may actually make (see header).
create policy charges_update_staff on charges for update
  using (
    organization_id = current_org()
    and (
      has_perm_branch('finance.charge.create', branch_id)
      or has_perm_branch('finance.charge.waive', branch_id)
      or has_perm_branch('finance.proof.approve', branch_id)
      or has_perm_branch('finance.refund.issue', branch_id)
    )
  )
  with check (
    organization_id = current_org()
    and (
      has_perm_branch('finance.charge.create', branch_id)
      or has_perm_branch('finance.charge.waive', branch_id)
      or has_perm_branch('finance.proof.approve', branch_id)
      or has_perm_branch('finance.refund.issue', branch_id)
    )
  );

grant select, insert, update on charges to authenticated;

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

create trigger charges_enforce_status_transition
  before update on charges
  for each row execute function enforce_charge_status_transition();

-- ── RLS: payments ──────────────────────────────────────────────────
alter table payments enable row level security;

-- No branch_id on payments (a single payment can settle charges across
-- branches via payment_allocations) — staff read is org-wide for any
-- finance.charge.read holder. Front Desk's "🔷 branch" narrowing (Doc 04
-- §5) is an app-layer/UI concern here, same precedent as charges' staff
-- read policy above.
create policy payments_select_staff on payments for select
  using (organization_id = current_org() and has_perm('finance.charge.read'));

create policy payments_select_self on payments for select
  using (payer_user_id = current_user_id());

-- Self-serve proof submission (parent/student) or staff proof intake (Front
-- Desk et al, finance.proof.submit) or staff-recorded cash/waiver
-- (finance.payment.record) — 'gateway' is deliberately excluded (see
-- header: schema-complete, not wired this phase).
create policy payments_insert on payments for insert
  with check (
    organization_id = current_org()
    and (
      (payer_user_id = current_user_id() and method = 'manual_proof')
      or (method = 'manual_proof' and has_perm('finance.proof.submit'))
      or (method in ('cash','waiver') and has_perm('finance.payment.record'))
    )
  );

create policy payments_update_staff on payments for update
  using (organization_id = current_org() and has_perm('finance.proof.approve'))
  with check (organization_id = current_org() and has_perm('finance.proof.approve'));

grant select, insert, update on payments to authenticated;

-- ── RLS: payment_allocations ───────────────────────────────────────
alter table payment_allocations enable row level security;

create policy payment_allocations_select on payment_allocations for select
  using (
    exists (
      select 1 from payments p
      where p.id = payment_allocations.payment_id
        and (p.payer_user_id = current_user_id() or (p.organization_id = current_org() and has_perm('finance.charge.read')))
    )
  );

-- Written the moment a payment becomes 'succeeded' — either the instant-cash
-- path (finance.payment.record) or the proof-approval path (finance.proof.approve).
create policy payment_allocations_insert on payment_allocations for insert
  with check (
    exists (
      select 1 from payments p
      where p.id = payment_allocations.payment_id
        and p.organization_id = current_org()
        and (has_perm('finance.payment.record') or has_perm('finance.proof.approve'))
    )
  );

grant select, insert on payment_allocations to authenticated;

-- ── RLS: ledger_accounts / ledger_entries ─────────────────────────
alter table ledger_accounts enable row level security;

create policy ledger_accounts_select_org on ledger_accounts for select
  using (organization_id = current_org() and has_perm('finance.ledger.read'));

-- Platform-wide accounts (organization_id is null) — no dedicated
-- platform.ledger.* key exists (Doc 04 §5's platform matrix bundles
-- "Subscriptions, platform ledger, payouts" into one row); reuses
-- platform.subscription.manage, same interpretive-reuse category as this
-- file's other notes.
create policy ledger_accounts_select_platform on ledger_accounts for select
  using (organization_id is null and has_platform_perm('platform.subscription.manage'));

grant select on ledger_accounts to authenticated;
grant execute on function get_or_create_ledger_account(uuid, text) to authenticated;

alter table ledger_entries enable row level security;

create policy ledger_entries_select_org on ledger_entries for select
  using (organization_id = current_org() and has_perm('finance.ledger.read'));

create policy ledger_entries_select_platform on ledger_entries for select
  using (organization_id is null and has_platform_perm('platform.subscription.manage'));

-- No insert/update/delete grant for `authenticated` at all (Doc 07 §9's
-- literal invariant) — post_ledger_entries() is SECURITY DEFINER and
-- bypasses RLS for its own insert.
grant select on ledger_entries to authenticated;
grant execute on function post_ledger_entries(jsonb) to authenticated;

-- ── RLS: org_bank_accounts / payouts ──────────────────────────────
alter table org_bank_accounts enable row level security;

create policy org_bank_accounts_select on org_bank_accounts for select
  using (organization_id = current_org() and has_perm('finance.payout.manage'));

create policy org_bank_accounts_insert on org_bank_accounts for insert
  with check (organization_id = current_org() and has_perm('finance.payout.manage'));

grant select, insert on org_bank_accounts to authenticated;

alter table payouts enable row level security;

create policy payouts_select on payouts for select
  using (organization_id = current_org() and has_perm('finance.payout.read'));

create policy payouts_insert on payouts for insert
  with check (organization_id = current_org() and has_perm('finance.payout.manage'));

create policy payouts_update on payouts for update
  using (organization_id = current_org() and has_perm('finance.payout.manage'))
  with check (organization_id = current_org() and has_perm('finance.payout.manage'));

grant select, insert, update on payouts to authenticated;

-- ── Permission catalogue addendum (see header) ────────────────────
insert into permissions (key) values ('finance.payout.manage') on conflict do nothing;

insert into role_permissions (role_id, permission_key)
select r.id, x.permission_key from (values
  ('owner', 'finance.payout.manage'),
  ('accountant', 'finance.payout.manage')
) as x(role_key, permission_key)
join roles r on r.key = x.role_key and r.organization_id is null
on conflict do nothing;
