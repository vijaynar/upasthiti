-- Abhyas V2 — Core schema: all tables, dependency-ordered, inline constraints.
--
-- Consolidated from the original 24-file migration history (0001-0024) into
-- a minimal set for a fresh Supabase project — no historical churn (columns
-- added then dropped, constraints altered then re-altered, policies dropped
-- and replaced by a later phase). Each table below reflects its FINAL shape
-- across the whole history. See git history / IMPLEMENTATION_STATUS.md for
-- the phase-by-phase narrative if archaeology is ever needed.
--
-- Triggers and RLS policies are NOT here — see 0004_functions_triggers.sql
-- (functions must exist before any trigger referencing them) and
-- 0005_security.sql (RLS + grants + storage buckets).

-- ── Background job queue (platform/queue adapter, Doc 14 §7-§8) ─────
-- Postgres-backed queue: claimed with `FOR UPDATE SKIP LOCKED`, exponential
-- backoff, dead-letter after 5 attempts. Touched only by apps/worker via the
-- service-role client. RLS is enabled with zero policies: default-deny for
-- the anon/authenticated API path.
create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}',
  idempotency_key text unique,
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  locked_by text,
  locked_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

-- ── Identity core (Doc 07 §3, Doc 05) ───────────────────────────────

create table users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  dob date,                          -- drives minor logic (Doc 05 §9)
  locale text not null default 'en', -- en|hi|te in v1
  timezone text not null default 'Asia/Kolkata',
  avatar_path text,                  -- org-independent; storage: user/{id}/...
  deleted_at timestamptz,
  -- Personal-info fields for the coach onboarding "About you" step; phone is
  -- a plain contact field, NOT an auth method.
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  phone text,
  address_line text,
  state text,
  city text,
  area text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table auth_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  provider text not null check (provider in
    ('phone','google','email_otp','email_password')), -- phone/email_password: schema-only, not built
  provider_uid text not null,        -- Supabase auth.users.id / E.164 phone / email
  -- verified_identifier: the actual verified login (email/phone) in OUR OWN
  -- schema — provider_uid for 'email_otp' holds Supabase's auth.users.id, not
  -- the email itself; invitation-acceptance matching needs a column we own.
  verified_identifier text,
  guardian_enabled_by uuid references users(id), -- set for minor logins (Doc 05 §9) — unused until phone OTP lands
  verified_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_uid)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  active_org_id uuid,                -- workspace (Doc 05 §7); null = unselected/platform
  refresh_hash text not null,        -- rotated; reuse detection via family
  family_id uuid not null,
  device_label text,
  platform text check (platform in ('web','ios','android')),
  ip_created inet,
  last_seen_at timestamptz,
  mfa_verified_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table guardianships (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null references users(id),
  ward_user_id uuid not null references users(id),
  relationship text not null check (relationship in ('father','mother','guardian')),
  consent_authority boolean not null default true,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  unique (guardian_user_id, ward_user_id),
  check (guardian_user_id <> ward_user_id)
);

-- ── Multi-tenancy & organization core (Doc 02, Doc 07 §4, §17) ──────

