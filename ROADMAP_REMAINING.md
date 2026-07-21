# Abhyas V2 — Remaining Roadmap (post–Phase 12)

Forward-looking plan for everything left after Phase 12 (Coach & Staff HR).
Companion to [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md), which is
the backward-looking record of what's already built. Source of truth for
architecture stays `docsV2/*.md`.

**Status when written:** Phases 1–12 done (Core Infra → … → Staff HR).
Remaining roadmap phases: **13 Progress · 14 Medical (schema-only) · 15
Security hardening · 16 Testing · 17 Cutover.** Plus two items that were never
assigned to a phase in the original 17-phase plan: **Dashboards** and the
**accumulated deferred debt**.

Module stubs already exist for `progress` (targets Phase 13) and `medical`
(Phase 14) with READMEs declaring scope. CI has `test` / `test:isolation`
steps that currently exit 0 as placeholders — Phase 16 makes them real. Next
migration number is `0015`.

---

## Phase 13 — Progress & Performance (last feature module, M11)

**Goal:** coaches log sport-specific metrics + vitals per student; students /
guardians see progress over time.

**Schema (migration 0015, Doc 07 §13 literal):**
- `metric_definitions` — `organization_id` nullable (NULL = platform library
  per sport), `sport_key`, `key`, `label`, `unit`, `direction`
  (`higher_better` / `lower_better`). Seed a starter platform library per sport,
  same "platform reference data in a migration" pattern as taxonomy (Phase 11).
- `progress_entries` — `enrollment_id` FK, `metric_key`, `value numeric`,
  `note`, `recorded_by`, `recorded_on date`. Denormalize `organization_id` /
  `branch_id` for RLS, same convention as Attendance / Staff HR.

**RLS — reuse existing helpers, no new permission keys:**
- coach write: `has_perm_branch('progress.metric.log', branch_id)` +
  own-batch scoping via `my_batch_ids()` (Phase 4/7).
- staff read: `has_perm_branch('progress.read', branch_id)`.
- guardian / student read: `is_my_ward()` / self (Phase 6).
- Keys `progress.metric.log` / `progress.read` / `progress.report.generate`
  are already seeded in migration 0006.

**Service + routes + UI:** metric-definition CRUD (org-custom + read platform
library), log entries against an enrollment, list a student's history.
`/progress` staff console; read-only trend cards on `/family` (guardian) and a
student self-view.

**Decision (made):** charts are **hand-rolled SVG sparklines / line charts, no
new dependency** — the repo has no chart lib, the data is one series per
metric, and this matches the boring-stack constraint. Revisit `recharts` only
if a later dashboard needs richer viz.

**Done when:** coach logs a metric for an enrolled student, guardian sees the
trend on `/family`, RLS blocks a non-enrolled user, `db:check-rls` green,
`tsc` + lint clean.

---

## Dashboards (cross-cutting — scheduled next, after Phase 13)

Never a phase in the original roadmap. Doc 05 §7 specifies post-login routing
by highest role (Owner/Admin → admin dashboard, Coach → today's batches,
Student → my schedule, guardian-with-no-membership → children dashboard);
Doc 01 US-6 wants org-level branch-aggregated attendance + collections; US-2
wants per-child guardian cards.

Read-only aggregation over tables that now all exist (attendance, finance
ledger, scheduling, progress). Buildable but non-trivial. Sequenced right
after Progress so coach/student home screens can include progress trends.
Scope to be pinned down when we start it.

---

## Phase 14 — Medical Vault (schema-only, M12)

**Goal:** model the encrypted store so consent/vault design doesn't retrofit.
**No UI, no API in v1** (module README: "reserved directory, no module code
beyond schema + KMS plumbing").

**Schema (migration 0016, Doc 07 §14):**
- `medical_records` — `organization_id` nullable (identity-level), envelope-
  encrypted payload path, record kind. Per-org data keys (Doc 02 §7).
- `medical_access_grants` — grantee, scope, expiry, granted by guardian/self
  via `consents.kind = 'medical_access'` (`consents` exists since Phase 2).

**Guardrails:** tables + RLS only (RLS still required for the coverage gate —
default-deny plus a self/guardian read policy). `packages/platform/src/kms`
stays interface-only (matching how `payments`/`storage` adapters stayed typed-
only until their phase). Small, fast phase.

**Done when:** migration applies, `db:check-rls` green, no other module
imports it.

---

## Phase 15 — Security Hardening (Doc 13 Launch Gate)

Split explicitly — several launch-gate items are infra-gated and out of POC
scope.

**Buildable now (real Phase 15 deliverable):**
- **Audit-logging retrofit** — the big one. Every phase since Phase 5 flagged
  that its writes don't call `writeAuditLog()` (role grants, invite accept,
  join-request decide, listing/lead/review writes, most of Staff HR). The
  `write_audit_log()` SQL fn + `@abhyas/module-audit` wrapper already exist —
  this is wiring call sites, not new infra.
