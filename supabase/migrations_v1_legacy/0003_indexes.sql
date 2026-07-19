-- ============================================================
-- MIGRATION: 0003_indexes.sql
-- Abhyas — All indexes: tenant-isolation, foreign-key, partial,
-- vector (ANN), and uniqueness-via-partial-index.
-- ============================================================
-- Partial/expression unique indexes live here rather than as table
-- CONSTRAINTs in 0002, since Postgres unique constraints can't carry
-- a WHERE clause.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION A: Multi-tenant isolation & hot-path query indexes
-- All high-traffic queries filter on tenant_id first.
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_users_tenant_id       ON public.users (tenant_id);
CREATE INDEX idx_users_tenant_role     ON public.users (tenant_id, role);
CREATE INDEX idx_users_last_login      ON public.users (last_login DESC);
CREATE INDEX idx_users_role_id         ON public.users (role_id) WHERE role_id IS NOT NULL;

CREATE INDEX idx_classes_tenant_id     ON public.classes (tenant_id) WHERE is_active = true;

CREATE INDEX idx_batches_tenant_class  ON public.batches (tenant_id, class_id) WHERE is_active = true;

CREATE INDEX idx_students_tenant_id    ON public.students (tenant_id);
CREATE INDEX idx_students_tenant_batch ON public.students (tenant_id, batch_id) WHERE status = 'active';

CREATE INDEX idx_parent_student_map_student ON public.parent_student_map (student_id);

CREATE INDEX idx_face_samples_tenant   ON public.student_face_samples (tenant_id);
CREATE INDEX idx_face_samples_student  ON public.student_face_samples (student_id);

CREATE INDEX idx_attendance_tenant_date  ON public.attendance_logs (tenant_id, date DESC);
CREATE INDEX idx_attendance_student_date ON public.attendance_logs (student_id, date DESC);
CREATE INDEX idx_attendance_batch_date   ON public.attendance_logs (batch_id, date DESC);

CREATE INDEX idx_fines_tenant_status   ON public.fines (tenant_id, status);
CREATE INDEX idx_fines_student_id      ON public.fines (student_id);

CREATE INDEX idx_group_photos_batch_date ON public.group_attendance_photos (batch_id, date DESC);

CREATE INDEX idx_join_requests_batch   ON public.student_join_requests (batch_id);
CREATE INDEX idx_join_requests_tenant_status ON public.student_join_requests (tenant_id, status);

CREATE INDEX idx_student_removals_batch  ON public.student_removals (batch_id);

CREATE INDEX idx_audit_logs_tenant_date ON public.audit_logs (tenant_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- SECTION B: Coach module indexes
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_coaches_tenant        ON public.coaches (tenant_id);
CREATE INDEX idx_coaches_slug          ON public.coaches (public_profile_slug);
CREATE INDEX idx_coaches_account_status ON public.coaches (tenant_id, account_status);

CREATE INDEX idx_coach_docs_unverified ON public.coach_documents (tenant_id, verification_status) WHERE verification_status = 'Pending';

CREATE INDEX idx_coach_availability_coach ON public.coach_availability (coach_id);

CREATE INDEX idx_coach_leaves_status   ON public.coach_leaves (tenant_id, status) WHERE status = 'Pending';

CREATE INDEX idx_coach_attendance_date ON public.coach_attendance (tenant_id, date);

CREATE INDEX idx_coach_payouts_unpaid  ON public.coach_payouts (tenant_id, status) WHERE status IN ('Draft', 'Processing');

CREATE INDEX idx_coach_reviews_coach   ON public.coach_reviews (coach_id);

CREATE INDEX idx_coach_audit_logs_coach ON public.coach_audit_logs (coach_id, created_at DESC);

CREATE INDEX idx_cba_coach             ON public.coach_batch_assignments (coach_id);
CREATE INDEX idx_cba_batch_status      ON public.coach_batch_assignments (batch_id, status);

CREATE INDEX idx_coach_notes_coach     ON public.coach_notes (coach_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- SECTION C: Discovery taxonomy & geography indexes
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_categories_active     ON public.categories (is_active, display_order);
CREATE INDEX idx_subcategories_category ON public.subcategories (category_id);
CREATE INDEX idx_tags_subcategory      ON public.tags (subcategory_id);

-- Partial-safe tag uniqueness: two tags of the same type/slug cannot both
-- be global (NULL subcategory_id), and cannot repeat within one subcategory.
CREATE UNIQUE INDEX idx_tags_unique_global ON public.tags (tag_type, slug) WHERE subcategory_id IS NULL;
CREATE UNIQUE INDEX idx_tags_unique_scoped ON public.tags (subcategory_id, tag_type, slug) WHERE subcategory_id IS NOT NULL;

CREATE INDEX idx_coach_categories_coach ON public.coach_categories (coach_id);
CREATE INDEX idx_coach_categories_subcategory ON public.coach_categories (subcategory_id);

-- At most one primary subcategory per coach.
CREATE UNIQUE INDEX idx_one_primary_category_per_coach ON public.coach_categories (coach_id) WHERE is_primary = true;

CREATE INDEX idx_coach_tags_coach      ON public.coach_tags (coach_id);
CREATE INDEX idx_coach_tags_tag        ON public.coach_tags (tag_id);

CREATE INDEX idx_service_areas_active  ON public.service_areas (is_active, display_order);

CREATE INDEX idx_service_communities_area ON public.service_communities (area_id);
CREATE INDEX idx_service_communities_area_name ON public.service_communities (area_id, lower(name));

-- Dedup key once a coach resolves a place via Places Autocomplete.
CREATE UNIQUE INDEX idx_service_communities_place_id ON public.service_communities (google_place_id) WHERE google_place_id IS NOT NULL;

CREATE INDEX idx_coach_service_areas_coach ON public.coach_service_areas (coach_id);
CREATE INDEX idx_coach_service_areas_area  ON public.coach_service_areas (area_id);
CREATE INDEX idx_coach_service_communities_coach ON public.coach_service_communities (coach_id);
CREATE INDEX idx_coach_service_communities_community ON public.coach_service_communities (community_id);

-- ────────────────────────────────────────────────────────────
-- SECTION D: Coach pricing indexes
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_coach_pricing_policies_coach ON public.coach_pricing_policies (coach_id);

-- Only one default policy per coach.
CREATE UNIQUE INDEX idx_coach_pricing_policies_one_default ON public.coach_pricing_policies (coach_id) WHERE is_default;

CREATE INDEX idx_coach_pricing_rules_policy ON public.coach_pricing_rules (policy_id);

CREATE INDEX idx_coach_student_overrides_student ON public.coach_student_pricing_overrides (student_id);

-- Only one *active* override per student at a time.
CREATE UNIQUE INDEX idx_coach_student_overrides_active ON public.coach_student_pricing_overrides (coach_id, student_id) WHERE effective_to IS NULL;

-- ────────────────────────────────────────────────────────────
-- SECTION E: pgvector ANN indexes for face-embedding similarity search.
-- HNSW used consistently for both tables (sub-10ms queries; supersedes
-- IVFFlat which the student table originally used).
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_face_embedding_hnsw ON public.student_face_samples USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_coach_face_vectors  ON public.coach_face_data       USING hnsw (embedding vector_cosine_ops);
