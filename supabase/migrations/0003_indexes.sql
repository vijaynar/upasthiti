-- Abhyas V2 — Indexes (Doc 07 §18 — composite indexes lead with organization_id).

-- ── jobs ──────────────────────────────────────────────────────────
-- Claim query shape (used by apps/worker):
--   UPDATE jobs SET locked_by = $1, locked_at = now()
--   WHERE id IN (
--     SELECT id FROM jobs
--     WHERE run_at <= now() AND locked_at IS NULL
--       AND completed_at IS NULL AND failed_at IS NULL
--     ORDER BY run_at LIMIT $2 FOR UPDATE SKIP LOCKED
--   ) RETURNING *;
create index jobs_claim_idx on jobs (run_at)
  where locked_at is null and completed_at is null and failed_at is null;
create index jobs_kind_idx on jobs (kind, run_at);

-- ── tenancy ───────────────────────────────────────────────────────
create index branches_organization_id_idx on branches (organization_id);
create index memberships_user_id_idx on memberships (user_id);
create index memberships_organization_id_idx on memberships (organization_id, status);
create index invitations_organization_id_idx on invitations (organization_id, revoked_at, accepted_at);
create index organizations_created_by_idx on organizations (created_by) where created_by is not null;
create index join_requests_organization_id_idx on join_requests (organization_id, status);
create index join_requests_requester_idx on join_requests (requester_user_id);
create index org_domains_organization_id_idx on org_domains (organization_id);

-- ── RBAC ──────────────────────────────────────────────────────────
create index membership_roles_role_id_idx on membership_roles (role_id);
create index platform_role_assignments_role_id_idx on platform_role_assignments (role_id);
create index support_access_grants_organization_id_idx on support_access_grants (organization_id);
create index support_access_grants_grantee_idx on support_access_grants (grantee_user_id) where revoked_at is null;

-- ── platform admin ────────────────────────────────────────────────
create index org_feature_flags_organization_id_idx on org_feature_flags (organization_id);
create index announcements_published_at_idx on announcements (published_at desc);
create index subscriptions_organization_id_idx on subscriptions (organization_id);
create index audit_log_organization_id_occurred_at_idx on audit_log (organization_id, occurred_at desc);
create index audit_log_actor_user_id_idx on audit_log (actor_user_id);
create index audit_log_action_idx on audit_log (action);

-- ── people ────────────────────────────────────────────────────────
create index enrollments_organization_id_idx on enrollments (organization_id, branch_id, status);
create index enrollments_student_user_id_idx on enrollments (student_user_id);

-- ── category taxonomy ────────────────────────────────────────────
create unique index tags_unique_global_idx on tags(tag_type, slug) where subcategory_id is null;
create unique index tags_unique_scoped_idx on tags(subcategory_id, tag_type, slug) where subcategory_id is not null;
create index categories_active_idx on categories(is_active, display_order);
create index subcategories_category_idx on subcategories(category_id);
create index tags_subcategory_idx on tags(subcategory_id);

-- ── marketplace reference data ───────────────────────────────────
create index geo_areas_city_key_idx on geo_areas (city_key);

-- ── finance: fee_policies ─────────────────────────────────────────
create index fee_policies_organization_id_idx on fee_policies (organization_id, status);

-- ── scheduling ────────────────────────────────────────────────────
create index batches_organization_id_idx on batches (organization_id, branch_id, status);
create index batch_enrollments_batch_id_idx on batch_enrollments (batch_id);
create index class_sessions_batch_id_idx on class_sessions (batch_id, session_date);
create index class_sessions_organization_id_idx on class_sessions (organization_id, branch_id, session_date);
create index holidays_organization_id_idx on holidays (organization_id, on_date);

-- ── finance: charges, payments, ledger, payouts ──────────────────
create index charges_organization_id_idx on charges (organization_id, branch_id, status);
create index charges_enrollment_id_idx on charges (enrollment_id, status);
create index payments_organization_id_idx on payments (organization_id, status);
create index payments_payer_user_id_idx on payments (payer_user_id);
create index payment_allocations_charge_id_idx on payment_allocations (charge_id);

-- One account per (org, kind) for org-scoped kinds; one per kind
-- platform-wide; one per (user, kind) for referral-style user accounts.
-- get_or_create_ledger_account() and friends rely on these being the only
-- three shapes.
create unique index ledger_accounts_org_kind_uidx on ledger_accounts (organization_id, kind)
  where organization_id is not null and owner_user_id is null;
create unique index ledger_accounts_platform_kind_uidx on ledger_accounts (kind)
  where organization_id is null and owner_user_id is null;
create unique index ledger_accounts_user_kind_uidx on ledger_accounts (owner_user_id, kind)
  where owner_user_id is not null;

