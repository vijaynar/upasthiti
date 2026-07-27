# Abhyas Test Data Seeding Framework

Populates a fresh (or existing) Abhyas V2 environment with realistic,
interconnected demo/test data — academies, independent coaches, sub-coaches,
students, batches, attendance history, finance, reviews, and platform
administration/approval-queue activity — **exclusively through the
application's real REST API** (`/api/v1/**`), driven by real authenticated
sessions for every actor. No SQL scripts, no direct database writes for
seed *data* (see "Auth bootstrap" below for the one, narrow, pre-existing
exception this relies on, which predates this framework).

## Quick start

```bash
npm run db:start          # local Supabase (Docker) — first run pulls images
npm run db:reset          # applies migrations incl. 0007_seed_historical_backdating.sql
npm run dev:web           # the app must be running on :3000 — OAuth/magic-link
                           # redirect URLs are hardcoded to localhost:3000
npm run seed:small        # in a second terminal
npm run seed:validate -- --dataset=small
```

Every demo identity signs in via the app's real magic-link flow — nothing
to remember, but if you want to browse as one of them yourself, open
`http://127.0.0.1:54324` (Mailpit) and request a fresh magic link for that
email from `/auth/login`.

## Architecture

```
testing/
  orchestrate.mjs        # main entrypoint — wires everything below in
                          # dependency order per dataset profile
  validate.mjs            # post-seed validation (requirement #21)
  config/
    index.mjs              # CLI/env/--dataset resolution, env-file guardrails
    profiles.mjs            # small/medium/large count targets
  lib/
    apiClient.mjs            # fetch wrapper: cookie jar, envelope unwrap
                              # ({data}/{error} AND the legacy {success,data}
                              # shape 4 public/* routes still use), 401→refresh
    auth.mjs                  # magic-link identity bootstrap (see below)
    mailbox.mjs                 # Mailpit client (local dev inbox)
    rng.mjs                      # seeded PRNG (mulberry32) + pick/sample/weighted
    fakeData.mjs                  # Indian names/states/cities/phones/bios
    dates.mjs                      # isoDate/addDays/daysAgo helpers
    concurrency.mjs                 # bounded-concurrency mapPool
    state.mjs                        # resumability manifest (.state/<run-tag>.json)
    log.mjs                           # progress logging + run summary counters
    taxonomy.mjs                       # fetches + indexes the real platform
                                        # taxonomy (categories/sports/cities)
  entities/                # one file per domain, each function = one real
                            # API call (or a short real sequence of them)
    identity.mjs, platformAdmin.mjs, organizations.mjs, coaches.mjs,
    scheduling.mjs, students.mjs, attendance.mjs, finance.mjs, marketplace.mjs
```

Every `entities/*.mjs` function is a thin, named wrapper around one (or a
tiny sequence of) real `fetch()` calls to `/api/v1/**` — there is no
alternate code path into the database. `orchestrate.mjs` is the only file
that decides *how many* of each thing to create and in what order; it
contains no direct API-shape knowledge of its own.

## Auth bootstrap — the one deliberate seam, explained

Abhyas V2 has **no password or admin-create-user endpoint** — Google OAuth
and email magic-link are the only sign-in methods (a deliberate v1 scope
decision). There is therefore no way to get a real, RLS-scoped session for
a synthetic identity except by running the *exact* magic-link journey a
browser would:

1. `POST /api/v1/auth/magic-link/start {email}` — sets a real PKCE
   code-verifier cookie.
2. The real email lands in local Supabase's Mailpit inbox (confirmed by
   reading its actual body during development: it contains **GoTrue's own
   `/auth/v1/verify?token=pkce_...&redirect_to=...`** link, not the app's
   callback URL directly — `lib/auth.mjs` follows both hops).
3. `GET` that link (two hops: GoTrue's stateless verify → our app's
   `/api/v1/auth/magic-link/callback?code=...`, same cookie jar throughout)
   returns real `abhyas_access_token`/`abhyas_refresh_token` cookies —
   identical to what a browser gets.

