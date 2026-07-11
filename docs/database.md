# Database

Supabase-hosted PostgreSQL. Schema lives entirely in [`supabase/migrations/`](../supabase/migrations/) — that directory is the single source of truth; treat older planning docs (`directory_structure.md`, `system_architecture.md`) as historical context, not current schema.

Migrations were consolidated in 2026-07 from 24 historical files down to a clean baseline (`0001`–`0010`), each reflecting final schema rather than the churn that produced it (columns added/dropped, constraints tightened/relaxed, etc.). New features add new numbered migrations on top (e.g. `0011`).

## Migration files

| File | Purpose |
|---|---|
| `0001_initial_schema.sql` | Extensions (`uuid-ossp`, `vector`, `pgcrypto`); core tables: `tenants`, `users`, `classes`, `batches`, `students`, `parents`, `parent_student_map`, `student_face_samples`, `attendance_logs`, `tenant_settings`, `fines`, `group_attendance_photos`, `student_join_requests`, `student_removals`; generic `updated_at` trigger. |
| `0002_face_matching_rpc.sql` | `match_face_embedding()` — `SECURITY DEFINER` pgvector cosine-similarity RPC. |
| `0003_indexes_rls.sql` | Tenant-scoped indexes, IVFFlat vector index, `auth_tenant_id()`/`auth_user_role()` JWT helpers, per-role RLS policies + a catch-all `tenant_isolation_policy` per table. |
| `0004_storage_buckets.sql` | 5 public storage buckets + generic per-bucket storage policies. |
| `0005_coach_module.sql` | Coach HR/ops domain: `coaches`, `coach_documents`, `coach_face_data`, `coach_availability`, `coach_leaves`, `coach_financial_settings`, `coach_payouts`, `coach_reviews`, `coach_attendance`, `coach_audit_logs`, `coach_batch_assignments`; employee-ID sequence/trigger. |
| `0006_coach_category_taxonomy.sql` | Platform-wide (non-tenant-scoped) `categories`/`subcategories`/`tags` + `coach_categories`/`coach_tags` join tables. |
| `0007_seed_category_taxonomy.sql` | Data seed: ~11 categories, ~90 subcategories, board/subject/stream/exam tags. |
| `0008_service_areas_communities.sql` | Two-tier geography: seeded `service_areas` (~50 Hyderabad localities), dynamic Google Places-backed `service_communities`, `coach_service_areas`/`coach_service_communities` joins. |
| `0009_governance_rbac.sql` | `permissions`, `roles`, `role_permissions`, `audit_logs` (reconstructed — existed in prod with no prior migration history); `users.role_id` FK; seeds permission catalogue + 4 system roles. |
| `0010_auth_provisioning.sql` | `auth.users` triggers that auto-provision `public.users`/`public.students` on signup. |
| `0011_coach_pricing_policies.sql` | Pricing engine: `coach_pricing_policies`, `coach_pricing_rules`, `coach_pricing_settings`, `coach_student_pricing_overrides`. |

After schema changes, regenerate types: `supabase gen types typescript --local > packages/database/src/types.ts`.

## Core tables

| Table | Key columns |
|---|---|
| `tenants` | `id UUID PK`, `slug UNIQUE`, `subscription_status` (`trial/active/suspended/cancelled`) |
| `users` | `id UUID PK REFERENCES auth.users(id)`, `tenant_id FK NOT NULL`, `role` (`superadmin/admin/student/parent/coach`), `role_id FK→roles` (added 0009), `is_active`, `notification_preferences JSONB` |
| `coaches` | `id UUID PK REFERENCES users(id)`, `tenant_id FK`, array columns with CHECK constraints (`service_types`, `class_types`, `age_groups`, `skill_levels`), `employee_id` (auto-generated `COACH<seq>`), `account_status`, `public_profile_slug UNIQUE`, cached stats (`avg_rating`, `retention_rate`) |
| `students` | `id UUID PK REFERENCES users(id)`, `tenant_id FK`, `batch_id FK→batches ON DELETE SET NULL`, `student_custom_id` (roll number, unique per tenant), `status` (`active/inactive/suspended`) |
| `batches` | `id UUID PK`, `tenant_id FK`, `class_id FK→classes`, `days_of_week SMALLINT[]`, `max_capacity`, CHECK `end_time > start_time` |
| `attendance_logs` | `id UUID PK`, `tenant_id FK`, `student_id FK`, `batch_id FK`, `status` (`present/late/absent`), `verification_mode` (`face_live/face_photo/manual`), `confidence_score`, `UNIQUE(student_id, batch_id, date)` |

Other tables (one-liners): `parents`, `parent_student_map` (M:N; `father/mother/guardian/parent`), `student_face_samples` (128-dim `vector` embeddings), `tenant_settings` (per-tenant fine/timing config), `fines` (with payment-proof fields), `group_attendance_photos`, `student_join_requests`, `student_removals`, `coach_documents`, `coach_face_data`, `coach_availability`, `coach_leaves`, `coach_financial_settings`, `coach_payouts`, `coach_reviews`, `coach_attendance`, `coach_audit_logs`, `coach_batch_assignments`, `categories`/`subcategories`/`tags` + `coach_categories`/`coach_tags`, `service_areas`/`service_communities` + `coach_service_areas`/`coach_service_communities`, `permissions`/`roles`/`role_permissions`/`audit_logs`, `coach_pricing_policies`/`coach_pricing_rules`/`coach_pricing_settings`/`coach_student_pricing_overrides`.