- **Isolation test suite** (overlaps Phase 16) — cross-tenant / guardian /
  coach / anon RLS shapes the gate calls "green."
- **Service-role manifest CI check** — manifest exists; wire the grep-against-
  call-sites check its own comment references.
- **Rate limits** on public/auth endpoints (in-app, no vendor).
- Zero-public-buckets check + signed-URL cross-org tests — largely a no-op
  until a real storage/upload pipeline exists (adapter is interface-only).

**Infra-gated (document as deferred, don't build):**
- MFA on platform roles (depends on auth backend; phone OTP deferred by scope).
- Gateway webhook signature verification + reconciliation (no gateway config).
- Pen-test (budget item, Doc 13 §18).
- DPDP export/erasure jobs + consent text (en/hi/te), breach templates
  (i18n scaffolding exists; real work — decide if v1-blocking for the POC).

**Recommendation:** ship audit-retrofit + CI gates as Phase 15; produce a
written "launch gate status" marking infra-gated items deferred with rationale.

---

## Phase 16 — Testing

Turn the two CI placeholders into real suites (no runner configured yet).

- **Runner:** `node:test` + `tsx` (zero-dep, matches the ad-hoc live-DB smoke
  scripts phases already wrote) — lean this over Vitest.
- **Isolation suite** (Doc 13 §2.2) — highest value: raw-SQL cross-org
  isolation, guardian/coach/anon RLS shapes, column-grant locks. Consolidate
  the throwaway versions phases already wrote.
- **Service unit tests** — the negative paths each phase smoke-tested
  (duplicate slug, non-member writes, RLS denials, state-machine violations).
- **Regression targets:** the real cross-actor RLS bugs found in Phases
  7 / 8 / 10 / 11 / 12 — lock each so it can't regress.

**Done when:** `npm run test` + `npm run test:isolation` actually run and pass
in CI, isolation covers the gate's guardian/coach/anon shapes.

---

## Phase 17 — Cutover (documentation + rehearsal, not v1 code)

Per Doc 14 §12, **not a v1 deployment step** — the Kubernetes migration
runbook, triggered only by cost crossover (~₹2L+/mo), white-label custom-domain
auth, or Supabase limits. The adapter pattern (`packages/platform`), our-own-
JWT sessions, and org-keyed tables were built to make this a config swap.

For v1: verify `auth`/`storage`/`kms` adapters are genuinely swappable,
validate the 6-step runbook against staging once, confirm the isolation suite
runs against a "dark stack." Stays a paper exercise until a real trigger
fires. **The actual v1 "ship it" gate is Phase 15, not this.**

---

## Deferred debt (decide per item; don't auto-build)

Each explicitly logged across phases as "designed, not configured":

| Item | Status | v1-blocking? |
|---|---|---|
| Audit-logging retrofit | Function exists, call sites missing | **Yes** → Phase 15 |
| Document upload pipeline (signed-URL / ClamAV) | No storage impl anywhere | Needed for real KYC/proof; POC uses text refs |
| Gateway payments (Razorpay Route) | Manual-only Finance | No — POC accepts manual proof |
| Phone OTP | Deferred by scope decision | No — blocks minor login, known |
| WhatsApp / SMS channels | Stubs return `not_configured` | No — email/push are v1 |
| Featured-placement checkout | Schema only | No |
| Referral-reward approval UI | Routes exist, no `/platform` tab | Minor — one console tab |
| Subscriptions / billing checkout | Schema only | No — no paid tier in POC |
| Document review → role activation gate | `review_status` is data-only | No — known gap (Staff HR) |

---

## Recommended sequence

1. **Phase 13 — Progress** ← in progress
2. **Dashboards** (needs scope pin-down)
3. **Phase 14 — Medical (schema-only)** — fast
4. **Phase 15 — Security** — audit retrofit + CI gates; infra-gated deferred
5. **Phase 16 — Testing** — isolation suite + RLS regression locks
6. **Phase 17 — Cutover** — docs/rehearsal, non-blocking