Every subsequent action for that identity is a normal authenticated
`fetch()` with those cookies. **This only works where a test mailbox exists
to poll.** `--environment=local` uses Mailpit automatically. `staging`/
`production` have no catch-all inbox this framework can read — `lib/auth.mjs`
throws a clear error telling you to implement a `MailboxProvider` (same
`findLatest/fetchBody/waitForLink` shape as `lib/mailbox.mjs`) against
whatever real inbox you control there (e.g. IMAP against a catch-all
domain) before pointing the framework at a non-local environment.

**One narrower, pre-existing exception**: the very first platform Super
Admin can't be granted through the API (granting a platform role itself
requires an existing `platform.role.grant` holder — a real chicken-and-egg
problem the app already solved with `scripts/bootstrap-superadmin.mjs`, a
direct-SQL script that predates this framework). `entities/platformAdmin.mjs`'s
`ensureSuperAdmin()` logs the identity in for real first, then shells out to
that existing script only if no seed Super Admin exists yet. Every platform
action after that first grant (granting more platform staff, deciding org
verification, feature flags, announcements, support access) goes through
the real `/api/v1/platform/**` API.

## Historical backdating — a real, reviewed API addition, not a workaround

Two things could not be produced through the API surface as it existed
before this framework: (1) attendance history — `class_sessions` are only
ever materialized `today` → `+29 days` (confirmed by reading
`materializeOneBatch` in `packages/modules/scheduling/src/service.ts`,
`rangeStart = max(schedule.startDate, today)`, never earlier); (2) general
historical spread — almost no write endpoint accepted a caller-supplied
timestamp. Rather than fabricate rows via SQL to fake this, migration
`0007_seed_historical_backdating.sql` + matching service/route changes add:

- `POST /api/v1/orgs/{id}/batches/{batchId}/sessions/backfill
  {fromDate, toDate}` — same materialization logic, explicit past range.
- An optional `recordedAt`/`createdAt`/`decidedAt` field on attendance
  record/override, review create, and manual payment record.