## Conventions

- **Tables**: `snake_case`, plural (`students`, `coach_batch_assignments`).
- **Primary keys**: `UUID DEFAULT gen_random_uuid()`. Profile-style tables use a shared-PK 1:1 extension pattern instead: `students.id`/`coaches.id` `REFERENCES users(id)` directly (no surrogate key), same for `coach_financial_settings`, `coach_pricing_settings`.
- **Timestamps**: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` everywhere; `updated_at` auto-maintained by the shared `update_updated_at_column()` trigger on any mutable table. (A few 0009 tables use `timezone('utc'::text, now())` instead of `now()` — a known minor inconsistency, not a pattern to copy.)
- **Soft delete**: none. Deactivation is via `is_active`/status-enum columns, not `deleted_at`. Deletes use `ON DELETE CASCADE`/`SET NULL` FKs.
- **Triggers/sequences**: named `trg_<table>_<purpose>` (e.g. `trg_coaches_employee_id`, `trg_users_updated_at`).
- **Status fields**: modeled as `CHECK (col IN (...))` constraints, not Postgres `ENUM` types. Mirror any new value set in `packages/common/src/constants.ts` — that file is the app-layer source of truth and can drift from the DB (it already has under-listed roles; verify before trusting it blindly).

### Key value sets

- `users.role`: `superadmin | admin | student | parent | coach`
- `coaches.account_status`: `Onboarding | Document Upload Pending | Pending Verification | Active | Inactive | On Leave | Terminated`
- `attendance_logs.status`: `present | late | absent`; `verification_mode`: `face_live | face_photo | manual`
- `fines.status`: `unpaid | pending_verification | paid | waived`
- `coach_pricing_policies.policy_type`: `monthly_subscription | per_class | package | trial_session | fine_based | one_time_registration` (overrides also add `scholarship | custom`)
- System roles seeded in `roles`: `Super Admin | Admin | Coach | Student`

## Multi-tenancy

`tenant_id UUID NOT NULL REFERENCES tenants(id)` is present on essentially every tenant-scoped table. Exceptions are intentional: platform-wide reference data (`categories`/`subcategories`/`tags`, `service_areas`/`service_communities`, global `roles`) is tenant-agnostic by design, and child tables like `coach_pricing_rules` inherit isolation from their parent row.

Isolation is enforced at **two layers**:

1. **Database (RLS)** — enabled on all tenant-scoped tables since `0003_indexes_rls.sql`, with fine-grained per-role policies plus a catch-all `tenant_isolation_policy` (`tenant_id::text = auth.jwt() -> 'app_metadata' ->> 'tenant_id'`) so no table can accidentally ship without *some* isolation. This is what actually protects any client that queries with the anon key (browser Supabase client, `public/*` storefront routes).
2. **Application (manual filtering)** — every `/api/v1` route uses a **service-role client** (`adminDb()`, see [`api-guidelines.md`](./api-guidelines.md)) that bypasses RLS entirely, so route handlers manually add `.eq('tenant_id', ctx.tenantId)` unless the caller is `superadmin`. This manual filter is the *actual* enforcement mechanism for API traffic — RLS is defense-in-depth, not the primary gate, for anything going through `/api/v1`.

When adding a new tenant-scoped table or route: add both the RLS policy **and** the manual `tenant_id` filter in the route handler. Don't rely on RLS alone once the route uses the admin client.

## pgvector / face matching

- Extension: `vector` (enabled in `0001`).
- Embedding columns: `student_face_samples.embedding vector(128)`, `coach_face_data.embedding vector(128)`.
- Indexes: IVFFlat (`lists=100`) on `student_face_samples`; HNSW on `coach_face_data`.
- `match_face_embedding()` (`0002`, `SECURITY DEFINER`) computes cosine similarity (`1 - (embedding <=> input_embedding)`), filtered by `tenant_id` + `status='active'`, ordered by distance, capped by `match_count`. It bypasses RLS internally, so `p_tenant_id` is the caller-supplied isolation boundary — always pass it explicitly.

## Storage buckets

Defined in `0004_storage_buckets.sql`, all `public: true`: `student-portraits`, `avatars`, `coach-documents`, `coach-certificates`, `attendance-photos`. Bucket policies are generic (public SELECT, authenticated INSERT/UPDATE/DELETE) — there is **no per-object ownership check at the storage layer**. File-path namespacing (e.g. prefixing by `tenant_id`/`user_id`) is the application's responsibility when uploading; don't assume the bucket policy protects against cross-tenant reads of guessed paths.

## Related docs

- [`coach_pricing_policies.md`](./coach_pricing_policies.md) — pricing engine detail.
- [`coach_service_areas.md`](./coach_service_areas.md) — service area/community geography model detail.