create table organizations (
  id uuid primary key default gen_random_uuid(),
  org_type text not null check (org_type in ('independent_coach','academy','school',
    'music','dance','yoga','tuition','corporate','other')),
  name text not null,
  slug text not null unique,         -- marketplace/URL identity
  -- 'rejected' = terminal "verification declined" state (Doc 04 US-1 AC5's
  -- verification-queue pipeline), added beyond Doc 07's literal 4-value enum.
  status text not null default 'pending' check (status in
    ('pending','active','suspended','archived','rejected')),
  verified_at timestamptz, verified_by uuid references users(id),
  default_currency char(3) not null default 'INR',
  country_code char(2) not null default 'IN',
  timezone text not null default 'Asia/Kolkata',
  settings jsonb not null default '{}',  -- guardian_visibility, alert_floor, ui_language…
  created_by uuid references users(id),  -- bootstrap only: keys the one-time self-insert membership policy
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null default 'Main',
  status text not null default 'active' check (status in ('active','archived')),
  geo jsonb,                         -- address, lat/lng, geofence radius (QR check-in)
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),   -- NULL = org-wide (Doc 02 §4)
  status text not null default 'invited' check (status in
    ('invited','active','suspended','left')),
  invited_by uuid references users(id),
  joined_at timestamptz,
  -- Single active-role-per-membership (2026-07-24): a membership may HOLD
  -- several roles (membership_roles, below) but only one is ACTIVE at a
  -- time; has_perm()/has_perm_branch() check only this role. Nullable: a
  -- brand-new membership has no roles yet. FK to membership_roles' own PK
  -- added once that table exists (composite FK further down this file).
  active_role_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  phone text, email text,            -- at least one; matched to auth_methods on accept
  role_keys text[] not null,         -- roles to grant on acceptance (Doc 04 §8)
  token_hash text not null unique,
  invited_by uuid not null references users(id),
  expires_at timestamptz not null, accepted_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  requester_user_id uuid not null references users(id),
  subject_user_id uuid not null references users(id), -- self, or ward (parent requesting for child)
  requested_role text not null default 'student' check (requested_role in
    ('student','coach','assistant_coach')),           -- staff requests need staff approvers (Doc 04 §8)
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  decided_by uuid references users(id), decided_at timestamptz, decision_note text,
  created_at timestamptz not null default now()
);

create table org_branding (
  organization_id uuid primary key references organizations(id),
  logo_path text, colors jsonb, display_name text, updated_at timestamptz
);

create table org_domains (  -- v1 schema (Doc 02 §10 Tier 2), no write endpoints yet
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  hostname text not null unique, verified_at timestamptz, created_at timestamptz not null default now()
);

-- ── consents (Doc 07 §3) — biometric, minor-login, media, medical... ─
create table consents (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null references users(id),
  organization_id uuid references organizations(id), -- null = platform-level consent
  kind text not null check (kind in
    ('biometric_face','minor_login','media_publish','medical_access','marketing')),
  granted_by uuid not null references users(id),  -- self or guardian
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  evidence jsonb                     -- policy version, IP, method
);

-- ── RBAC & Schema Completion (Doc 04 §12, Doc 07 §5, §17) ───────────

create table roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id), -- NULL = system role (custom org roles deferred)
  key text not null,
  scope text not null check (scope in ('platform','org')),
  unique nulls not distinct (organization_id, key)
);

create table permissions (
  key text primary key
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key),
  primary key (role_id, permission_key)
);

create table membership_roles (
  membership_id uuid not null references memberships(id) on delete cascade,
  role_id uuid not null references roles(id),
  granted_by uuid references users(id),
  granted_at timestamptz not null default now(),
  primary key (membership_id, role_id)
);

-- Circular dependency with memberships.active_role_id: added now that
-- membership_roles' own PK exists.
alter table memberships
  add constraint memberships_active_role_fkey
  foreign key (id, active_role_id) references membership_roles (membership_id, role_id);

create table platform_role_assignments (
  user_id uuid not null references users(id),
  role_id uuid not null references roles(id),
  granted_by uuid references users(id),
  granted_at timestamptz not null default now(),
  seed boolean not null default false, -- undeletable seed super admin
  primary key (user_id, role_id)
);

create table coach_assignments (
  membership_id uuid not null references memberships(id) on delete cascade,
  batch_id uuid not null, -- FK to batches(id) added once that table exists, below
  role text not null default 'primary' check (role in ('primary','assistant')),
  days smallint[], -- ISO dow 1-7; NULL = all scheduled days (Doc 07 §21.1) — UX scoping only
  primary key (membership_id, batch_id)
);