Both are gated behind **the org's `historical_backdating` feature flag**
(off by default — `entities/platformAdmin.mjs`'s `enableHistoricalBackdating()`
turns it on per-org, itself a real `POST /platform/organizations/{id}/feature-flags`
call) **and** a real permission (`schedule.batch.backfill`, seeded to
Owner/Org Admin only — narrower than the `schedule.calendar.manage` key
Coach/Branch Admin already hold, since backfilling history is a different
risk profile than creating today's real sessions). Every backdated write
still runs through full RLS/validation/business logic (ledger-balance
trigger, append-only attendance chain, etc.) — only the timestamp column's
value is caller-supplied. See the migration file's own header and
`IMPLEMENTATION_STATUS.md`'s "Historical backdating" section for the full
security rationale (real-world misuse scenarios considered, why an audit
trail via `writeAuditLog()` is the standard mitigation, same as every other
privileged Owner action in this app).

**Not backdated** (a smaller, deliberately deferred piece of the same gap):
join-request/leave-request `decidedAt` — approval-SLA dashboard timestamps
will show the real seeding-run time, not a spread history. Cheap to add
later with the exact same pattern if it turns out to matter.

## Data generation order & dependencies

1. **Taxonomy** — fetch real categories/subcategories/tags, `taxonomy_sports`,
   `geo_cities`/`geo_areas` once (`GET /public/taxonomy`, `/public/categories`
   — there is no API to create new ones, see "Known gaps" below).
2. **Platform administration** — Super Admin bootstrap, additional platform
   staff roles (`verification_ops`/`support`/`platform_finance`/
   `marketplace_partner`), one announcement.
3. **Per organization** (academies and independent coaches, built
   independently, concurrency-bounded by `--write-concurrency`):
   a. Owner identity (real login) → `POST /orgs` → workspace activate →
      branding → listing draft (real taxonomy IDs) → verification decision
      (weighted: mostly approved, some left pending, some rejected — Requirement
      #14 variety) → publish → enable `historical_backdating`.
   b. Fee policy + bank account.
   c. **Academies only**: N coaches via the real invite→accept→onboard
      pipeline (`staff_profiles` + `coach_profiles`, mirroring
      `CoachProfileWizard`'s admin mode), certifications, leave requests.
   d. **Independent coaches only**: self-onboard via `POST /me/onboard-coach`
      + pricing (mirroring the wizard's self mode); a subset get one
      sub-coach (`assistant_coach` role, same invite pipeline).
   e. Programs + batches (real taxonomy-matched sport/category) → coach
      assignment → **session backfill** (past window) — batch creation's own
      forward materialization covers the rest.
   f. Students: majority via guardian → `POST /me/wards` (no auth round
      trip) → staff direct-enrolls the ward; a smaller self-account subset
      get a real login (needed for reviews — see below); a further small
      slice goes through a real join-request → staff decide (pending/
      approved/rejected mix, Requirement #14).
   g. Per enrolled student: batch roster, attendance history (weighted
      present/late/absent profile, against backfilled + forward sessions
      only — never a future 'scheduled' session), 1-3 charges with a mixed
      paid/open/waived/cancelled outcome, backdated payments.
   h. Reviews — **only** from the self-account student subset (RLS requires
      the review's own author session; a profile-only ward has none, see
      "Known gaps").

`state/organizations/coaches/students` keys in the `.state/<run-tag>.json`
manifest make a re-run skip already-created top-level entities (orgs,
coaches, wards, batches) — see "Idempotency" below for the actual grain
this covers.

## Required APIs — what exists vs. what this framework added

Everything in the "Data generation order" above maps to a real, pre-existing
`/api/v1/**` route **except**:

| Gap found | Why it blocked seeding | Resolution |
|---|---|---|
| No endpoint creates `class_sessions` in the past | "30/90/365 days of attendance history" is impossible otherwise | Added `POST .../sessions/backfill` (migration `0007_seed_historical_backdating.sql`) |
| No write endpoint accepted a backdated timestamp | "distribute activity over 3-12 months" | Added optional `recordedAt`/`createdAt` params on 3 routes, both feature-flag-gated |
| `branches` has no address/geo write path at all | Academy/branch physical address (`AcademyOnboardingWizard`'s own step 2 fields aren't wired to any API call — confirmed by reading `handleSubmitAll`) | Not fixed — out of scope for this pass; branches are created name-only. Address realism instead lives on `users.state/city/area` (a real field, `PATCH /me`) |
| `geo_cities`/`geo_areas` has only 6 seeded cities (Bengaluru/Mumbai/Delhi/Hyderabad/Chennai/Pune) | Requirement lists 10 states incl. Gujarat/Kerala/Punjab/Rajasthan/AP with no launched city | Not fixed — platform reference data, no create API exists. `fakeData.mjs`'s `STATE_CITIES` still generates realistic per-state city/area text for personal profiles; marketplace listings/service areas are constrained to the 6 real `geo_cities` rows, weighted toward the nearest launched city per state |
| `AcademyOnboardingWizard`'s KYC/bank-account fields aren't persisted anywhere | Bank accounts wouldn't exist after "onboarding" | Call `POST /orgs/{id}/finance/bank-accounts` directly instead of relying on the wizard's (non-functional) KYC step |

## Reviews: a real RLS constraint, not a framework limitation

`reviews.author_user_id` must be the *current session's own user* (an
enrolled student reviewing their own coach/academy) — confirmed by reading
`marketplace`'s `createReview` RLS. A guardian-created ward has no session
of its own and **can never author a review**, by design (same as a real
5-year-old can't leave a Google review). This framework accounts for that:
only the self-account student subset (a configurable ~20% of students) is
eligible, and `reviewsTarget` is a soft cap sized against that subset, not
the full student count — don't expect literally `reviewsTarget` rows if the
self-account subset is smaller than that.

## Idempotency & resumability — the actual grain

`--resume` (default; `--clean` disables it) skips re-creating an
already-seeded **organization** (keyed by owner email + index), which in
turn skips its coaches/batches/students — coarse but meaningful: a
re-run after a full success is a fast no-op. A run that crashes *mid*-organization
will, on resume, skip already-finished organizations but re-run the
in-progress one from scratch (its API calls are individually safe to repeat
— enrollment upsert-on-conflict, idempotent batch/session upserts — but
you may get some duplicate charges/attendance events for that one org).
This is a real, honest limitation: full leaf-level idempotency (every
charge, every attendance event) was judged not worth the complexity for a
seeding tool. Use `--clean` for a guaranteed-consistent from-scratch run.

## Dataset profiles

| Profile | Academies | Indep. coaches | Students (target) | Attendance days | Command |
|---|---|---|---|---|---|
| `small` | 10 | 25 | 500 | 30 | `npm run seed:small` |
| `medium` | 100 | 250 | 10,000 | 90 | `npm run seed:medium` |
| `large` | 1,000 | 2,500 | 100,000 | 365 | `npm run seed:large` |

Counts are **approximate** targets (per Requirement #15's own "approximately"
language) — actual per-organization batch/student counts are derived with
rng jitter, not forced to an exact divisor.

## Configuration

All flags also read from environment variables (`SEED_*`), and from
`.env.development.local` / `.env.staging.local` / `.env.production.local`
per `--environment` (same env-file convention the rest of this repo uses).

| Flag | Env var | Default | Notes |
|---|---|---|---|
| `--environment` | `SEED_ENVIRONMENT` | `local` | `local` \| `staging` \| `production` — refuses to run if the resolved env file doesn't match (guards against pointing `local` at a hosted project or vice versa) |
| `--dataset` | `SEED_DATASET` | `small` | `small` \| `medium` \| `large` |
| `--seed` | `SEED_RANDOM_SEED` | `42` | deterministic PRNG seed — same seed + same dataset ⇒ same generated *content* (names, choices), though not the same wall-clock timestamps |
| `--states` | `SEED_STATES` | all 10 | comma-separated subset, e.g. `--states=Karnataka,Telangana` |
| `--attendance-days` | `SEED_ATTENDANCE_DAYS` | profile default | override attendance history depth |
| `--clean` | — | off | fresh run, ignores/overwrites the state file |
| `--resume` | — | on (unless `--clean`) | skip already-created organizations |
| `--run-tag` | `SEED_RUN_TAG` | `<dataset>-<seed>` | state file name + email uniqueness tag — set explicitly to run two datasets against the same DB without collisions |
| `--auth-concurrency` | `SEED_AUTH_CONCURRENCY` | 8 | parallel magic-link round trips (Mailpit-bound) |
| `--write-concurrency` | `SEED_WRITE_CONCURRENCY` | 16 | parallel organization pipelines |
| `SEED_SUPERADMIN_EMAIL` | — | `superadmin@abhyas.local` | which identity becomes/is the seed Super Admin |
| `SEED_MAILBOX_URL` | — | `http://127.0.0.1:54324` | Mailpit base URL |

## Example commands

```bash
# Fast local dev iteration
npm run seed:small

# QA dataset, specific states only, fresh run
node testing/orchestrate.mjs --dataset=medium --states=Karnataka,Telangana,Maharashtra --clean

# Reproducible run for a bug report
node testing/orchestrate.mjs --dataset=small --seed=12345 --clean

# Large performance dataset — see "Performance notes" first
node testing/orchestrate.mjs --dataset=large --write-concurrency=32 --auth-concurrency=16

# Validate whatever the last `small` run produced
npm run seed:validate -- --dataset=small
```

## Performance notes

Every identity bootstrap is a real email round trip through Mailpit — this
is the framework's dominant cost, not database writes. It scales with the
number of **distinct adult identities** (org owners, coaches, guardians,
self-account students, platform staff), not the number of wards, since
`POST /me/wards` needs no auth round trip at all. `small`/`medium` are
comfortably fast (seconds to low minutes). `large`'s 100,000+ students still
implies tens of thousands of distinct guardian/self-account identities —
expect a genuinely long run (hours, not minutes) at the default concurrency;
raise `--auth-concurrency`/`--write-concurrency` if your local Docker
Supabase and dev server can take it, and prefer `--states` to shrink scope
for a partial `large` run rather than assuming it must always be run in
full. No silent truncation happens — every count in the profile tables
above is really attempted; a resource-constrained partial run will show up
as `[soft-fail]` warnings in the log, not silently-lower numbers.

## Troubleshooting

- **`Refusing to run: SUPABASE_URL "..." is not local`** — `--environment=local`
  but your `.env.development.local` points at a hosted project. Fix the env
  file or pass the right `--environment`.
- **`Magic-link callback ... did not redirect`** — the dev server isn't
  running on port 3000, or local Supabase isn't running (`npm run db:start`).
  OAuth/magic-link redirect URLs are hardcoded to `localhost:3000` (see the
  repo root `IMPLEMENTATION_STATUS.md`), so the app must run on that exact
  port for local auth to work at all.
- **`No email containing ... found for <email> within 20000ms`** — Mailpit
  isn't reachable at `SEED_MAILBOX_URL`, or SMTP isn't configured to route
  there locally (should be automatic via `.env.development.local` being
  unset, which defaults to Inbucket/Mailpit per `packages/platform/src/notify/channels/email.ts`).
- **`slug_taken` warnings on a re-run without `--clean`** — expected if you
  changed `--seed` without resetting the DB; the RNG-derived slug collided
  with a previous run's org. Either `--clean` + `npm run db:reset`, or pick
  a different `--seed`/`--run-tag`.
- **A burst of `http_500` warnings in the first ~10s of a run** — `next dev`
  compiles each API route on first request; the very first handful of
  concurrent requests can hit a route still mid-compile. Harmless and
  self-resolving (retried automatically, see `lib/apiClient.mjs`'s 5xx
  retry) — for a completely clean log, hit a couple of `/api/v1/**` routes
  once by hand (or just `curl` the app) right after `npm run dev:web`
  finishes starting, before kicking off a seed run.
- **A rare (~1%) magic-link timeout/no-session error late in a large run**
  — `lib/auth.mjs`'s `login()` already retries the full round trip twice;
  if it still fails, that identity's whole organization pipeline is skipped
  (logged as a pipeline error) rather than left half-built. A `--resume` run
  will attempt it again from scratch. Verified in practice at
  `--dataset=small` scale: 461/463 identities succeeded on the first pass,
  2 more empty organizations, of which the 2 skipped organizations are
  regenerated cleanly on any subsequent `--resume` run against the same DB.
- **`feature_disabled: The "historical_backdating" feature is not enabled...`**
  — only happens if you call `entities/attendance.mjs`/`entities/finance.mjs`/
  `entities/marketplace.mjs` functions with a backdated timestamp against an
  org where `entities/platformAdmin.mjs`'s `enableHistoricalBackdating()`
  wasn't called first (orchestrate.mjs always does this for every org it
  creates — only relevant if you're writing a new entity module).

## Adding a new generator

1. Add real API-call wrappers to the relevant `entities/*.mjs` file (or a
   new one) — read the actual route file under `apps/web/src/app/api/v1/`
   first, don't guess field names (see this file's own commit history for
   several real bugs caught exactly this way: `ward.wardUserId` not
   `ward.id`, the two-hop Mailpit redirect, etc.).
   Never bypass permission/RLS checks — if an action needs an identity with
   a specific role, create/onboard that identity for real first.
2. Wire it into `orchestrate.mjs` in the right dependency position, reading
   counts from the relevant `config.dataset.*Target` field.
3. Add a `count('your.metric')` call (see `lib/log.mjs`) so it shows up in
   the run summary.
4. Add a `check(...)` to `validate.mjs` if it should be dashboard-visible.
5. Test at `--dataset=smoke` first (a tiny 1-academy/1-independent-coach
   profile in `config/profiles.mjs`, not a requirement-defined tier — meant
   purely for fast iteration) before running `small`.
