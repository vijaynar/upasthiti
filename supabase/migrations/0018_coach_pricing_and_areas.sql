-- Abhyas V2 — Coach student-facing pricing + service areas + avatars bucket.
--
-- Context: 0016_coach_profiles.sql deliberately left per-coach pricing
-- unbuilt ("Finance's fee_policies are batch/program-scoped, which is the
-- real V2 pricing mechanism. Inventing a parallel per-coach pricing table
-- here would be new, undiscussed scope"). Product has since asked for the
-- V1 field set explicitly (multiple simultaneous pricing strategies a coach
-- picks during onboarding — monthly/per-class/package/trial/fine/one-time),
-- which fee_policies' single-kind-per-row model can't represent. This is
-- that "new, undiscussed scope" — now discussed — mirroring V1's
-- coach_pricing_policies/coach_pricing_rules tables (migrations_v1_legacy/
-- 0002_core_schema.sql) onto coach_profiles' org/self+staff RLS shape.
--
-- Service areas: Tier 1 only (geo_areas.key array on coach_profiles, same
-- convention as sport_keys/age_groups on that table). V1's Tier 2
-- ("communities" — apartment complexes, Google-Places-backed) has no V2
-- equivalent and isn't built here — a real new table + search/dedup
-- endpoints, not a rewire.

alter table coach_profiles
  add column service_area_keys text[] not null default '{}',
  add column allow_student_overrides boolean not null default false;

create table coach_pricing_policies (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references coach_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  policy_type text not null check (policy_type in (
    'monthly_subscription', 'per_class', 'package', 'trial_session', 'fine_based', 'one_time_registration'
  )),
  enabled boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_profile_id, policy_type)
);

create index coach_pricing_policies_coach_profile_id_idx on coach_pricing_policies (coach_profile_id);
create unique index coach_pricing_policies_one_default_idx on coach_pricing_policies (coach_profile_id) where is_default;

create trigger coach_pricing_policies_set_updated_at
  before update on coach_pricing_policies
  for each row execute function set_updated_at();

-- One row per policy, except 'package' which can have several (tiers) —
-- same shape as V1's coach_pricing_rules. Amounts stay decimal rupees (not
-- *_minor) to match V1's PaymentPricingStep.tsx exactly, which this reuses
-- unmodified — this table is coach-facing onboarding data, not a ledger
-- entry, so it doesn't need fee_policies' minor-unit precision convention.
create table coach_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references coach_pricing_policies(id) on delete cascade,
  amount numeric(10,2) not null default 0 check (amount >= 0),
  currency text not null default 'INR',

  -- Monthly Subscription
  billing_cycle text check (billing_cycle in ('Weekly', 'Monthly', 'Quarterly', 'Yearly')),
  auto_renew boolean,
  late_fee_amount numeric(10,2) check (late_fee_amount >= 0),
  late_fee_grace_days int check (late_fee_grace_days >= 0),

  -- Per Class
  cancellation_window_hours int check (cancellation_window_hours >= 0),
  min_booking_count int check (min_booking_count >= 1),

  -- Class Packages
  class_count int check (class_count >= 1),

  -- Trial Session
  trial_type text check (trial_type in ('free', 'paid')),

  -- Fine-Based (Attendance-Linked)
  late_arrival_fee_amount numeric(10,2) check (late_arrival_fee_amount >= 0),
  late_arrival_threshold_minutes int check (late_arrival_threshold_minutes >= 0),
  absence_fee_amount numeric(10,2) check (absence_fee_amount >= 0),

  created_at timestamptz not null default now()
);

create index coach_pricing_rules_policy_id_idx on coach_pricing_rules (policy_id);

-- ── RLS: coach_pricing_policies/rules (mirrors coach_profiles' self+staff shape) ──

alter table coach_pricing_policies enable row level security;

create policy coach_pricing_policies_select_self on coach_pricing_policies for select to authenticated
  using (coach_profile_id in (select id from coach_profiles where user_id = current_user_id()));

create policy coach_pricing_policies_select_staff on coach_pricing_policies for select to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.staff.read', (select branch_id from coach_profiles where id = coach_pricing_policies.coach_profile_id)));

create policy coach_pricing_policies_write_self on coach_pricing_policies for all to authenticated
  using (coach_profile_id in (select id from coach_profiles where user_id = current_user_id()))
  with check (coach_profile_id in (select id from coach_profiles where user_id = current_user_id()));

create policy coach_pricing_policies_write_staff on coach_pricing_policies for all to authenticated
  using (organization_id = current_org() and has_perm_branch('hr.staff.onboard', (select branch_id from coach_profiles where id = coach_pricing_policies.coach_profile_id)))
  with check (organization_id = current_org() and has_perm_branch('hr.staff.onboard', (select branch_id from coach_profiles where id = coach_pricing_policies.coach_profile_id)));

grant select, insert, update, delete on coach_pricing_policies to authenticated;

alter table coach_pricing_rules enable row level security;

create policy coach_pricing_rules_select on coach_pricing_rules for select to authenticated
  using (policy_id in (
    select p.id from coach_pricing_policies p
    where p.coach_profile_id in (select id from coach_profiles where user_id = current_user_id())
       or (p.organization_id = current_org() and has_perm_branch('hr.staff.read', (select branch_id from coach_profiles where id = p.coach_profile_id)))
  ));

create policy coach_pricing_rules_write on coach_pricing_rules for all to authenticated
  using (policy_id in (
    select p.id from coach_pricing_policies p
    where p.coach_profile_id in (select id from coach_profiles where user_id = current_user_id())
       or (p.organization_id = current_org() and has_perm_branch('hr.staff.onboard', (select branch_id from coach_profiles where id = p.coach_profile_id)))
  ))
  with check (policy_id in (
    select p.id from coach_pricing_policies p
    where p.coach_profile_id in (select id from coach_profiles where user_id = current_user_id())
       or (p.organization_id = current_org() and has_perm_branch('hr.staff.onboard', (select branch_id from coach_profiles where id = p.coach_profile_id)))
  ));

grant select, insert, update, delete on coach_pricing_rules to authenticated;

-- ── Avatars bucket — public read (marketplace listing photos), same
-- convention V1 used. Upload still requires a signed URL issued by our own
-- session-checked API (packages/platform/src/storage), not a bare anon-key
-- client write — "zero public buckets" (storage/index.ts) is relaxed only
-- for this bucket's READ side, which is meant to be public regardless.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