create table support_access_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  grantee_user_id uuid not null references users(id),
  reason text not null,
  granted_by uuid not null references users(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Platform Administration (Doc 04 §3/§9, Doc 07 §15/§16/§17) ──────

create table feature_flags (
  key text primary key,
  default_on boolean not null default false,
  description text
);

create table org_feature_flags (
  organization_id uuid not null references organizations(id) on delete cascade,
  flag_key text not null references feature_flags(key),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, flag_key)
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  audience text not null default 'all' check (audience in ('all','org_admins','platform_staff')),
  title text not null,
  body text not null,
  published_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  strategy text not null check (strategy in ('flat_tier','per_active_student','per_staff_seat')),
  pricing jsonb not null default '{}',
  status text not null default 'active' check (status in ('active','deprecated')),
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status text not null check (status in ('trial','active','past_due','suspended','cancelled')),
  trial_ends_at timestamptz,
  current_period_start date,
  current_period_end date,
  negotiated_overrides jsonb,
  created_at timestamptz not null default now()
);

-- Append-only (Doc 07 §16). (id, occurred_at) PK, partition-ready by
-- occurred_at even though no partitioning is set up yet in v1.
create table audit_log (
  id uuid not null default gen_random_uuid(),
  organization_id uuid references organizations(id),
  actor_user_id uuid references users(id),
  actor_session_id uuid,
  support_grant_id uuid references support_access_grants(id),
  action text not null,
  target_type text,
  target_id uuid,
  detail jsonb,
  occurred_at timestamptz not null default now(),
  primary key (id, occurred_at)
);

-- ── People: Enrollment (Doc 07 §6, Doc 04 §7, Doc 02 §6-9) ──────────

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),   -- enrollment decides visibility (Doc 04 §6)
  student_user_id uuid not null references users(id),
  status text not null default 'active' check (status in
    ('active','paused','completed','cancelled')),
  roll_number text,                  -- org-local profile data lives HERE, not on users
  profile jsonb not null default '{}',   -- org-specific fields (sport level, uniform size…)
  started_on date not null, ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, student_user_id, branch_id)
);

-- ── Category/Subcategory/Tag taxonomy (coach_profiles + listings facets) ──

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  icon text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  slug text not null unique,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

-- subcategory_id nullable: NULL means the tag applies broadly (e.g. Board
-- tags apply across every Academic/Tuition grade-band). Non-null scopes it.
create table tags (
  id uuid primary key default gen_random_uuid(),
  subcategory_id uuid references subcategories(id) on delete cascade,
  tag_type text not null check (tag_type in ('subject', 'board', 'stream', 'exam')),
  name text not null,
  slug text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ── Marketplace platform reference data (no organization_id) ────────

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

-- ── Finance: fee_policies (created before Scheduling so batches' FK is inline) ──

create table fee_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  kind text not null check (kind in ('recurring_monthly','recurring_term','one_time','per_session')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null default 'INR',
  fine_policy jsonb,        -- { lateFee?: { graceDays, flatMinor?, percentBp?, capMinor? }, absenceFine?: { amountMinor } }
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);

-- ── Scheduling: programs, batches, class sessions, holidays (Doc 07 §7) ──

create table programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  sport_key text,   -- FK to taxonomy_sports(key) deferred (schema follows the module that needs it)
  description text,
  created_at timestamptz not null default now()
);

create table batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  program_id uuid references programs(id),
  name text not null,
  mode text not null default 'in_person' check (mode in ('in_person','online','hybrid')),
  capacity int,
  status text not null default 'active' check (status in ('active','archived')),
  schedule jsonb not null,  -- { days: int[] (ISO dow 1-7), startTime, endTime: 'HH:MM',
                             --   startDate: date, endDate: date|null }
  grace_minutes int not null default 15,
  default_fee_policy_id uuid references fee_policies(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Circular dependency with coach_assignments.batch_id: added now that
-- batches exists.
alter table coach_assignments
  add constraint coach_assignments_batch_id_fkey
  foreign key (batch_id) references batches(id) on delete cascade;

create table batch_enrollments (
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  batch_id uuid not null references batches(id) on delete cascade,
  status text not null default 'active' check (status in ('active','left')),
  joined_on date not null default current_date,
  left_on date,
  primary key (enrollment_id, batch_id)
);

create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  batch_id uuid not null references batches(id),
  session_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in
    ('scheduled','completed','cancelled','holiday')),
  created_at timestamptz not null default now(),
  unique (batch_id, session_date, starts_at)
);

