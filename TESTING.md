# Abhyas V2 — Test Data Seeding Framework: Build & Testing Report

Read this if you're picking up the seeding framework in a new session, running
it for the first time, or trying to understand why a design decision was
made. **Day-to-day usage reference (CLI flags, module list, extending it) is
[testing/README.md](testing/README.md) — this doc is the narrative:
why it's built this way, what real gaps it surfaced in the app, what got
fixed, what's still open, and the exact verification evidence.**

Built 2026-07-27 on branch `AbhyasV2`, against `IMPLEMENTATION_STATUS.md`'s
Phase 1–13 + Dashboards state (post-migration-consolidation).

---

## 1. What this is

A reusable, config-driven framework that populates any Abhyas environment
(local Docker Supabase today; staging/production if an equivalent mailbox
provider is added) with realistic, interconnected demo data — categories,
academies, independent coaches, sub-coaches, students, batches, attendance
history, finance, reviews, and platform-admin approval-queue data — **using
only the application's real public/internal REST APIs**, the same way a real
user or admin would. No SQL scripts, no direct database writes for seed
*data*. The one narrow, pre-existing exception is documented in §3.

Every entity is created by an authenticated HTTP call to a real
`apps/web/src/app/api/v1/**` route, subject to the same RBAC/RLS/validation
a production user would hit.

---

## 2. Architecture at a glance

```
testing/
  orchestrate.mjs        Main entrypoint — wires every module in dependency order
  validate.mjs            Post-seed validation (14 real-API read checks)
  config/
    index.mjs              CLI/env/--environment resolution, safety checks
    profiles.mjs            small / medium / large (+ smoke) dataset sizes
  lib/
    apiClient.mjs            HTTP client: cookie jar, envelope unwrap, 401-refresh, 5xx-retry
    auth.mjs                  Magic-link identity bootstrap (the auth seam, §3)
    mailbox.mjs                Mailpit polling client
    rng.mjs                     Seeded PRNG (mulberry32) — reproducible runs
    fakeData.mjs                  Indian names/states/cities/bios/etc.
    dates.mjs, log.mjs, concurrency.mjs, state.mjs, taxonomy.mjs
  entities/
    identity.mjs   platformAdmin.mjs   organizations.mjs   coaches.mjs
    scheduling.mjs  students.mjs        attendance.mjs       finance.mjs
    marketplace.mjs
```

Full request/response contracts for every route used, the exact
data-generation dependency order, and every config option are in
[testing/README.md](testing/README.md) (written as part of this
build — treat it as the primary reference, not a summary).

### The one deliberate seam: identity bootstrap

The app has **no password/register endpoint by design** — Google OAuth +
email magic-link only. There's no way to script a login without *some*
inbox to read a real code from. The framework runs the literal browser
journey instead of inventing a bypass:

```
POST /api/v1/auth/magic-link/start {email}   → real PKCE cookie set
  → real email lands in local Mailpit (poll its REST API)
  → GET GoTrue's real /auth/v1/verify link (found IN the email — not our
     app's callback link directly, confirmed by inspecting a live Mailpit
     message body)
  → GoTrue 302s to OUR callback ?code=...
  → GET that, same cookie jar → real abhyas_access_token/refresh_token cookies
```

This only works where a test mailbox exists to poll (local Mailpit). For
staging/production there is currently no `MailboxProvider` implementation —
`lib/auth.mjs` throws a clear error naming exactly where to plug one in
(same `findLatest`/`fetchBody`/`waitForLink` interface `lib/mailbox.mjs`
already implements for Mailpit).

---

## 3. The one pre-existing, non-API exception