create index ledger_entries_entry_group_idx on ledger_entries (entry_group);
create index ledger_entries_organization_id_idx on ledger_entries (organization_id, occurred_at);
create index ledger_entries_account_id_idx on ledger_entries (account_id, occurred_at);
create index org_bank_accounts_organization_id_idx on org_bank_accounts (organization_id);
create index payouts_organization_id_idx on payouts (organization_id, status);

-- ── attendance ────────────────────────────────────────────────────
create index face_enrollments_enrollment_id_idx on face_enrollments (enrollment_id) where enrollment_id is not null;
create index face_enrollments_membership_id_idx on face_enrollments (membership_id) where membership_id is not null;
-- HNSW cosine index (Doc 07 §17 hot-path list) — partial: only live
-- (non-null, non-tombstoned) embeddings are ever searched by match_face().
create index face_enrollments_embedding_idx on face_enrollments
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null and deleted_at is null;

-- Hot path (Doc 07 §17): org+session lookups (roster view) and the
-- "does this enrollment already have a live record" idempotency check.
create index attendance_events_org_session_idx on attendance_events (organization_id, class_session_id);
create index attendance_events_enrollment_idx on attendance_events (enrollment_id, class_session_id) where superseded_by is null;
create index attendance_review_queue_org_status_idx on attendance_review_queue (organization_id, status);
create index staff_attendance_events_org_membership_idx on staff_attendance_events (organization_id, membership_id, recorded_at);

-- ── notifications ─────────────────────────────────────────────────
-- Two partial unique indexes, not one table constraint: Postgres treats
-- every NULL as distinct in a unique constraint, so a plain constraint would
-- let the platform library (organization_id is null) accumulate duplicates.
create unique index notification_templates_org_key_idx
  on notification_templates (organization_id, key, channel, language)
  where organization_id is not null;
create unique index notification_templates_platform_key_idx
  on notification_templates (key, channel, language)
  where organization_id is null;
create index notification_templates_org_id_idx on notification_templates (organization_id);

create index notification_deliveries_org_idx on notification_deliveries (organization_id, created_at desc);
create index notification_deliveries_recipient_idx on notification_deliveries (recipient_user_id, created_at desc);
-- Dedup lookup for the automatic (event-driven) dispatch path.
create index notification_deliveries_ref_idx on notification_deliveries (ref_type, ref_id, recipient_user_id, channel);

create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

-- ── marketplace: listings, leads, reviews, referrals ─────────────
-- GIN has no default operator class for plain scalar text (city_key) — only
-- for array/jsonb/tsvector types. A btree on city_key + a separate GIN on
-- sport_keys covers the same query shapes.
create index listings_city_key_idx on listings (city_key);
create index listings_sport_keys_idx on listings using gin (sport_keys);
create index listings_search_idx on listings using gin (
  to_tsvector('english', coalesce(headline, '') || ' ' || coalesce(description, ''))
);
create index listings_category_idx on listings(category_id);

create index leads_organization_id_idx on leads (organization_id, status);
create index leads_listing_id_idx on leads (listing_id);
create index reviews_organization_id_idx on reviews (organization_id);
create index reviews_listing_id_idx on reviews (listing_id, status);
create index referrals_referrer_user_id_idx on referrals (referrer_user_id);
create unique index referrals_referred_org_id_uidx on referrals (referred_org_id) where referred_org_id is not null;

-- ── staff HR ──────────────────────────────────────────────────────
create index staff_profiles_organization_id_idx on staff_profiles (organization_id);
create index staff_profiles_user_id_idx on staff_profiles (user_id);
create index staff_documents_staff_profile_id_idx on staff_documents (staff_profile_id);
create index staff_documents_organization_id_idx on staff_documents (organization_id);
create index staff_availability_staff_profile_id_idx on staff_availability (staff_profile_id);
create index staff_availability_organization_id_idx on staff_availability (organization_id);
create index leave_requests_staff_profile_id_idx on leave_requests (staff_profile_id);
create index leave_requests_organization_id_idx on leave_requests (organization_id);
create index payout_settings_organization_id_idx on payout_settings (organization_id);

-- ── coach profiles / pricing ──────────────────────────────────────
create index coach_profiles_organization_id_idx on coach_profiles (organization_id);
create index coach_profiles_user_id_idx on coach_profiles (user_id);
create index coach_pricing_policies_coach_profile_id_idx on coach_pricing_policies (coach_profile_id);
create unique index coach_pricing_policies_one_default_idx on coach_pricing_policies (coach_profile_id) where is_default;
create index coach_pricing_rules_policy_id_idx on coach_pricing_rules (policy_id);

-- ── progress ──────────────────────────────────────────────────────
create index metric_definitions_sport_key_idx on metric_definitions (sport_key);
create index metric_definitions_organization_id_idx on metric_definitions (organization_id);
create index progress_entries_enrollment_metric_idx on progress_entries (enrollment_id, metric_key, recorded_on);
create index progress_entries_organization_id_idx on progress_entries (organization_id);
create index progress_entries_student_user_id_idx on progress_entries (student_user_id);
