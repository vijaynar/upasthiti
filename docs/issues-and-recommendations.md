# Issues, Bugs, Missing Features & Recommendations

Found while populating demo data and documenting every real workflow in the app (see [`docs/user-guide/`](user-guide/README.md) and [`docs/demo-data-summary.md`](demo-data-summary.md)). Every bug below was reproduced live against a fresh `supabase db reset`, with an exact root cause identified in the source — not guessed from symptoms.

---

## P0 — Bugs that block a core workflow entirely

### P0: Tenant/user provisioning is completely broken (5 of 6 creation endpoints)

**Symptom:** Every one of these forms fails with `Internal server error` (HTTP 500) on submit, every single time, on a fresh database:

| Endpoint                                      | UI entry point                                        | Screenshot evidence                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/v1/auth/register` (academy branch) | Public academy self-registration, `/auth/register`    | [`02-organization-setup/03-academy-register-result-KNOWN-BUG-500.png`](screenshots/02-organization-setup/03-academy-register-result-KNOWN-BUG-500.png) |
| `POST /api/v1/superadmin`                     | Super Admin → Academies → Onboard Academy             | [`01-platform-admin/08-onboard-academy-result.png`](screenshots/01-platform-admin/08-onboard-academy-result.png)                                       |
| `POST /api/v1/students`                       | Admin → Students → Add Student Profile                | [`02-organization-setup/06-new-academy-add-student-KNOWN-BUG-500.png`](screenshots/02-organization-setup/06-new-academy-add-student-KNOWN-BUG-500.png) |
| `POST /api/v1/governance/users`               | Admin → User Directory → Add New User                 | [`03-user-management/29-governance-users-result.png`](screenshots/03-user-management/29-governance-users-result.png)                                   |
| `POST /api/v1/auth/signup`                    | (no direct UI entry point found, but same code shape) | not exercised live, but confirmed by code inspection                                                                                                   |

**Root cause:** `supabase/migrations/0004_functions_triggers.sql`'s `trg_sync_auth_user_profile` trigger fires `AFTER INSERT ON auth.users` and **automatically creates the matching `public.users` row** (and a `public.students` row too, if the role resolves to `student`). Every one of the five routes above calls `supabase.auth.admin.createUser({..., app_metadata})` and then does a **plain `.insert()`** into `public.users` right afterward — which collides with the row the trigger already created, throwing:
```
duplicate key value violates unique constraint "users_pkey"
```
(`POST /api/v1/students` fails identically on its own follow-up `.insert()` into `public.students`.)

Confirmed exact file:line for each:
- `apps/web/src/app/api/v1/auth/register/route.ts:362` (academy branch — the coach branch two hundred lines earlier at `:186` correctly uses `.upsert()` and works fine, which is how this was found: the two branches of the same file behave differently)
- `apps/web/src/app/api/v1/superadmin/route.ts:376`
- `apps/web/src/app/api/v1/students/route.ts:196` and `:214`
- `apps/web/src/app/api/v1/governance/users/route.ts:64`
- `apps/web/src/app/api/v1/auth/signup/route.ts:69` (not exercised live, but identical shape)

**Fix:** Change `.insert()` to `.upsert()` at each site above (matching the pattern already correct in the coach self-registration branch of `auth/register/route.ts` and in `coaches/route.ts`). This is a mechanical, low-risk, well-precedented fix — the correct pattern already exists twice in the same codebase.

**Impact:** This isn't a peripheral bug. Between this and the coach-list bug below, **an admin currently cannot create a new academy, add a student, or add a staff user through the UI at all** — only "Onboard New Coach" (admin or self-service) works, because it happens to use the correct pattern. All demo data in this environment had to be created via a direct-database seed script as a result.

**Secondary, related gotcha we hit ourselves:** the same trigger race also silently defaults `tenant_id` to a hardcoded fallback tenant if `app_metadata.tenant_id` isn't visible to the trigger at the moment `auth.users` is inserted (GoTrue's Admin API applies `app_metadata` via a secondary update, *after* the initial row insert — the trigger only sees the pre-update state). Every route above works around this correctly by re-setting `tenant_id` explicitly in its own `.insert()`/`.upsert()` call — good defensive practice, but worth knowing about if anyone ever removes that "redundant-looking" field from one of these calls. It also means the trigger auto-creates a spurious `public.students` row for **every** new user (coaches and admins included) before their real role is set, since `raw_app_meta_data.role` isn't visible to the trigger yet either and defaults to `'student'`. Our seed script had to explicitly delete 24 such orphan rows after seeding; the real app routes don't clean these up at all (though since they never get further than the users.insert() collision above, the orphan rows are harmless dead data rather than a functional problem — for now).

---

## P1 — Bugs that break a major screen but have a workaround

### P1: Coach Management list never loads

**Symptom:** `/admin/coaches` shows "No coaches match the current filters" and a persistent "Failed to load: API fetch failed" toast, every time, for every tenant. Screenshot: [`03-user-management/03-coaches-list-mixed-statuses.png`](screenshots/03-user-management/03-coaches-list-mixed-statuses.png).

**Root cause:** `GET /api/v1/coaches` (`apps/web/src/app/api/v1/coaches/route.ts:141-197`) queries `users` as the base table and tries to embed `batch_assignments:coach_batch_assignments!coach_batch_assignments_coach_id_fkey(...)`. That foreign key exists on `coaches.id`, not `users.id` — even though `coaches.id` and `users.id` are the same UUID 1:1, PostgREST can't resolve a join hint across a table the query didn't select from. Reproduced directly against Postgres:
```
PGRST200: Could not find a relationship between 'users' and 'coach_batch_assignments' in the schema cache
```
**Fix:** Base the query on `coaches` (joining `users` in, rather than the reverse), or split into two queries and merge client-side.

**Impact:** Nobody can browse, search, filter, or approve/reject coaches through this screen right now — including the coach-approval workflow documented in [User Management](user-guide/03-user-management.md#workflow-onboard--approve-a-coach).

### P1: Batch ↔ coach assignment list never reflects reality

**Symptom:** After successfully assigning a coach to a batch (confirmed via a real "Coach assigned successfully" toast and a genuine database row), the "Active Coaches" panel still says "No coaches assigned yet", and the main Batch Management table shows every batch as **UNASSIGNED** — even batches with a real, `approved`, pre-existing assignment seeded directly into the database for this walkthrough. Screenshots: [`04-batch-management/10-batches-list.png`](screenshots/04-batch-management/10-batches-list.png) (all batches show "No coaches" / UNASSIGNED despite seeded assignments) and [`04-batch-management/13-assign-coach-result.png`](screenshots/04-batch-management/13-assign-coach-result.png) (success toast, list still empty).

**Root cause:** Same PostgREST embedding problem, different file — `apps/web/src/app/admin/batches/page.tsx:305` (`loadAssignments`) throws:
```
PGRST200: Could not find a relationship between 'coaches' and 'coaches' in the schema cache
```
The query is self-referencing incorrectly (embedding `coaches` off a `coaches`-rooted query using a hint meant for a different relationship). The error is caught and only `console.error`'d, so it fails completely silently in the UI — no error toast, just an empty assignments list that looks like real, valid "nobody's assigned" data.

**Fix:** Correct the embed syntax in `loadAssignments`; also consider surfacing this failure to the user (a toast, not just a console log) so a broken assignments panel doesn't read as "no coaches assigned."

**Impact:** Combined with the bug above, **there is currently no reliable way to see which coach is running which batch anywhere in the admin UI**, even though the underlying data and write-paths are correct.

### P1: Cross-tenant batch-name leak in Reports

**Symptom:** An Admin signed into one academy sees *other academies'* batch names in the Reports → Batch Attendance dropdown. Confirmed live: VidyaSopan Sports School's admin saw "Adult Swimming (Swimming)" pre-selected, which — verified by direct database query during this walkthrough — belongs to AquaPro Swimming Academy, a completely different tenant. Screenshot: [`08-reports-analytics/21-reports-batch-tab.png`](screenshots/08-reports-analytics/21-reports-batch-tab.png).

**Root cause:** `apps/web/src/app/admin/reports/page.tsx:189-193` — `supabase.from('batches').select('id, name, classes(name)').order('name')` has **no `tenant_id` filter**, relying entirely on RLS to scope it. It doesn't. Selecting the foreign batch does correctly return "No Enrolled Students" rather than another tenant's real roster, so this looks like a metadata leak (batch/class *names* only) rather than a full data breach — but that distinction depends on RLS correctly blocking the *next* query down the chain, which is fragile to rely on.

**Fix:** Add `.eq('tenant_id', ctx.tenantId)` at the query (cheap, immediate), and separately audit/add an RLS policy on `batches` for `SELECT` so this class of bug can't recur elsewhere the tenant filter gets forgotten.

**Impact:** Business information disclosure across tenant boundaries in a multi-tenant SaaS product — worth prioritizing before this ever runs anywhere shared.

---

## P2 — Real gaps and rough edges (non-blocking)

### P2: "Roles & Permissions" nav item is a dead end for Admins
Every Admin sees a **Roles & Permissions** link in their sidebar, but the page 403s immediately — including the read-only `GET`, which is gated behind the same `roles.manage` permission as the mutating endpoints, and Admin is deliberately never granted `roles.manage` (confirmed in the RBAC seed data). Screenshot: [`03-user-management/30-governance-roles-list.png`](screenshots/03-user-management/30-governance-roles-list.png). Either hide the nav item from Admins, or split the permission so Admins can at least view the matrix read-only (`apps/web/src/app/api/v1/governance/roles/route.ts:11`).

### P2: "Try it first" guest login is dead
The login page's **Try it first** button (`apps/web/src/app/auth/login/page.tsx:98-117`) attempts `signInWithPassword({email: 'demo-student@upasthiti.com', password: 'password123'})` — this account doesn't exist anywhere in migrations or seed data, so the button 400s for every visitor who clicks it. Either seed this account or remove the button.

### P2: Coach public-profile CTAs don't do anything
On a coach's public marketplace page, **"Book Trial Slot Now"** and **"Contact Coach"** render as normal buttons but have no click handler (`apps/web/src/app/coaches/[slug]/page.tsx`) — confirmed via code inspection, matching the visual "just sits there" behavior observed live. The coach's email/phone are shown as plain text nearby, so contact information is technically present, just not through the buttons that imply an action. Screenshot: [`09-marketplace/03-public-coach-profile.png`](screenshots/09-marketplace/03-public-coach-profile.png).

### P2: No experience-years or price filter in Discovery search
`GET /api/v1/public/coaches` accepts `search, city, categoryId, subcategoryId, tagIds, ageGroup, skillLevel, minRating` — `experienceYears` and pricing (both real, visible fields on a coach) aren't filterable, despite being exactly the kind of thing a parent comparing coaches would want to sort/filter by.

### P2: Discovery free-text search only matches `bio`
Searching a coach's actual name returns nothing — `search` only `ilike`s the `bio` column server-side. Parents searching "Coach Aarav" (a name they saw somewhere) will get zero results even though that coach exists and is active.

---

## Missing features (by design, not bugs)

### Missing feature: a student cannot belong to more than one batch
`students.batch_id` is a single nullable column, not a join table. A student taking both Cricket and Swimming needs two separate accounts today. If multi-batch enrollment is a real requirement, this needs a `student_batch_enrollments` join table — a schema change, not a UI fix.

### Missing feature: no cross-tenant coach identity
A coach who genuinely works at two different academies needs two entirely separate accounts (different emails, no shared profile/rating history) — `coaches.tenant_id` is singular and required. This came up directly while trying to build the demo data brief's "coach teaching in two academies" example; it isn't representable as asked.

### Missing feature: Announcements is a non-functional mock
`/admin/announcements` reads and writes `localStorage` only — no table, no API route, no delivery to anyone. It looks like a real feature (real batch data populates its dropdown) but nothing posted there is visible to any other user or device. See [`user-guide/07-communication.md`](user-guide/07-communication.md).

### Missing feature: Academy/organization search on the marketplace
`/explore/academies` is a static "coming soon" placeholder — no search, filter, or listing of academies exists, and there's no `academy` concept distinct from `tenant` in the schema. See [`user-guide/09-marketplace.md`](user-guide/09-marketplace.md).

### Missing feature: no way to waive a fine from the UI
`fines.status = 'waived'` is a real, used enum value (and demo data uses it), but no button in either the student or admin fines screens reaches it — only `unpaid → pending_verification → paid/unpaid` is reachable interactively.

### Confirmed deferred (already documented, not re-litigated here)
Health Tracker, Payment Queue (bulk upload), AI Insights, and push/WhatsApp/email Notifications are explicitly listed as not-yet-built in `docs/SETUP.md` — not re-reported as bugs here, just confirmed accurate during this walkthrough.

---

## What already works well (worth knowing, not just what's broken)

- **The full payment-proof loop** (student submits → admin approves/rejects) is genuinely solid end-to-end — see [`user-guide/06-payments-fines.md`](user-guide/06-payments-fines.md).
- **Coach self-registration** (the 6-step onboarding wizard, invite-link flow) works correctly end-to-end, including real file uploads to Supabase Storage — it's the one creation flow that got the `.upsert()` pattern right.
- **Manual attendance override** and the **AI group-scan Simulator Mode** (a deliberate, well-built fallback for when `face-api.js`'s WebGL backend isn't available) both work as designed.
- **Multi-tenant RBAC** is a thoughtfully designed system (permission catalogue × system/custom roles × per-tenant custom roles) — the P0/P1 bugs above are implementation slips in specific routes, not a design problem with the RBAC model itself.

---

## Recommendations

1. **Fix the five `.insert()`-vs-`.upsert()` sites first** (P0 above) — this single bug class is the highest-leverage fix available: it single-handedly blocks tenant creation, student creation, and staff-user creation.
2. **Add an integration test that exercises every "create a user" code path against a real (migrated) database**, not just unit tests with mocked Supabase clients — this exact bug class (a trigger that races the Admin API) would have been caught immediately by one test per route that actually hits Postgres, and would prevent regressions once fixed.
3. **Audit every `supabase.from(...).select(...)` call that has no `.eq('tenant_id', ...)`** for the same class of leak found in Reports — grep for `adminDb()`/service-role client usage without an explicit tenant filter, since those bypass RLS entirely by design and depend on the developer remembering the filter every time.
4. **Consider a shared `createUserWithProfile()` helper** in `lib/api.ts` that wraps `auth.admin.createUser` + the trigger-safe `.upsert()` + `role_id` lookup in one place, so this bug class can't reappear the next time someone adds a sixth "create a user" endpoint.
5. **Onboarding UX**: once the P0 bugs are fixed, the actual onboarding forms (academy registration, superadmin provisioning) are well-designed — clear sectioning, sensible defaults (Trial tier, India/Telangana/Hyderabad pre-filled), and a genuinely useful test-mode auto-fill on the coach wizard. No redesign needed, just make them actually submit.
6. **Roles & Permissions**: either scope the nav item to Super Admin only, or split `roles.view` from `roles.manage` so Admins get useful read access to a page they can currently see but never use.