create table holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),  -- null = org-wide holiday
  on_date date not null,
  label text not null,
  created_at timestamptz not null default now()
);

-- ── Finance: charges, payments, ledger, payouts (Doc 07 §9) ─────────

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

create table payment_allocations (
  payment_id uuid not null references payments(id),
  charge_id uuid not null references charges(id),
  amount_minor bigint not null check (amount_minor > 0),
  primary key (payment_id, charge_id)
);

create table ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),  -- null = platform account
  owner_user_id uuid references users(id),             -- set for user accounts (referral earnings)
  kind text not null check (kind in ('org_receivable','org_cash','org_payout',
    'platform_revenue','platform_fees','user_referral','gateway_clearing')),
  currency char(3) not null default 'INR',
  created_at timestamptz not null default now()
);

-- Append-only (Doc 07 §9). NO write grant to `authenticated` at all — the
-- only insert path is post_ledger_entries(), SECURITY DEFINER.
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

create table org_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  account_holder_name text not null,
  bank_name text not null,
  account_last4 text not null,       -- display only — raw account numbers never stored
  gateway_token text,                -- opaque tokenized reference once a gateway is configured
  created_at timestamptz not null default now()
);

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

-- ── Attendance: face enrollment, attendance events, review queue,
-- staff self-attendance (Doc 07 §8 + §21.2) ─────────────────────────

create table face_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  enrollment_id uuid references enrollments(id),
  membership_id uuid references memberships(id),
  consent_id uuid not null references consents(id),
  embedding vector(128),              -- nullable: tombstone-on-withdrawal (embedding nulled, not deleted)
  quality_score real,
  source_path text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    (enrollment_id is not null and membership_id is null) or
    (enrollment_id is null and membership_id is not null)
  )
);

create table attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  class_session_id uuid not null references class_sessions(id),
  enrollment_id uuid not null references enrollments(id),
  status text not null check (status in ('present','late','absent','excused')),
  method text not null check (method in ('face','qr','manual','override','geofence')),
  confidence real,
  recorded_by uuid references users(id),
  recorded_at timestamptz not null default now(),
  superseded_by uuid references attendance_events(id),
  unique (class_session_id, enrollment_id, recorded_at)
);

create table attendance_review_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  class_session_id uuid not null references class_sessions(id),
  candidate_enrollment_id uuid references enrollments(id),
  confidence real not null,
  source_path text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table staff_attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  membership_id uuid not null references memberships(id),
  kind text not null check (kind in ('check_in','check_out')),
  method text not null check (method in ('selfie_face','manual','admin_override')),
  geo jsonb,
  confidence real,
  recorded_by uuid references users(id),
  recorded_at timestamptz not null default now()
);

-- ── Notifications (Doc 07 §10) ──────────────────────────────────────

create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id), -- null = platform library
  key text not null,
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'push')),
  language text not null check (language in ('en', 'hi', 'te')),
  body text not null,
  variables jsonb not null default '[]', -- array of variable names the body's {{placeholders}} expect
  approved_at timestamptz, -- WhatsApp template approval; unused for email/push
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Self-service (identity right, not a permission) — every authenticated
-- user manages only their own rows.
create table notification_preferences (
  user_id uuid not null references users(id),
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'push')),
  kind text not null, -- notification_templates.key this preference mutes/allows
  enabled boolean not null default true,
  primary key (user_id, channel, kind)
);

-- Append-only, partition-ready.
create table notification_deliveries (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  recipient_user_id uuid not null references users(id),
  template_key text not null,
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'push')),
  language text not null check (language in ('en', 'hi', 'te')),
  ref_type text,
  ref_id uuid,
  status text not null check (status in ('queued', 'sent', 'delivered', 'failed', 'fallback')),
  provider_ref text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, created_at)
);

-- Self-only — a subscription is a browser/device credential.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (endpoint)
);

