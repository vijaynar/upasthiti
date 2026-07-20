-- Phase 11 — Marketplace (Doc 07 §11 literal schema for listings/leads/
-- reviews + platform taxonomy/geography reference tables; §15's `referrals`
-- table, folded in here rather than a later "Referrals" phase because this
-- module's own Phase-1 stub comment already scoped it in
-- ("listings, leads, reviews, taxonomy, geography, referrals (M9, Doc 07
-- §11)") and the vision doc (Doc 01) ties referrals directly to the
-- marketplace growth flywheel, not platform billing.
--
-- Interpretive calls, documented here rather than re-derived from memory:
--
-- 1. **No literal Postgres `anon` role.** Doc 07 §11 describes RLS policies
--    for a PostgREST-style `anon` role, but this app's Next.js API layer
--    never authenticates as one — `withRequestContext` always drops to
--    `authenticated` (packages/platform/src/db/index.ts), and there is no
--    other unauthenticated DB session shape anywhere in this codebase.
--    Public/anonymous marketplace reads (search, listing detail, reviews,
--    taxonomy) and the anonymous lead-capture write instead go through
--    `getServiceClient()` with an explicit `status = 'live'` filter in the
--    query text — the exact precedent `resolveOrgBySlug` (Phase 3,
--    tenancy-rbac) already set for "public, pre-session" reads. See
--    SERVICE_ROLE_MANIFEST for the justification entry.
--
-- 2. **One listing per organization**, not Doc 07's implied N — Doc 08 §7
--    names the org-facing route `GET/PATCH /org/listing` (singular), and
--    the PRD's marketplace flow always talks about "the org's listing," so
--    `listings.organization_id` is UNIQUE here. Multi-listing-per-org
--    (e.g. per-branch listings) is not a named v1 requirement.
--
-- 3. **`city_key` gets a real FK to `geo_cities(key)`** — Doc 07's literal
--    snippet leaves it a bare `text` column, but `geo_cities` is a real
--    seeded table in this migration (unlike when the snippet was written),
--    so constraining it is free correctness, matching this project's
--    general bias toward real FKs once the referenced table exists (Phase 7
--    added `coach_assignments.batch_id`'s FK the same way once `batches`
--    existed). `sport_keys`/`area_keys` stay unconstrained `text[]` — array
--    elements can't cheaply FK without a trigger, and no phase has needed
--    that yet.
--
-- 4. **`updated_at` added** to `listings`/`leads`/`reviews`/`referrals`
--    (convention #9, same as every prior phase's mutable-row tables) — none
--    of the four are append-only.
--
-- 5. **Listing publish → live is gated on the org's OWN verification
--    status**, per Doc 02 §9 / PRD US-1 AC5 ("org status stays pending and
--    the marketplace listing stays hidden until platform staff approve").
--    `publishListing()` (marketplace service) sets `status = 'live'`
--    immediately if the org is already `active`, else `pending_verification`.
--    For the case a listing is published BEFORE the org's own verification
--    completes, `activateOrgListings()` promotes any of that org's
--    `pending_verification` listings to `live` — it's wired as a queue
--    consumer of a new `platform.org_verified` event, enqueued by
--    `platform-admin.decideOrganizationVerification()` on approval (Doc 14
--    §2 rule 2: cross-module reactions go through the queue, not a direct
--    table write from platform-admin into marketplace's tables). This is
--    the one small, additive edit this migration's companion code change
--    makes to Phase 5's already-shipped platform-admin service.
--
-- 6. **Referral reward approval is a manual platform action, not an
--    automatic post-subscription trigger.** Doc 07 §15's prose ties the
--    reward to "when the referred org subscribes," but `subscriptions` is
--    schema-only with no real billing wired (Phase 9's own documented gap —
--    finance/src/service.ts's header) — there is no real subscription-
--    succeeded event to consume. `approveReferralReward()` instead takes an
--    explicit `amountMinor` from platform staff (`platform.referral.manage`,
--    a new permission key — Doc 04's catalogue has no referral-specific key
--    at all, same "add one, documented" precedent as Phase 9's
--    `finance.payout.manage`), same posture as Finance's "no gateway
--    configured, manual settlement instead" for payouts.
--
-- 7. **Self/circular referral rejection (US-8 AC2)** is a BEFORE UPDATE
--    trigger on `referrals` (fires on attribution, i.e. `referred_org_id`
--    going from null to non-null) — matches Doc 07 §15's own comment
--    ("trigger checks referrer has no owner-membership in referred org and
--    no reciprocal pending referral"), implemented via a new
--    `is_org_owner()` SECURITY DEFINER helper. WHO may attempt an
--    attribution (RLS: caller must currently be working in the org being
--    attributed AND hold `org.settings.update`, reusing an existing
--    Owner/OrgAdmin-held key rather than inventing a narrow one) and
--    WHETHER the attribution is a valid non-circular referral (the trigger)
--    are deliberately two separate concerns, same split this codebase
--    already uses for e.g. `batches_update_staff` RLS vs
--    `enforce_batch_archive_perm`'s OLD/NEW trigger.
--
-- 8. **Lead-spam mitigation (captcha + rate limit, Doc 08 §10) is NOT
--    built** — this codebase has no captcha vendor integration and no
--    request-IP-tracking infra anywhere to build a real rate limiter on top
--    of, same "designed, not configured" category as Google OAuth/Razorpay/
--    WhatsApp. `submitPublicLead()` validates the listing exists and is
--    live; nothing beyond that guards against abuse. Documented as a known
--    gap, not silently skipped.
--
-- 9. **Taxonomy/geography are seeded directly in this migration** (small,
--    idempotent `insert ... on conflict do nothing` blocks), not deferred
--    to `seed.sql` — same precedent migration 0006 set for the permission
--    catalogue/system roles ("idempotent inserts, versioned by migration —
--    not seed.sql, which is local-fixture-only").

-- ── Platform reference data (no organization_id; read-only to tenants) ──

create table taxonomy_sports (
  key text primary key,
  label text not null,
  category text
);

create table geo_cities (
  key text primary key,
  label text not null,
  state text
);

create table geo_areas (
  key text primary key,
  city_key text not null references geo_cities(key),
  label text not null
);

create index geo_areas_city_key_idx on geo_areas (city_key);

-- ── listings (Doc 07 §11, literal + updated_at + one-per-org) ───────

create table listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id),
  slug text not null unique,
  status text not null default 'draft' check (status in
    ('draft','pending_verification','live','paused','removed')),
  headline text,
  description text,
  content_language text not null default 'en',
  sport_keys text[] not null default '{}',
  city_key text not null references geo_cities(key),
  area_keys text[],
  price_display jsonb,
  media_paths text[],
  featured_until timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- GIN has no default operator class for plain scalar text (city_key) — only
-- for array/jsonb/tsvector types, so this can't be one composite GIN index
-- the way Doc 07 §18's "(city_key, sport_keys GIN)" phrasing might suggest.
-- A btree on city_key + a separate GIN on sport_keys covers the same query
-- shapes (`city_key = $1`, `$2 = any(sport_keys)`).
create index listings_city_key_idx on listings (city_key);
create index listings_sport_keys_idx on listings using gin (sport_keys);
create index listings_search_idx on listings using gin (
  to_tsvector('english', coalesce(headline, '') || ' ' || coalesce(description, ''))
);

-- ── leads (Doc 07 §11, literal + updated_at) ─────────────────────────

create table leads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  organization_id uuid not null references organizations(id),
  contact_name text not null,
  contact_phone text not null,
  message text,
  source text,
  status text not null default 'new' check (status in
    ('new','contacted','trial_scheduled','converted','lost')),
  assigned_to uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_organization_id_idx on leads (organization_id, status);
create index leads_listing_id_idx on leads (listing_id);

-- ── reviews (Doc 07 §11, literal + updated_at) ───────────────────────

create table reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  organization_id uuid not null references organizations(id),
  author_user_id uuid not null references users(id),
  enrollment_id uuid not null references enrollments(id),
  rating int not null check (rating between 1 and 5),
  body text,
  org_response text,
  status text not null default 'published' check (status in ('published','flagged','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, author_user_id)
);

create index reviews_organization_id_idx on reviews (organization_id);
create index reviews_listing_id_idx on reviews (listing_id, status);

-- ── referrals (Doc 07 §15, literal + updated_at + reward tracking) ──
-- `reward_amount_minor`/`completed_at` are additions beyond Doc 07's literal
-- snippet (see header point 6) — same "documented column addition"
-- precedent as `organizations.created_by`/`batches.default_fee_policy_id`.

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references users(id),
  code text not null unique,
  referred_org_id uuid references organizations(id),
  reward_config jsonb not null default '{}',
  reward_amount_minor bigint,
  status text not null default 'created' check (status in
    ('created','attributed','rewarding','completed','rejected')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index referrals_referrer_user_id_idx on referrals (referrer_user_id);
create unique index referrals_referred_org_id_uidx on referrals (referred_org_id) where referred_org_id is not null;

-- ── is_org_owner(): SECURITY DEFINER helper for the referral trigger below
-- and the platform-console owner check nowhere else in this schema needed
-- it yet (has_perm()/is_org_wide_member() already cover "does the caller
-- hold X in THEIR current org" — this is "does an arbitrary user own an
-- arbitrary org," a different shape only the cross-org referral check needs).

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

-- ── enforce_referral_attribution(): self/circular rejection (US-8 AC2) ──
-- Fires only when referred_org_id transitions from null to a value (i.e.
-- the attribution moment), not on every update.

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

create trigger referrals_enforce_attribution
  before update on referrals
  for each row execute function enforce_referral_attribution();

-- ── get_or_create_user_ledger_account() / get_or_create_platform_ledger_account() ──
-- migration 0011's get_or_create_ledger_account(p_org, p_kind) can only ever
-- match org-scoped rows: `organization_id = p_org` is NULL (never true) when
-- p_org is NULL, so it silently can't find/create either a user-owned or a
-- platform-wide account. Referral rewards need both (platform_revenue as
-- the offsetting leg, user_referral as the reward destination), so this
-- migration adds the two missing shapes rather than editing 0011's
-- immutable function.

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

grant execute on function get_or_create_user_ledger_account(uuid, text) to authenticated;
grant execute on function get_or_create_platform_ledger_account(text) to authenticated;

-- ── activate_org_listings(): promotes an org's pending_verification
-- listings to live once the org itself is verified (header point 5). Called
-- from marketplace's service-role activateOrgListings(), not from RLS.

create or replace function activate_org_listings(p_org uuid) returns void
language sql security definer set search_path = public as $$
  update listings set status = 'live', published_at = coalesce(published_at, now())
  where organization_id = p_org and status = 'pending_verification'
$$;

grant execute on function activate_org_listings(uuid) to authenticated;

-- ── RLS: taxonomy_sports / geo_cities / geo_areas ────────────────────
-- Read-only reference data, no org dimension — same "schema + read-only
-- SELECT policy, no write path for authenticated" precedent as org_domains
-- (Phase 3). Public/anonymous reads go through service-role instead (header
-- point 1), so these policies exist for the staff-facing listing editor
-- (picking a sport/city from a dropdown), not for /explore itself.

alter table taxonomy_sports enable row level security;
create policy taxonomy_sports_select_all on taxonomy_sports for select to authenticated using (true);
grant select on taxonomy_sports to authenticated;

alter table geo_cities enable row level security;
create policy geo_cities_select_all on geo_cities for select to authenticated using (true);
grant select on geo_cities to authenticated;

alter table geo_areas enable row level security;
create policy geo_areas_select_all on geo_areas for select to authenticated using (true);
grant select on geo_areas to authenticated;

-- ── RLS: listings ─────────────────────────────────────────────────

alter table listings enable row level security;

create policy listings_select_staff on listings for select to authenticated
  using (organization_id = current_org() and has_perm('market.listing.manage'));

create policy listings_insert_staff on listings for insert to authenticated
  with check (organization_id = current_org() and has_perm('market.listing.manage'));

create policy listings_update_staff on listings for update to authenticated
  using (organization_id = current_org() and has_perm('market.listing.manage'))
  with check (organization_id = current_org() and has_perm('market.listing.manage'));

grant select, insert, update on listings to authenticated;

-- ── RLS: leads ────────────────────────────────────────────────────
-- No self-insert RLS path — the only writer is the anonymous public capture
-- flow (service-role, header point 1 + point 8). Staff read/triage is real
-- RLS.

alter table leads enable row level security;

create policy leads_select_staff on leads for select to authenticated
  using (organization_id = current_org() and has_perm('market.lead.read'));

create policy leads_update_staff on leads for update to authenticated
  using (organization_id = current_org() and has_perm('market.lead.assign'))
  with check (organization_id = current_org() and has_perm('market.lead.assign'));

grant select, update on leads to authenticated;

-- ── RLS: reviews ──────────────────────────────────────────────────
-- Self-service create (verified-student proof via enrollment_id — the
-- EXISTS clause requires the caller's OWN enrollment in the reviewed
-- listing's org, matching Doc 07 §11's "verified-student proof (M9)"
-- comment). Staff response is real RLS on market.review.respond; the
-- policy allows a full row UPDATE rather than column-restricting to
-- org_response — same service-layer trust boundary as every other
-- staff-mutable field in this codebase (e.g. charges' status-transition
-- trigger is the one place that gets real column-level enforcement, not
-- the default).

alter table reviews enable row level security;

create policy reviews_select_org on reviews for select to authenticated
  using (organization_id = current_org());

create policy reviews_insert_self on reviews for insert to authenticated
  with check (
    organization_id = current_org()
    and author_user_id = current_user_id()
    and exists (
      select 1 from enrollments e
      where e.id = enrollment_id
        and e.student_user_id = current_user_id()
        and e.organization_id = current_org()
    )
  );

create policy reviews_update_staff on reviews for update to authenticated
  using (organization_id = current_org() and has_perm('market.review.respond'))
  with check (organization_id = current_org() and has_perm('market.review.respond'));

grant select, insert, update on reviews to authenticated;

-- ── RLS: referrals ────────────────────────────────────────────────
-- Create/read are identity-level self-service (any user may refer, Doc 04
-- §4 "any user" — no permission gate, same shape as notification_preferences).
-- Attribution (referred_org_id null -> value) requires the caller to be
-- currently working in the target org and hold org.settings.update
-- (header point 7) — reused rather than a new permission key since the
-- catalogue's grant-authority table already restricts that key to
-- Owner/Org Admin, exactly who should be able to attribute a referral code
-- to their own org.

alter table referrals enable row level security;

create policy referrals_select_self on referrals for select to authenticated
  using (referrer_user_id = current_user_id());

-- Postgres ANDs a table's SELECT policy onto UPDATE row visibility in
-- addition to the UPDATE policy's own USING clause (verified via EXPLAIN
-- while smoke-testing this migration — not documented prominently, but
-- real: an UPDATE's target row must satisfy an applicable SELECT policy too
-- when one exists on the table). Attribution is inherently cross-actor —
-- the party attributing a code is never the referrer who created it — so
-- referrals_select_self alone makes attributeReferral() structurally
-- impossible (the referred party can never even see the row to update it).
-- This policy grants read of exactly the un-attributed shape a "redeem this
-- code" lookup needs (id/referrer/code/status only matter pre-attribution,
-- no financial data attaches to a referral until it completes).
create policy referrals_select_unattributed on referrals for select to authenticated
  using (referred_org_id is null);

-- Same reasoning one step further: Postgres ANDs a SELECT policy onto the
-- WITH CHECK validation of the NEW row too (the post-attribution row must
-- itself satisfy an applicable SELECT policy, or the UPDATE raises a real
-- 42501 rather than silently affecting zero rows — confirmed empirically
-- while smoke-testing). Once attributed, referred_org_id is no longer null
-- (so referrals_select_unattributed stops matching) and the attributing
-- party is never the referrer (so referrals_select_self doesn't match
-- either) — without this policy attributeReferral() would always fail its
-- own WITH CHECK. Mirrors the WITH CHECK's own condition exactly.
create policy referrals_select_referred_org on referrals for select to authenticated
  using (referred_org_id = current_org() and has_perm('org.settings.update'));

create policy referrals_insert_self on referrals for insert to authenticated
  with check (referrer_user_id = current_user_id() and referred_org_id is null);

create policy referrals_update_attribution on referrals for update to authenticated
  using (referred_org_id is null)
  with check (referred_org_id = current_org() and has_perm('org.settings.update'));

grant select, insert, update on referrals to authenticated;

-- ── Seed: platform taxonomy/geography (header point 9) ───────────────
-- Small v1 bootstrap set, India-first per Doc 01's locked v1 region — real
-- content growth (more sports/cities/areas) is an ops/content task, not a
-- schema change.

insert into taxonomy_sports (key, label, category) values
  ('swimming', 'Swimming', 'aquatics'),
  ('football', 'Football', 'team_sports'),
  ('cricket', 'Cricket', 'team_sports'),
  ('basketball', 'Basketball', 'team_sports'),
  ('badminton', 'Badminton', 'racquet_sports'),
  ('tennis', 'Tennis', 'racquet_sports'),
  ('chess', 'Chess', 'mind_sports'),
  ('yoga', 'Yoga', 'fitness'),
  ('dance', 'Dance', 'performing_arts'),
  ('music', 'Music', 'performing_arts'),
  ('athletics', 'Athletics', 'track_and_field'),
  ('martial_arts', 'Martial Arts', 'combat_sports')
on conflict (key) do nothing;

insert into geo_cities (key, label, state) values
  ('bengaluru', 'Bengaluru', 'Karnataka'),
  ('mumbai', 'Mumbai', 'Maharashtra'),
  ('delhi', 'Delhi', 'Delhi'),
  ('hyderabad', 'Hyderabad', 'Telangana'),
  ('chennai', 'Chennai', 'Tamil Nadu'),
  ('pune', 'Pune', 'Maharashtra')
on conflict (key) do nothing;

insert into geo_areas (key, city_key, label) values
  ('bengaluru-koramangala', 'bengaluru', 'Koramangala'),
  ('bengaluru-indiranagar', 'bengaluru', 'Indiranagar'),
  ('bengaluru-whitefield', 'bengaluru', 'Whitefield'),
  ('mumbai-andheri', 'mumbai', 'Andheri'),
  ('mumbai-bandra', 'mumbai', 'Bandra'),
  ('delhi-dwarka', 'delhi', 'Dwarka'),
  ('hyderabad-gachibowli', 'hyderabad', 'Gachibowli'),
  ('chennai-adyar', 'chennai', 'Adyar'),
  ('pune-kothrud', 'pune', 'Kothrud')
on conflict (key) do nothing;

-- ── New permission key: platform.referral.manage (header point 6) ───

insert into permissions (key) values ('platform.referral.manage')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_key)
select r.id, x.permission_key
from (values
  ('super_admin','platform.referral.manage'),
  ('platform_finance','platform.referral.manage')
) as x(role_key, permission_key)
join roles r on r.key = x.role_key and r.scope = 'platform'
on conflict (role_id, permission_key) do nothing;
