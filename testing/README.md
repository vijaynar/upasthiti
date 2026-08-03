# Abhyas Test Data Seeding Framework

Populates a fresh (or existing) Abhyas V2 environment with realistic,
interconnected demo/test data — academies, independent coaches, sub-coaches,
students, batches, attendance history, finance, reviews, and platform
administration/approval-queue activity — **exclusively through the
application's real REST API** (`/api/v1/**`), driven by real authenticated
sessions for every actor. No SQL scripts, no direct database writes for
seed *data* (see "Auth bootstrap" below for the one, narrow, pre-existing
exception this relies on, which predates this framework).

## Scenario coverage

What a seed run actually produces, so it's clear what "seeding" means here
without reading the whole script. Every row below is real data through a
real API call — see "Data generation order & dependencies" for exactly
where in `orchestrate.mjs` each one happens.

| Scenario | Coverage |
|---|---|
| Batches | Created per org, spread across every real branch, real weekly schedule, capacity |
| Students enrolling in batches | Bulk direct-enroll (majority) + a smaller real join-request→approve/reject path |
| Student attendance | Weighted present/late/absent history against backfilled + forward sessions |
| Coaches in an academy | Head coach + N coaches, real invite→accept→onboard, certifications, leave requests |
| Different roles in an academy | `owner`, `coach`, `assistant_coach`, `org_admin`, `front_desk`, `accountant`, and `branch_admin` (for academies with 2-3 branches) — every seeded org-scope role except `student`, which is covered separately |
| Academies with multiple branches | ~45% of academies get a real 2nd/3rd branch (`POST /branches`); batches, coach assignments, and a dedicated `branch_admin` are all branch-scoped |
| Different roles at the platform level | `super_admin` (bootstrap) + `verification_ops`/`support`/`platform_finance`/`marketplace_partner` |
| Parent (guardian) enrollment | Guardian creates a ward (`POST /me/wards`, no auth round trip) → staff direct-enrolls the ward |
| Parent with 2+ kids at different academies/independent coaches | Happens incidentally at scale (35% guardian-reuse pool shared across both org-type loops) **and** is separately force-guaranteed by a dedicated post-pass (see "Cross-org guardian siblings" below), so it's never left to chance alone |
| Independent coaches + sub-coaches | Self-serve onboarding (`POST /me/onboard-coach`); ~30% get one `assistant_coach` sub-coach |
| Finance | Charges with paid/open/waived/cancelled outcomes, ledger entries, payouts |
| Marketplace | Listings, verification queue, reviews (self-account students only — see "Reviews" below) |
| Profile completeness | Every real (logged-in) identity gets display name, gender, phone, DOB, and a lightweight generated avatar — not just a bare display name. See "Profile completeness" below for what's still out of reach (wards) and why |
| Coach documents | Every coach-like identity with a `staff_profile` (academy coaches, sub-coaches, self-onboarded independent coaches) gets all three real `staff_documents` types: `certification`, `id_proof` (this app's closest real equivalent to "Aadhaar" — no dedicated govt-ID field exists anywhere in the schema), and `address_proof` |
| Progress metrics | Skill-metric history (`progress_entries`, e.g. height/weight/resting-HR plus sport-specific metrics like 50m freestyle or batting average) logged weekly per student against the real platform metric library. **Opt-in**: only seeded when the resolved profile sets `progressDays` (currently only `coachxs`) — see `entities/progress.mjs` |

## Quick start

```bash
npm run db:start          # local Supabase (Docker) — first run pulls images
npm run db:reset          # applies migrations incl. 0007_seed_historical_backdating.sql
npm run dev:web           # the app must be running on :3000 — OAuth/magic-link
                           # redirect URLs are hardcoded to localhost:3000
npm run seed:small        # in a second terminal
npm run seed:validate -- --dataset=small
npm run seed:credentials -- --dataset=small   # who did it just create? (see below)
```

Every demo identity signs in via the app's real magic-link flow — nothing
to remember, but if you want to browse as one of them yourself, open
`http://127.0.0.1:54324` (Mailpit) and request a fresh magic link for that
email from `/auth/login`.

## Login-reference table (`credentials.mjs`)

**Yes — any time, as many times as you want, for any past run.** There are
no passwords anywhere in this app (Google OAuth + email magic-link only —
see "Auth bootstrap" below), so `orchestrate.mjs` records every real
identity it creates (email, display name, role, org type, org slug) to
`state.actors` in that run's `.state/<run-tag>.json` file as it goes.
`testing/credentials.mjs` is a **separate, read-only** script that just
reads that file back and prints/exports a filterable table — it does NOT
need the dev server, Supabase, or Mailpit running, and does not touch the
network at all. Run it immediately after a seed finishes, or weeks later,
or ten times in a row with different filters — it's just reading JSON off
disk.

The one thing it needs is the **same `--dataset`/`--seed`/`--run-tag`
combination the seed run used**, so it resolves to the same state file
(default run-tag is `<dataset>-<seed>`, e.g. `small-42`). If you don't
remember it, the file itself is right there: `ls testing/.state/`.

### Email format

Every generated email embeds its own role, so you can tell what an identity
is for from the address alone, without cross-referencing anything
(`lib/fakeData.mjs`'s `emailFor`):

- Non-platform (org-scoped) identities: `<firstName>.<lastName>.<role>.<counter>@abhyas.local`
  — e.g. `priya.sharma.coach.small-42.17@abhyas.local`, `arjun.reddy.owner.small-42.3@abhyas.local`,
  `meera.iyer.guardian.small-42.44@abhyas.local`.
- Platform-staff identities: `<firstName>.<lastName>.platform.<role>.<counter>@abhyas.local`
  — e.g. `rohan.gupta.platform.verification_ops.small-42.2@abhyas.local`.
- `<role>` is one of `owner` / `coach` / `assistant_coach` / `org_admin` /
  `front_desk` / `accountant` / `branch_admin` / `student` / `guardian`, or
  (for platform identities) `verification_ops` / `support` /
  `platform_finance` / `marketplace_partner`. Super Admin is the one
  exception — it's a fixed, env-configurable identity
  (`SEED_SUPERADMIN_EMAIL`, default `superadmin@abhyas.local`), not
  generated.
- `<counter>` is `<run-tag>.<sequence-number>` (the run-tag keeps two
  different seed runs against the same DB from colliding, same as before).

```bash
# Basic: everyone from the last `small` run, as a console table
node testing/credentials.mjs --dataset=small
npm run seed:credentials -- --dataset=small          # equivalent, via package.json

# Filter by role / type / specific org
node testing/credentials.mjs --dataset=small --role=coach
node testing/credentials.mjs --dataset=small --role=branch_admin
node testing/credentials.mjs --dataset=small --type=academy         # academy-side identities only
node testing/credentials.mjs --dataset=small --type=parent          # guardians only
node testing/credentials.mjs --dataset=small --org=some-academy-1234  # one specific org's people
node testing/credentials.mjs --dataset=small --role=coach --type=academy --limit=10

# A non-default run (custom --seed, --run-tag, or --environment used at seed time)
node testing/credentials.mjs --dataset=medium --seed=12345
node testing/credentials.mjs --run-tag=my-custom-tag
node testing/credentials.mjs --dataset=small --environment=staging

# Export instead of printing
node testing/credentials.mjs --dataset=small --format=csv                    # CSV to stdout
node testing/credentials.mjs --dataset=small --format=csv --out=actors.csv   # CSV to a file
```

`type` is `academy` / `independent_coach` / `platform` / `parent`; `role` is
the actual functional role (`owner`, `coach`, `assistant_coach`, `org_admin`,
`front_desk`, `accountant`, `branch_admin`, `student`, `guardian`,
`super_admin`, or one of the platform staff roles). **If one identity holds
more than one role, the `role` column shows all of them comma-separated on a
single row** (`coach,org_admin`), rather than one row per role — this
framework's own seeding never assigns a single generated identity more than
one role, but a live org can, and `--live` reconstruction respects
`roleKeys` arrays with more than one entry the same way. Wards
(guardian-created profile-only children) have no email/login of their own
and are correctly absent from this table — only real authenticated
identities appear. To actually log in as any row: go to `/auth/login`, enter
that email, then fetch the magic link from Mailpit
(`http://127.0.0.1:54324` locally) and click it — identical to what a real
user does, see "Auth bootstrap" below.

### `--live`: reconstruct from the running app when disk has nothing (or is incomplete)

If `state.actors` is empty — most commonly a state file seeded **before**
actor-tracking existed, e.g. an existing `small` dataset seeded with an
older version of `orchestrate.mjs` — `--resume` won't fix it: resume skips
recreating any org that's already in the state file, so `recordActor()`
never runs for those pre-existing identities, no matter how many times you
re-run the seed. Two ways forward:

- `--clean`: a full fresh re-seed. Complete, but slow and throws away the
  existing data.
- **`--live`: reconstructs what it can from the live app itself**, via real
  API calls (same "no direct SQL for data" rule the whole framework
  follows — see "Architecture" below), and writes the result back into the
  state file so this only has to happen once. Unlike every other
  `credentials.mjs` invocation, `--live` is NOT a pure disk read — it makes
  real magic-link logins, so (same prerequisites as `orchestrate.mjs`
  itself) the dev server, local Supabase, and Mailpit all need to be running:

```bash
# Reconstruct actors for an existing `small` dataset that predates this
# feature, writing the result back to disk, then show the table
node testing/credentials.mjs --dataset=small --live

# Same, but only print coaches from the reconstructed set
node testing/credentials.mjs --dataset=small --live --role=coach

# After the first --live run, disk now has the data — plain runs work again
node testing/credentials.mjs --dataset=small
```

What `--live` can and can't recover:

| Identity | Recoverable via `--live`? | How |
|---|---|---|
| Org owners | Yes, from disk alone | Owner email is embedded in the org's own state-file key (`academy-<i>-<ownerEmail>`) |
| Coaches, assistant coaches, org_admin, front_desk, accountant, branch_admin, sub-coaches | Yes, real API call | `GET /orgs/{id}/invitations`, logged in as the org owner — invitation rows never disappear after acceptance, and this is the only place the app exposes a member's email back to anyone but themselves. Only invitations with `acceptedAt` set are used (unaccepted ones never became a real login) |
| Platform staff + Super Admin | Yes, from disk alone | Already tracked separately in `state.platformStaff`, no live call needed |
| Guardians, self-account students | **No** | This app has no org-scoped (or any) API that exposes a user's email to anyone but themselves — a deliberate privacy/RLS boundary, not a gap `--live` can work around. Only a fresh `--clean` seed run recovers these |

Reconstructed rows also can't recover the *exact* originally-generated
display name (invitations only carry the target email) — `--live` derives a
readable name from the email's own `firstname.lastname.*` shape instead (see
`lib/fakeData.mjs`'s `emailFor`), which won't reflect a name changed after
signup. `--live` makes one real magic-link-authenticated API call per
organization, so it's not instant on a `medium`/`large` dataset — the
console shows progress as it scans.

## Architecture

```
testing/
  orchestrate.mjs        # main entrypoint — wires everything below in
                          # dependency order per dataset profile
  validate.mjs            # post-seed validation (requirement #21)
  credentials.mjs          # login-reference table export/query (see above)
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
   c. **Academies only, branches**: ~55% stay single-branch, ~30% get a real
      2nd branch, ~15% get a 3rd (`POST /branches`) — every batch/coach/
      student below is spread across whichever branches the org actually has.
   d. **Academies only, org-level roles**: one `org_admin`, one `front_desk`,
      one `accountant` (org-wide, real invite→accept→active-role, no HR
      profile needed for these); one `branch_admin` per branch BEYOND the
      default one (branch-scoped membership).
   e. **Academies only**: N coaches via the real invite→accept→onboard
      pipeline (`staff_profiles` + `coach_profiles`, mirroring
      `CoachProfileWizard`'s admin mode), each scoped to one of the org's real
      branches, certifications, leave requests.
   f. **Independent coaches only**: self-onboard via `POST /me/onboard-coach`
      + pricing (mirroring the wizard's self mode); a subset get one
      sub-coach (`assistant_coach` role, same invite pipeline). Independent
      coaches are single-location by nature — no extra branches.
   g. Programs + batches (real taxonomy-matched sport/category, spread across
      the org's branches) → coach assignment (preferring a coach scoped to
      the same branch) → **session backfill** (past window) — batch
      creation's own forward materialization covers the rest.
   h. Students: majority via guardian → `POST /me/wards` (no auth round
      trip) → staff direct-enrolls the ward; a smaller self-account subset
      get a real login (needed for reviews — see below); a further small
      slice goes through a real join-request → staff decide (pending/
      approved/rejected mix, Requirement #14).
   i. Per enrolled student: batch roster, attendance history (weighted
      present/late/absent profile, against backfilled + forward sessions
      only — never a future 'scheduled' session), 1-3 charges with a mixed
      paid/open/waived/cancelled outcome, backdated payments.
   j. Reviews — **only** from the self-account student subset (RLS requires
      the review's own author session; a profile-only ward has none, see
      "Known gaps").
4. **Cross-org guardian siblings** (after every academy and independent
   coach exists): every bulk-enrolled ward's `(orgType, orgId, wardUserId)`
   is tracked per guardian email as it's created in step 3h above. Once both
   loops finish, a dedicated pass picks guardians who (so far) only have kids
   at ONE org type and deliberately enrolls a second ward for them at a real
   org of the OTHER type — so "a parent with kids at both an academy and an
   independent coach" is a guaranteed scenario, not left to the 35%
   guardian-reuse chance in step 3h alone. Recorded to
   `state.crossOrgSiblings` (`{guardianEmail, linkA, linkB}`, each link an
   `{orgType, orgId, wardUserId}`) so `validate.mjs` can assert it really
   happened.

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

## Profile completeness: gender/DOB/avatar/documents

Every real (logged-in) identity this framework creates — org owners,
coaches, sub-coaches, org_admin/front_desk/accountant, branch_admin,
platform staff, guardians, self-account students — gets a full `PATCH /me`
call with `displayName`, `gender`, `phone`, `dob` (age range varies
realistically by role, e.g. owners 30-60, students 7-45), and a real
`avatarPath`. Coaches additionally get all three real `staff_documents`
types (`certification`, `id_proof`, `address_proof`) via
`addCoachDocuments()` — applied to academy coaches, sub-coaches, *and*
self-onboarded independent coaches (whose own `staff_profile` is created
implicitly by `selfOnboardAsCoach`, confirmed by reading the
`/me/onboard-coach` route's own comment).

**Avatars are a tiny inline SVG data URI** (`fake.avatarFor` — an initials-
on-a-colored-square image, a few hundred bytes, base64-encoded), not a real
Supabase Storage upload. `avatarPath` is rendered as a plain `<img src=...>`
everywhere in the app (confirmed by reading the public coach profile page),
so a `data:` URI works identically to a real signed-upload public URL with
zero network calls and zero real file storage — genuinely "very
lightweight," not a placeholder that needs replacing later.

**"Aadhaar" maps to `id_proof`, not a new field** — this app has no
dedicated Aadhaar/government-ID column anywhere in the schema (confirmed
against every migration; `docsV2/00_gap_analysis.md` even flags the
KYC-document-storage question as an open risk). The closest real mechanism
is `staff_documents.doc_type IN ('id_proof', 'address_proof',
'certification', 'background_check', 'other')` — a generic file-reference
row (`storage_path` is free text, no real upload pipeline, same as the
pre-existing certification doc). `id_proof`/`address_proof` reuse that
exact mechanism rather than inventing a new schema field this framework has
no business adding on its own.

**Wards are the one real gap, and it's an app limitation, not a framework
one**: `POST /me/wards` only accepts `displayName`/`relationship`/`dob`/
`consentAuthority` — no `gender`, no `avatarPath`, and there is no
`PATCH /me/wards/{wardUserId}` route at all to set them afterward (checked
directly). A profile-only ward already gets a real DOB (age-appropriate,
7-16 for the join-request path, matching its guardian-created sibling in
the bulk path) — gender and avatar simply aren't settable for a ward
through any real API today.

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
| `coachxs` | 0 | 2 | 20 | 45 | `npm run seed:CoachXS` |

Counts are **approximate** targets (per Requirement #15's own "approximately"
language) — actual per-organization batch/student counts are derived with
rng jitter, not forced to an exact divisor.

Dataset profile names (`--dataset=...` / `SEED_DATASET`) are matched
case-insensitively (`CoachXS`, `coachxs`, `COACHXS` all resolve to the same
profile) and the resolved name is normalized to lowercase before it's used to
derive a default `--run-tag` or state-file name — otherwise `--dataset=CoachXS`
and `--dataset=coachxs` would silently derive two different run-tags for the
same profile (and collide unpredictably on a case-insensitive filesystem,
where `CoachXS-42.json` and `coachxs-42.json` are the same file on disk).

### `coachxs` — independent-coach feature depth, not scale

Not a requirement-defined tier like the three above — a small, hand-picked
scenario profile for exercising coach-facing depth locally without waiting
out a `small` run. `npm run seed:CoachXS` (`--dataset=coachxs`, any casing)
creates:

- **2 independent coaches**, 0 academies (`academyCoachesTarget: 0` — every
  seeded org here is an independent coach; `subCoachesTarget: 1` still gives
  a real shot at one sub-coach, same 30%-chance path `small`/`medium`/`large`
  use).
- **20 students** total, split across the 2 coaches. (The generic
  indie-coach student count is normally discounted 40% relative to academies
  — see `orchestrate.mjs`'s `indieStudentShare` — because indie coaches are
  usually the *minority* org type alongside a larger academy population.
  With `academies: 0`, that discount would silently under-deliver
  `studentsTarget`, so it's skipped whenever a profile seeds zero
  academies.)
- **10 of those 20 are guaranteed real, adult (18+) self-account students**
  — not guardian-created wards — via `adultSelfAccountTarget: 10`
  (`orchestrate.mjs`'s `adultSelfAccountBudget`, same global-cap/synchronous-
  decrement pattern as `dailyClassesTarget` below). Every other profile
  leaves the self-account-vs-ward split to the usual ~20% random chance with
  no age floor; this is the one profile where a guaranteed count of loggable-
  in, adult students is forced instead. The other 10 students still follow
  the normal random mix (mostly guardian-created wards, any age 7-45).
- **~5-6 batches** (`batchesTarget: 5`, rounds to ~3 per coach) — of which
  **3 (globally, across both coaches) run a full 7-day/week schedule**
  instead of the usual random 2-4 days/week, via `dailyClassesTarget: 3`.
  Guarantees "3 different classes running every day" rather than leaving it
  to chance; the remaining batches keep the normal random weekly pattern.
  This is a profile-only knob, not exposed as a CLI flag (see
  `profiles.mjs`).
- **45 days of attendance history** (`attendanceDays: 45`, same mechanism
  every profile uses).
- **30 days of progress-metric history** (`progressDays: 30`) — this is the
  one profile where progress-metric seeding is turned on at all; see
  "Progress metrics" in the scenario table above and `entities/progress.mjs`.
  Override with `--progress-days=N` / `SEED_PROGRESS_DAYS` the same way
  `--attendance-days` overrides `attendanceDays`.
- Everything else every other profile already produces — verification-queue
  variety, join-request approvals, mixed charge outcomes, real states/cities
  spread across India — unchanged, since `coachxs` reuses the exact same
  org-build pipeline, just with different count targets.

```bash
npm run seed:CoachXS
npm run seed:validate -- --dataset=coachxs
npm run seed:credentials -- --dataset=coachxs
```

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
| `--progress-days` | `SEED_PROGRESS_DAYS` | profile default (unset on most profiles) | override progress-metric history depth; unset ⇒ no progress-metric seeding at all (see "Progress metrics" in the scenario table) |
| `--clean` | — | off | fresh run, ignores/overwrites the state file |
| `--resume` | — | on (unless `--clean`) | skip already-created organizations |
| `--run-tag` | `SEED_RUN_TAG` | `<dataset>-<seed>` | state file name + email uniqueness tag — set explicitly to run two datasets against the same DB without collisions |
| `--auth-concurrency` | `SEED_AUTH_CONCURRENCY` | 4 | parallel magic-link round trips (Mailpit-bound) — currently unused by `orchestrate.mjs` itself (reserved for a future parallel-auth pass), doesn't affect current run speed |
| `--write-concurrency` | `SEED_WRITE_CONCURRENCY` | 3 | parallel organization pipelines — deliberately conservative for `next dev` + the app's 10-connection Postgres pool (see `config/index.mjs`'s own comment for the load-testing history); raise it once you're on a production build or a bigger pool |
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

# Small coach-focused profile (see "coachxs" above): 2 independent coaches,
# 20 students (10 guaranteed real adult self-account), 45 days attendance +
# 30 days progress-metric history
npm run seed:CoachXS

# Override progress-metric depth independently of the profile default
node testing/orchestrate.mjs --dataset=coachxs --progress-days=60
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