-- ── Marketplace: listings, leads, reviews, referrals (Doc 07 §11, §15) ──

create table listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id), -- one listing per org (Doc 08 §7 singular route)
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
  -- Category/subcategory/tag/age-group/skill-level taxonomy (parallels
  -- coach_profiles) — persists the Academy onboarding wizard's Programs &
  -- Taxonomy selection.
  category_id uuid references categories(id),
  subcategory_ids uuid[] not null default '{}',
  primary_subcategory_id uuid references subcategories(id),
  tag_ids uuid[] not null default '{}',
  age_groups text[] not null default '{}',
  skill_levels text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- ── Staff HR & Payroll (Doc 07 §12, Doc 04 §4/§5, Doc 00 M10) ───────

create table staff_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),          -- null = org-wide staff
  membership_id uuid not null references memberships(id) on delete cascade,
  user_id uuid not null references users(id),       -- denormalized for self-scoped RLS
  designation text,
  employment_type text not null default 'full_time' check (employment_type in
    ('full_time','part_time','contract','volunteer')),
  status text not null default 'active' check (status in ('active','on_leave','offboarded')),
  notes text,
  onboarded_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (membership_id)
);

create table staff_documents (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references staff_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  user_id uuid not null references users(id),
  doc_type text not null check (doc_type in ('id_proof','address_proof','certification','background_check','other')),
  storage_path text not null,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create table staff_availability (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references staff_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  user_id uuid not null references users(id),
  day_of_week smallint not null check (day_of_week between 1 and 7),  -- ISO dow, matches batches.schedule
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references staff_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  user_id uuid not null references users(id),
  kind text not null default 'other' check (kind in ('sick','casual','earned','unpaid','other')),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create table payout_settings (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null unique references staff_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  user_id uuid not null references users(id),
  pay_type text not null default 'salary' check (pay_type in ('salary','commission','hourly')),
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  currency char(3) not null default 'INR',
  commission_pct numeric(5,2) check (commission_pct is null or (commission_pct >= 0 and commission_pct <= 100)),
  notes text,
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Coach professional profiles (Doc 04 §8 unification) ─────────────
-- 1:1 extension of staff_profiles carrying coach-specific fields.

create table coach_profiles (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null unique references staff_profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  branch_id uuid references branches(id),
  user_id uuid not null references users(id),   -- denormalized for self-scoped RLS
  bio text,
  experience_years int check (experience_years is null or experience_years >= 0),
  qualification text,
  languages_known text[] not null default '{}',
  age_groups text[] not null default '{}',
  skill_levels text[] not null default '{}',
  service_types text[] not null default '{}',   -- 'offline' | 'online'
  class_types text[] not null default '{}',     -- 'group' | 'one_to_one'
  service_area_keys text[] not null default '{}',  -- geo_areas.key values (Tier 1 only)
  allow_student_overrides boolean not null default false,
  -- Category/subcategory/tag selection (parallels listings) — replaced the
  -- earlier flat sport_keys column entirely once this taxonomy landed.
  category_id uuid references categories(id),
  subcategory_ids uuid[] not null default '{}',
  primary_subcategory_id uuid references subcategories(id),
  tag_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- One row per policy, except 'package' which can have several (tiers).
-- Amounts stay decimal rupees (not *_minor) — coach-facing onboarding data,
-- not a ledger entry.
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

-- ── Progress & Performance (Doc 07 §13, Doc 04 §5, Doc 00 M11) ──────

create table metric_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),  -- null = platform library per sport
  sport_key text,                                      -- taxonomy_sports key, or 'general' for vitals; loose (no FK)
  key text not null,
  label text not null,
  unit text,
  direction text check (direction is null or direction in ('higher_better','lower_better')),  -- null = neutral
  created_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, sport_key, key)
);

create table progress_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  student_user_id uuid not null references users(id),  -- denormalized for self/guardian RLS
  metric_key text not null,
  value numeric not null,
  note text,
  recorded_by uuid not null references users(id),
  recorded_on date not null,
  created_at timestamptz not null default now()
);