Bootstrapping the **very first** platform Super Admin is a real
chicken-and-egg problem: `POST /platform/roles` itself requires an existing
`platform.role.grant` holder, and none exists on a fresh database. The
project already had a sanctioned answer for this — `scripts/bootstrap-superadmin.mjs`,
a direct-SQL script written before this framework existed, explicitly for
this one bootstrap step. The framework shells out to it once
(`entities/platformAdmin.mjs`'s `ensureSuperAdmin`) and then never touches
the database directly again — every platform-staff role after the first,
every org, every coach, every student, every dollar of charges/payments is
a real API call. This is the *only* non-API write path anywhere in the
framework, and it was not introduced by this work — it's the same script
[IMPLEMENTATION_STATUS.md's Phase 5 section](IMPLEMENTATION_STATUS.md)
already documents as the project's sanctioned one-time exception.

---

## 4. Real platform gaps this work found — and how each was resolved

These were discovered by reading the actual route/service code before
writing any seed logic (per the brief's own instruction to identify missing
APIs and explain why, rather than route around them silently).

### 4a. No API could produce historical data — fixed with real app changes (user-approved)

Two related, confirmed gaps:

1. **`class_sessions` materialization is forward-only.**
   `packages/modules/scheduling/src/service.ts`'s `materializeOneBatch()`
   always computed `rangeStart = max(schedule.startDate, today)` — there was
   no endpoint that could ever produce a session dated in the past. "30/90/365
   days of attendance history" was structurally impossible through the real
   API surface as it existed.
2. **Almost no write endpoint accepted a backdated timestamp.** Reviews,
   payments, attendance records, leave/join-request decisions all stamped
   `created_at`/`recorded_at` as the literal server "now", with no override
   parameter — "spread activity over 3–12 months" was equally impossible.

I raised this to the user directly with three options (accept real-time-only
data / add real backend support / a narrow post-seed SQL backdating pass).
**The user chose to add real backend support**, after an explicit walkthrough
of the exact scope and the real-world misuse scenario (a compromised Owner
backdating financial/compliance records) — with one condition: **gate it
behind a feature flag**, not just a permission.

**What was actually built** (all real, reviewed application code, not seed
scaffolding):

- New migration
  [`0007_seed_historical_backdating.sql`](supabase/migrations/0007_seed_historical_backdating.sql):
  - New permission key `schedule.batch.backfill` — granted only to `owner`/`org_admin`
    (narrower than the existing `schedule.calendar.manage`, which Coach/Branch
    Admin also hold).
  - New feature flag `historical_backdating` in the existing `feature_flags`/
    `org_feature_flags` mechanism (Phase 5) — **off by default**, per-org opt-in
    via the real platform feature-flag API.
  - `post_ledger_entries()` gained an optional `p_occurred_at timestamptz default now()`
    parameter so a backdated payment posts a ledger entry group dated to match
    (old 1-arg callers are unaffected).
- New endpoint `POST /api/v1/orgs/{id}/batches/{batchId}/sessions/backfill`
  (`backfillBatchSessions()` in `packages/modules/scheduling/src/service.ts`) —
  reuses the exact same materialization logic, just with an explicit past
  date range instead of an implicit "today forward" one. Backfilled sessions
  land as `'completed'`, not `'scheduled'`. Audit-logged.
- Optional `recordedAt`/`createdAt` parameters added to:
  `recordAttendance`/`overrideAttendance` (attendance), `createReview`
  (marketplace), `recordManualPayment` (finance) — each checks the org's
  `historical_backdating` flag before honoring the override; omitting the
  parameter is a no-op behavior change (defaults to `now()` exactly as
  before).
- `join_requests`/`leave_requests` `decidedAt` backdating was **deliberately
  not built** — lower value (approval-SLA charts only) relative to the
  effort of threading it through `tenancy-rbac`'s more complex
  `decideJoinRequest`. Documented, not silently dropped.

### 4b. `isOrgFeatureEnabled` had a real RLS bug — found and fixed during verification, not a hypothetical

The first version of the flag-check helper ran on the *caller's own*
`withRequestContext` session. `org_feature_flags`' RLS
(`organization_id = current_org()`) only matches when the caller's
**currently active workspace** happens to equal the org being checked. A
self-account student submitting a review to an org that wasn't their active
workspace got zero rows back from RLS — silently, not an error — which fell
through to the flag's `default_on` (`false`) regardless of the org's real
setting. **This is the exact same bug class the codebase's own history
already documents** (Phase 10's notification-muting-floor fix, per
`IMPLEMENTATION_STATUS.md`) — a self-scoped RLS policy silently blocking a
legitimate cross-context read. Fixed by making `isOrgFeatureEnabled`
service-role (like the Phase 10 precedent), with a new
`SERVICE_ROLE_MANIFEST` entry in
`packages/platform/src/db/service-role-manifest.ts` explaining exactly this.
Caught by actually running the seed script against a live database and
reading the real failure, not by inspection.

### 4c. Reviews require a real `memberships` row — a real product constraint, not a bug, that the seed script initially violated

`reviews_insert_self`'s RLS requires `organization_id = current_org()`,
which requires the reviewer to have an active workspace, which requires a
`memberships` row. Reading `tenancy-rbac.decideJoinRequest()` vs.
`people.enrollStudent()` confirmed: **only the join-request-approval path
inserts a `memberships` row** — direct staff enrollment (the framework's
bulk student path, for speed) deliberately never does. Reviews are
therefore only possible for the join-request-approved self-account student
subset, and the framework was restructured to only attempt them there
(`orchestrate.mjs`'s join-request loop, not the bulk loop).

### 4d. Smaller, confirmed, permanent constraints (documented, not worked around)

- **Only 6 real `geo_cities` exist** (Bengaluru, Mumbai, Delhi, Hyderabad,
  Chennai, Pune) — no API creates more; they're migration-seeded platform
  reference data. Marketplace listings and coach service-areas are
  constrained to these 6. Personal profile addresses (`users.state/city/area`)
  are free-text and cover all 10 states the brief asked for.
- **`branches` has no address/geo write API at all** —
  `POST /orgs/{id}/branches` accepts only `{name}` (confirmed by reading
  `tenancy-rbac.createBranch()` — it literally ignores anything else sent).
  Branches are created name-only.
- **`AcademyOnboardingWizard`'s KYC/bank-account/pricing UI fields are not
  wired to any backend call** — confirmed by reading its
  `handleSubmitAll()`: it collects entity type, PAN, GSTIN, bank details, and
  document uploads in local state and never POSTs any of it. If you need
  `org_bank_accounts` rows, call the real Finance API directly — this
  framework does exactly that instead of trusting the wizard collected it.

---

## 5. Bugs found and fixed purely by running the framework (iterative verification)

Every one of these was caught by actually executing the seed script against
a live local Supabase instance and reading the real HTTP/DB response — not
by code review alone. In order found:

1. **Magic-link two-hop redirect** — the emailed link is GoTrue's own
   `/auth/v1/verify` (a different origin, `127.0.0.1:54321`), not the app's
   callback link directly; the first implementation tried to fetch it
   against the app's own origin and got a 404.
2. **`ward.wardUserId` not `.id`** — `POST /me/wards`' real response field
   name, confirmed against `identity-auth.addWard()`.
3. **`identity.acceptInvitation` → `orgs.acceptInvitation`** — a
   module-placement typo (function actually lives in `entities/organizations.mjs`).
4. **Default concurrency (16) overwhelmed `next dev`** — the app's own
   Postgres pool is capped at `max: 10`
   (`packages/platform/src/db/pool.ts`); 16-way concurrent org pipelines
   produced HTTP 500s and delayed magic-link emails once volume ramped up.
   Lowered defaults (`--write-concurrency=6`, `--auth-concurrency=4`) and
   added automatic 5xx retry-with-backoff to the HTTP client.
5. **`isOrgFeatureEnabled` RLS bug** — see §4b.
6. **Reviews/membership constraint** — see §4c.
7. **Backfill trigger condition was wrong** — originally gated backfill on
   `attendanceDays > 30`, which skipped it entirely for smaller history
   windows even though the rolling forward-materialization window *never*
   covers the past regardless of window size. Fixed to always backfill.

---

## 6. How to run it

```bash
# One-time local setup (if not already done)
npm run db:start          # local Supabase in Docker
npm run db:reset          # applies all migrations incl. 0007_seed_historical_backdating.sql
npm run dev:web           # the app must be running on :3000 (magic-link redirects are hardcoded to it)

# Seed
npm run seed:small        # 10 academies, 25 independent coaches, ~500 students, 30d attendance
npm run seed:medium       # 100 / 250 / ~10,000 / 90d
npm run seed:large        # 1,000 / 2,500 / ~100,000 / 365d — see README's performance notes

# Validate
npm run seed:validate -- --dataset=small
```

Common flags (all documented in
[testing/README.md](testing/README.md)):
`--environment=local|staging|production`, `--seed=<n>` (deterministic
reruns), `--clean` (fresh run, new local state file — does **not** touch the
database), `--states=AP,TS,KA`, `--attendance-days=180`,
`--write-concurrency=`/`--auth-concurrency=`.

**Idempotency model (be precise about this, don't overclaim):** resumability
is tracked at the *top-level entity* grain (org / coach / student / batch),
persisted in `testing/.state/<run-tag>.json`. A `--resume` (default,
i.e. omitting `--clean`) run skips entities already recorded complete. An
org that failed **partway through** its own pipeline was never recorded
complete, so a resume attempt re-runs `POST /orgs` for it — which will
`409 slug_taken` if the org row itself was already created before the
failure. The clean, guaranteed-consistent recovery path is `db:reset` +
`--clean`, not a partial resume. This is a deliberate, documented scope
boundary, not an oversight — full leaf-level idempotency (every charge,
every attendance event) would be substantially more code for a real edge
case.

---

## 7. Verification results (evidence, not a claim)

Final clean run, `--dataset=small`, local Docker Supabase, `--seed=42`:

| Metric | Result |
|---|---|
| Academies complete | 10 / 10 |
| Independent coaches complete | 23 / 25 (2 hit a rare magic-link timeout even after the built-in retry — regenerate cleanly on the next `--resume`) |
| Students (wards + self-account) | 283 + ~41 self-account ≈ 324 enrolled |
| Attendance events | 2,294 (1,805 present / 219 late / 270 absent) |
| Batches / sessions backfilled | 33 batches / 429 historical sessions |
| Finance charges / payments | 663 charges / 379 payments (cash+waiver), 69 cancelled, 59 waived |
| Reviews | 9 (bounded by the real membership constraint, §4c) |
| Join requests (approved/pending/rejected) | 28 / 6 / 9 |
| Staff onboarded / leave requests | 56 / 18 (8 approved, 1 rejected, rest pending) |
| Platform roles granted | 4 (verification_ops, support, platform_finance, marketplace_partner) |
| Org verification decisions | 27 approved, 2 rejected (rest left pending — approval-queue realism) |

**Warnings/errors in the final run:** 14 WARN (a one-time `http_500` burst
in the first ~10s while `next dev` compiles routes on first hit, harmless
and self-resolving) + 2 ERROR (the 2 skipped independent-coach pipelines
above). Root-caused, not unexplained — see §5 item 4 and
`testing/README.md`'s Troubleshooting section.

`npm run seed:validate -- --dataset=small`:

```
=== Running 14 validation checks against runTag="small-42" ===
  ✓ Public taxonomy is populated
  ✓ Public listing search returns results
  ✓ Public categories endpoint returns coach/academy counts
  ✓ Platform dashboard has org roll-up data
  ✓ Platform verification queue has entries (pending or decided)
  ✓ Platform audit log has entries
  ✓ Owner dashboard has data for the sample academy
  ✓ Org has enrolled students
  ✓ Org has batches with materialized/backfilled sessions
  ✓ Org has attendance history
  ✓ Org has finance charges + ledger entries
  ✓ Org has staff/coach profiles
  ✓ Org listing is live or pending_verification (marketplace-visible)
  ✓ Independent coach has a coach profile

14/14 checks passed.
```

---

## 8. What's left / not built

- **`medium`/`large` profiles are wired and use the identical code path**
  (only counts/concurrency scale) but have **not yet been run end-to-end**
  in this session — `small` is the only profile actually executed and
  verified. `large` (100k+ students) will be genuinely slow locally: the
  auth-bootstrap step is an inherent real-email round trip per distinct
  adult identity (guardians/coaches/owners), and `testing/README.md`
  documents the honest throughput expectation and how to tune concurrency
  for it.
- **Staging/production have no `MailboxProvider` implementation** — running
  there requires implementing one against `lib/mailbox.mjs`'s interface
  (e.g. an IMAP catch-all inbox); `lib/auth.mjs` fails loudly with exactly
  this instruction rather than silently doing nothing.
- **`join_requests`/`leave_requests` decision timestamps are not
  backdatable** (§4a, deliberately deferred).
- **No document upload pipeline exists in the app at all** (pre-existing,
  not something this work could fix) — `staff_documents.storage_path` is a
  plain text reference; the seed framework writes a placeholder path, same
  as the real staff console does today.
- Six smaller, permanent platform constraints are listed in §4d.

---

## 9. Files changed in this work

**New:**
- `testing/**` (the framework itself)
- `supabase/migrations/0007_seed_historical_backdating.sql`
- `apps/web/src/app/api/v1/orgs/[id]/batches/[batchId]/sessions/backfill/route.ts`
- This file, `TESTING.md`

**Modified (real app code, not scaffolding):**
- `packages/platform/src/db/index.ts` (`isOrgFeatureEnabled`)
- `packages/platform/src/db/service-role-manifest.ts`
- `packages/modules/scheduling/src/service.ts` (`backfillBatchSessions`)
- `packages/modules/attendance/src/service.ts` (`recordedAt` param)
- `packages/modules/marketplace/src/service.ts` (`createdAt` param)
- `packages/modules/finance/src/service.ts` (`createdAt` param, ledger `occurredAt`)
- `apps/web/src/app/api/v1/orgs/[id]/batches/[batchId]/sessions/[sessionId]/attendance/route.ts`
- `apps/web/src/app/api/v1/orgs/[id]/batches/[batchId]/sessions/[sessionId]/attendance/override/route.ts`
- `apps/web/src/app/api/v1/orgs/[id]/reviews/route.ts`
- `apps/web/src/app/api/v1/orgs/[id]/finance/payments/route.ts`

All verified: `npm run type-check` (22 packages, clean), `npm run lint`
(clean — zero new violations), `npm run db:reset` (all 7 migrations apply
clean), `npm run db:check-rls` (68 tables checked, 1 allow-listed, clean).
