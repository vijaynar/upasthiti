# Abhyas V2 Rebuild — Implementation Status

**Read this first in any new session working on this repo.** It's the handoff
between context windows — everything here is either already decided (don't
re-litigate) or already built (don't rebuild). Source of truth for
architecture is `./docsV2/*.md` (11 docs, already read/cross-referenced once;
re-read only the specific doc a phase needs, not all of them).

## Ground truth

- **Branch**: `AbhyasV2` is the rebuild branch. `main` is the untouched V1 app
  (production escape hatch). This is a **big-bang rebuild** — no
  compatibility shims, no dual-schema support. Local `supabase db reset` on
  this branch now serves the V2 schema only; V1's local dev experience is
  intentionally not preserved here (V1 lives on `main`).
- **Roadmap**: 17 phases, defined in full in conversation history (not
  re-pasted here — regenerate from `docsV2/00-15,17` if truly lost, but it
  shouldn't be: phase list is Core Infra → Auth/Identity → Multi-Tenancy →
  RBAC → Platform Admin → People → Scheduling → Attendance → Finance →
  Notifications → Marketplace → Staff HR → Progress → Medical(schema-only) →
  Security hardening → Testing → Cutover).
- **User-approved scope changes (2026-07-19), override the docsV2 text**:
  1. **Auth methods**: Google OAuth + email magic link **only**. Phone OTP is
     fully designed in Doc 05 but deliberately NOT implemented — keep the
     `auth_methods.provider` schema open for it (comment, don't build).
     Consequence: Doc 05 §9's guardian-enabled minor login (13-17, phone
     verification) can't work yet — minors stay profile-only until phone
     OTP lands later. Don't build a workaround.
  2. **Notifications**: build the full schema/queue, but WhatsApp/SMS
     channel adapters are stubs returning `not_configured` (already done in
     Phase 1: `packages/platform/src/notify/channels/{whatsapp,sms}.ts`).
     Email + push are the real v1 channels.
  3. **Mobile**: `apps/mobile` is skipped entirely. Everything is
     responsive web in `apps/web`, mobile-compatible (browser camera via
     `getUserMedia` for attendance scanning, not a native app). Doc 08 §12's
     true offline-sync guarantee is a known gap versus the original design.
  4. **Face embeddings**: keep the current working 128-dim face-api.js
     model (not Doc 07's literal `vector(512)`) — add a schema comment
     flagging the future 512-dim migration path when this is revisited.
     (Not yet built — lands in Phase 8.)

## Phase 1 — Core Infrastructure: ✅ DONE, verified

What exists (don't recreate):
- `supabase/migrations_v1_legacy/` — archived V1 schema + seed (reference only).
- `supabase/migrations/0001_extensions.sql`, `0002_jobs_queue.sql` — live V2 schema so far.
- `supabase/seed.sql` — empty placeholder, V2 fixtures land in Phase 2-3.
- `packages/platform/src/{db,auth,storage,queue,notify,payments,kms}` — adapters.
  `db` (real: `withRequestContext`, `getServiceClient`, service-role manifest) and
  `queue` (real: enqueue/claim/complete/fail) are working. `auth`/`storage`/`payments`/`kms`
  are typed interfaces only, no implementation yet. `notify` channels: whatsapp/sms
  stubbed `not_configured`, email/push interfaces not yet implemented.
- `packages/kernel/src/{session,money,rbac,i18n,schemas}` — `money` is real/usable now.
  `rbac.can()` throws "not implemented until Phase 4" by design.
- `packages/modules/<name>/src/service.ts` — 12 empty stubs (`identity-auth`, `tenancy-rbac`,
  `people`, `scheduling`, `attendance`, `finance`, `notifications`, `marketplace`, `staff-hr`,
  `progress`, `platform-admin`, `audit`) + 2 reserved (`medical`, `ai-insights`). Each has a
  README stating its target phase and table ownership.
- `apps/worker/` — queue poller (`--once` for cron, loop otherwise), `src/registry.ts` is
  the empty job-kind → handler map modules register into.
- `eslint.config.mjs` — lints ONLY the new tree (`packages/platform`, `packages/kernel`,
  `packages/modules`, `packages/db-types`, `apps/worker`). `apps/web`, `apps/mobile`,
  `packages/common`, `packages/database` are globally ignored (legacy, exempt until rebuilt).
  Enforces: provider SDKs only in `packages/platform/*`; no reaching into another module's
  `src/`; no interpolated-value SQL template literals (parameterized only).
- `.github/workflows/ci.yml` — lint → type-check → migrate on ephemeral pgvector/postgres
  container → RLS coverage gate (`scripts/check-rls-coverage.mjs`) → test placeholders.
  No deploy stages yet (no hosting project provisioned).
- `scripts/generate-keys.mjs` (`npm run keys:generate`) — RS256 keypair for our own
  session JWTs, base64'd into `.env.development.local` as `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`.
- `scripts/check-rls-coverage.mjs` — verified working against real local Postgres, including
  a smoke test that it correctly fails on an unpolicied table.
- Root `package.json`: `db:*` scripts (Doc 17 naming) added alongside the old `supabase:*`
  ones (kept for now — same underlying commands). `lint` = `eslint .` only (root cause:
  `apps/web`'s `next lint` is independently broken on this Next.js version, pre-existing
  on `main` too, unrelated to this rebuild — `lint:legacy` runs the old `turbo run lint`
  if you ever need to check that separately). `test`/`test:isolation` are placeholders
  that exit 0 with a message — no test runner configured yet (Phase 16).
- `packages/db-types/` — placeholder `Database` type, regenerated by `npm run db:types`
  once real schema exists.
- Workspaces: `package.json` workspaces = `["apps/*", "packages/*", "packages/modules/*"]`
  (the extra entry is required — `packages/*` alone doesn't reach `packages/modules/<name>`).

Verified working end-to-end: `npm install`, `npm run type-check` (21 packages, all green),
`npm run lint` (green), `npm run db:reset` (applies both migrations clean), RLS gate script
tested against a live DB both passing and correctly failing.

## Phase 2 — Auth & Identity: ✅ DONE, verified live in-browser

What exists (don't recreate):
- `supabase/migrations/0003_identity.sql` — `users`/`auth_methods`/`sessions`/
  `guardianships`/`consents` + RLS (self-only policies) + grants. **No `otp_challenges`**
  (phone OTP deferred). Deferred-constraint trigger enforces ≥1 verified auth method per
  user. `consents.organization_id` has no FK yet (add when `organizations` lands, Phase 3).
- `packages/platform/src/auth/jwt.ts` — real RS256 sign/verify (`JWT_PRIVATE_KEY`/
  `JWT_PUBLIC_KEY`, base64 PEM from `npm run keys:generate`).
- `packages/platform/src/auth/supabase.ts` — real `AuthAdapter` impl using
  **`@supabase/ssr`'s `createServerClient`, not plain `@supabase/supabase-js`** — this
  matters: PKCE needs a code-verifier cookie to survive between the "start" request and
  the later "callback" request, which only `@supabase/ssr` handles. The interface takes a
  `CookieJar` (`{getAll, setAll}`) injected by the caller so `packages/platform` stays
  framework-agnostic (no `next/headers` import there).
- `packages/modules/identity-auth/src/service.ts` — full implementation: resolve-or-create
  identity (service-role, pre-session), session issue/refresh (opaque `sessionId.secret`
  token, reuse-detection revokes the session on replay)/revoke/list, account linking with
  cross-user duplicate prevention, consent capture/withdraw, profile get/update, auth-method
  listing, a `createGuardianshipUnsafe` placeholder for admin/seed use until Phase 6.
  `packages/modules/identity-auth/src/tokens.ts` holds the token format helpers.
- `apps/web/src/lib/v2-session.ts` — cookie plumbing (access/refresh cookie read/write,
  `createRouteCookieJar`/`applyPendingCookies` for the PKCE verifier, Doc 08 §4 response
  envelope `{data}`/`{error:{code,message}}`). Deliberately separate from the old
  `lib/api.ts`, which not-yet-rebuilt V1 routes still use.
- Route handlers (all new, real, tested): `/api/v1/auth/oauth/google/{start,callback}`,
  `/api/v1/auth/magic-link/{start,callback}`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`,
  `/api/v1/me` (GET/PATCH), `/api/v1/me/sessions` (GET) + `/{id}` (DELETE),
  `/api/v1/me/auth-methods` (GET/POST) + `/{id}` (DELETE), `/api/v1/me/consents` (POST).
- `apps/web/src/app/auth/login/page.tsx` — rebuilt: Google button (plain link, no client-side
  Supabase SDK) + magic-link email form. `apps/web/src/app/onboarding/page.tsx` — placeholder
  landing for new users until Phase 3 builds real org onboarding.
- **Deleted** (superseded, referenced the archived V1 schema): `api/v1/auth/{me,register,
  resolve-identifier,session,signup}/route.ts`, `auth/callback/route.ts`, `auth/register/page.tsx`,
  `auth/reset-password/page.tsx`. Note: `apps/web/src/app/admin/coaches/page.tsx` and
  `components/CoachOnboardingWizard.tsx` (untouched V1, Phase 12 territory) still link to
  the now-deleted `/auth/register` — known, acceptable transitional breakage, not fixed here.
- `eslint.config.mjs`: apps/web is no longer globally ignored (gitignore-style negation to
  re-include nested paths doesn't work reliably — verified empirically). Instead specific
  rebuilt paths are added to `V2_WEB_PATHS`/`V2_TREE`; anything not listed there simply
  isn't matched by any `files:` glob and stays unlinted (same effect, no ignore-pattern fights).
  Currently listed: `api/v1/auth/**`, `api/v1/me/**`, `auth/login/**`, `onboarding/**`,
  `lib/v2-session.ts`. Extend this list as more of apps/web is rebuilt.
- `.claude/launch.json` — added (`npm run dev:web` on port 3000; OAuth/magic-link redirect
  URLs are hardcoded to `localhost:3000` via `NEXT_PUBLIC_APP_URL` + Supabase's local
  `additional_redirect_urls`, so the web app must run on port 3000 specifically for local auth
  testing — not an arbitrary/free port).

**Verified live in a real browser** (not just type-checked): full magic-link round trip —
login page → POST start → email via Mailpit → click link → GoTrue `/verify` (PKCE, `pkce_`
token prefix confirms code flow is active, not implicit/fragment) → our callback exchanges
`?code=` → session cookies set → `/onboarding` (new user) → `GET /api/v1/me` returns the
real profile → `GET /api/v1/me/sessions` shows `isCurrent:true` → `POST /api/v1/auth/logout`
→ subsequent `/api/v1/me` returns 401. Also unit-smoke-tested directly against a live DB:
refresh rotation, reuse-detection (replay revokes the session), duplicate-auth-method-link
rejection, and the deferred last-verified-method trigger.

**Known gaps / not verified**:
- Google OAuth's `/api/v1/auth/oauth/google/start` → `/callback` code path is implemented and
  type-checked but **not verified end-to-end** — local Supabase has no real Google OAuth
  client configured (same limitation the old V1 login page used to warn about). Verify once
  a Google OAuth app + Supabase provider config exist (staging at the latest).
- No automated tests were added (Phase 16) — everything above was verified by hand via
  browser + live-DB smoke scripts, not committed as a test suite.
- Zod/kernel-schema request validation wasn't added to the new routes (ad hoc `typeof`
  checks only) — fine for now, worth tightening whenever `packages/kernel/schemas` gets its
  first real content.

## Phase 3 — Multi-Tenancy & Organization Core: ✅ DONE, verified live in-browser

What exists (don't recreate):
- `supabase/migrations/0004_tenancy.sql` — `organizations`/`branches`/`memberships`/
  `invitations`/`join_requests`/`org_branding`/`org_domains` + RLS + grants + indexes.
  `current_org()`/`my_branch_scope()`/`is_org_wide_member()` helper functions (Doc 07 §17).
  Adds the `consents.organization_id` FK deferred from migration 0003.
  **RBAC (`roles`/`permissions`/`membership_roles`/`has_perm()`) does not exist yet** — an
  interim gate, `is_org_wide_member()` (caller's own membership has `branch_id is null`,
  `status='active'`), stands in for "admin-ish" until Phase 4 replaces it. Read the
  migration's header comment before touching any policy here.
  `organizations.created_by` is a **schema addition not in Doc 07's literal table** — needed
  to make org bootstrap (creator becomes first member) work as a self-service RLS insert
  chain (org → org-wide membership → Main branch, one transaction, no service-role needed)
  instead of a service-role bypass.
- `supabase/migrations/0005_auth_methods_verified_identifier.sql` — adds
  `auth_methods.verified_identifier` (bugfix, see "Known gaps fixed" below).
- `packages/modules/tenancy-rbac/src/service.ts` — full implementation: `createOrganization`
  (self-service RLS transaction), `listMyMemberships` (workspace switcher data),
  `getOrganization`, `resolveOrgBySlug` (service-role, join-by-slug flow, no membership
  needed), branches (`listBranches`/`createBranch`), invitations
  (`createInvitation`/`listInvitations`/`revokeInvitation`/`acceptInvitation` — the last is
  service-role since it writes the invitee's own membership row across actors, matches
  emails via `auth_methods.verified_identifier`), join requests
  (`createJoinRequest`/`listJoinRequests`/`decideJoinRequest` — status update is
  self-service RLS, the resulting membership grant on approval is service-role),
  `isActiveMember` (used by the workspace switcher before reissuing the access token),
  `getBranding`/`updateBranding`. `NotAuthorizedError` covers the case a bare `UPDATE`'s RLS
  `USING` clause silently filters a row to zero-rows-affected instead of raising — callers
  must check `rowCount`, Postgres doesn't error on that path the way it does for a
  WITH CHECK/INSERT failure (only `revokeInvitation` needed this; `decideJoinRequest`
  already re-checks via its own SELECT).
- `packages/modules/identity-auth/src/service.ts` — added `switchActiveOrg` (reissues the
  access token with a new `org` JWT claim, persists `sessions.active_org_id`; does NOT
  rotate the refresh token, unlike `refreshSession`). `resolveOrCreateIdentity` now also
  populates `auth_methods.verified_identifier`.
- Routes: `POST/GET /api/v1/orgs` (create/list-mine), `GET /api/v1/orgs/resolve?slug=`,
  `GET /api/v1/orgs/{id}`, `GET/POST /api/v1/orgs/{id}/branches`,
  `GET/POST /api/v1/orgs/{id}/invitations` + `DELETE .../{invId}` (revoke),
  `POST /api/v1/invitations/accept`, `GET/POST /api/v1/orgs/{id}/join-requests` +
  `POST .../{reqId}/decide`, `GET/PUT /api/v1/orgs/{id}/branding`,
  `GET/POST /api/v1/me/workspace` (read active org / switch workspace).
  `apps/web/src/lib/v2-session.ts` gained `setAccessTokenCookie` (access-token-only cookie
  write, for workspace switch) and `isRlsDenied` (detects Postgres 42501 so a genuine RLS
  denial maps to 403, never swallowed into a blanket catch that would also hide real 500s).
- `apps/web/src/app/onboarding/page.tsx` — rebuilt: the 4 provisioning flows (Doc 02 §9) —
  "I'm a coach" / "I run an academy" (org creation, type picker), "I have an invite" (token
  → accept), "I'm a parent/student" (slug search → join request). Ends by activating the new
  workspace and routing to `/workspace`.
- `apps/web/src/app/workspace/page.tsx` — new: workspace switcher, lists memberships, click
  to switch active org, link to add another workspace.
- `eslint.config.mjs`: `V2_WEB_PATHS` extended with `api/v1/orgs/**`,
  `api/v1/invitations/**`, `app/workspace/**`.
- `packages/platform/src/db/service-role-manifest.ts`: added tenancy-rbac's entry
  (`resolveOrgBySlug`, `acceptInvitation`, the approval half of `decideJoinRequest`).

**Known gaps fixed during this phase (pre-existing, not newly introduced, but blocking
Phase 3 work so fixed here):**
1. **RLS was silently inert.** `DATABASE_URL` connects as `postgres`, which has
   `rolbypassrls=true` — every policy since migration 0003 (Phase 2) was being skipped
   entirely, on both `withRequestContext` and `getServiceClient`. Fixed by adding
   `set local role authenticated` in `withRequestContext` (`packages/platform/src/db/index.ts`)
   — `postgres` is already a member of `authenticated` locally (verified), so this is exactly
   the pattern Supabase's own PostgREST layer uses. **This retroactively makes Phase 2's
   self-only policies (sessions, auth_methods, etc.) actually enforce for the first time** —
   worth knowing if something that "worked" in Phase 2 testing behaves differently now (it
   was returning unfiltered rows before; RLS was never actually gating it, the app-layer
   queries just happened not to leak anything in the single-user test paths used).
2. **`apps/web/src/proxy.ts`** (legacy V1 edge middleware, still runs on every request)
   redirected `/auth/*` → `/admin/dashboard` whenever a Supabase session existed. V2's own
   magic-link/OAuth flows create a transient Supabase session as a side effect of the PKCE
   exchange, which made `/auth/login` permanently unreachable after any V2 login (blocking,
   e.g., a second person signing in on the same browser). Removed that redirect; `/admin/*`'s
   guard (unauthenticated → `/auth/login`) is untouched.
3. **Returning-user login landed on `/`**, a V1 page that redirects based on Supabase's
   session, not V2 state. Both auth callbacks (`magic-link/callback`, `oauth/google/callback`)
   now send a returning user to `/workspace` instead (new users still go to `/onboarding`).
4. **`auth_methods.provider_uid` for `email_otp` is Supabase's `auth.users.id` (a UUID), not
   the email** — invitation-acceptance email matching (Doc 07 §3) can't use it. Added
   `auth_methods.verified_identifier` (migration 0005) instead of reaching into `auth.users`
   directly, per this project's own stated principle that `auth_methods` is "ours, not
   Supabase's" (Doc 02 §11 portability).

**Verified live in a real browser**, three separate identities, one session each: Alice
creates an `independent_coach` org via the UI → lands on `/workspace` with it active and
checked. Alice creates a second, `academy`-type org via the UI. Alice invites `bob@test.com`
via a direct API call (no admin UI yet, see below); Bob logs in fresh, pastes the token into
the onboarding "I have an invite" form, and is correctly rejected once (email-mismatch
against a *different* test) and correctly accepted with a matching email — lands on
`/workspace` with the org listed. Carol uses "I'm a parent/student" → resolves
`alice-coaching` by slug → sends a join request → Alice approves it via API → Carol logs in
again, sees the org, clicks it, and `GET /api/v1/me/workspace` confirms the switch took
effect. Also unit-smoke-tested directly against a live DB (25 assertions covering every
service function including negative paths: duplicate slug, non-member writes, email
mismatch, token reuse, revoked invitation, double-decide) and a dedicated 10-assertion raw-SQL
RLS test (bootstrap ordering, cross-org isolation, column-grant locks on `memberships`/
`organizations`).

**Known gaps / not built (deliberately, in scope for later phases):**
- No admin UI for creating/listing/revoking invitations or approving join requests — verified
  via direct API calls above. Needs a real admin dashboard, which doesn't exist until later
  phases (Platform Admin / People). The service + routes are there; only the UI is missing.
- Guardian-requests-for-a-ward (Doc 02 §9's parent-requesting-for-a-child case) is NOT
  implemented — `join_requests.subject_user_id` is locked to the requester themselves (RLS
  `with check`), because allowing an arbitrary subject would let a requester name a victim
  who never consented, and there's no `is_my_ward()`-backed RLS yet. Lands with guardianship-
  aware policies (People module, Phase 6).
- `invitations.role_keys` and `join_requests.requested_role` are recorded but **not applied**
  to any actual role grant — there is no `membership_roles` table until Phase 4. Every org
  bootstrap/invite-accept/join-approve in this phase produces a membership with no role
  attached (`rbac.can()` still throws by design, so this doesn't create a functional gap yet).
- `org_domains` is schema + a read-only SELECT policy only (Doc 02 §10 Tier 2 — v1 schema,
  V2 build). No write path, no custom-domain routing.
- No automated tests (Phase 16) — verified via the live-DB smoke scripts above plus the
  in-browser pass, not committed as a test suite (matches Phase 2's precedent).

## Phase 4 — RBAC & Schema Completion: ✅ DONE, verified via smoke test

What exists (don't recreate):
- `supabase/migrations/0006_rbac.sql` — `roles`/`permissions`/`role_permissions`/
  `membership_roles`/`platform_role_assignments`/`coach_assignments`/`support_access_grants`
  (Doc 04 §12) + `has_perm()`/`has_perm_branch()`/`my_batch_ids()`/`support_grant_active()`
  (Doc 07 §17) + last-Owner-protection triggers (on `membership_roles` delete and
  `memberships.status` update) + seed-super-admin protection triggers (on
  `platform_role_assignments` delete and `users.deleted_at` update) (Doc 07 §5) + the full
  permission catalogue/system roles/role_permissions seed translating Doc 04 §5's access
  matrix (idempotent inserts, versioned by migration — not `seed.sql`, which is
  local-fixture-only). Two permission keys were added beyond Doc 04 §4's literal catalogue
  because the matrix needs finer granularity than it lists: `people.join_request.read`
  (Front Desk "join intake" without approval authority) and `finance.proof.submit` (proof
  intake without approval authority). The matrix→role_permissions translation required
  interpretive judgment in places the doc doesn't spell out to permission-key granularity —
  see migration 0006's header comment before assuming a role's exact bundle from memory;
  re-derive from the migration's `role_permissions` INSERT instead.
  **`has_perm()`/`has_perm_branch()`/`my_batch_ids()`/`support_grant_active()`/
  `my_branch_scope()` are all `SECURITY DEFINER`** — not optional. They're called from RLS
  policies on the very tables they query (e.g. `memberships_select_staff` calls
  `has_perm_branch()`, which queries `memberships`); without `SECURITY DEFINER` that's
  infinite recursion ("stack depth limit exceeded"), hit and fixed empirically while
  smoke-testing this migration. `SECURITY DEFINER` only changes which role's RLS applies to
  the function's *internal* lookups — the actual filtering is still `current_user_id()`/
  `current_org()` (session GUCs), so this doesn't widen what a caller can learn.
- Migration 0004's `is_org_wide_member()`-gated policies are DROPped and replaced with
  `has_perm()`/`has_perm_branch()` versions **inside migration 0006**, not by editing 0004 in
  place — `roles`/`membership_roles` have FKs into 0004's tables, so RBAC schema must apply
  *after* tenancy schema, meaning 0004's own policies can never call `has_perm()` directly
  (it doesn't exist yet at that point in the migration sequence). 0004 itself only picked up
  comment updates (see its header) pointing at 0006 for current policy state — a real
  structural reason, not a style choice; don't try to consolidate these into one migration
  later without re-deriving why they're split this way. Also added:
  `memberships_select_staff`/`memberships_update_staff` (`people.member.read`/`.suspend`,
  branch-refined) — org-staff visibility/suspend that Phase 3 explicitly deferred.
- `packages/kernel/src/rbac.ts` — the `can()` stub is gone. Kernel has zero DB access by
  architecture (`packages/platform` depends on `packages/kernel`, never the reverse, so
  kernel importing platform back would be circular) — it was never actually possible for
  `can()` to live here and do real DB resolution, regardless of phase. Real advisory checks
  are `@abhyas/module-tenancy-rbac`'s `hasPerm()`/`hasPermBranch()`, which call the *same*
  `has_perm()`/`has_perm_branch()` SQL functions RLS uses — app-layer and RLS can't disagree.
  Kernel keeps only the shared `PermissionTarget` type.
- `packages/modules/tenancy-rbac/src/service.ts` — added `hasPerm`/`hasPermBranch`;
  `createOrganization` now grants Owner (+ Coach for `independent_coach`) via migration
  0006's bootstrap RLS policy (`membership_roles_insert_bootstrap_owner`, the only path that
  can grant a role before any role exists on a membership) and explicitly repoints
  `current_org()` mid-transaction (`select set_config('app.org_id', ...)`) so the Main-branch
  insert's `has_perm('org.branch.create')` check sees the *new* org, not whatever was active
  before it existed; `acceptInvitation` now applies `invitation.role_keys` and
  `decideJoinRequest` now applies `join_request.requested_role` to `membership_roles` (both
  service-role, same cross-actor-write blocks as the membership insert itself); added
  `listMembers`/`grantRole`/`revokeRole` with a `ORG_ROLE_GRANTORS` map enforcing Doc 04 §8's
  grant-authority table (e.g. only an existing Owner can grant Org Admin/Accountant/Owner;
  Branch Admin can grant Coach/Asst Coach/Front Desk but not Branch Admin) as an app-layer
  check on top of the `people.role.grant`/`.revoke` RLS gate — RLS alone only sees "does this
  permission bit exist", not "is target role X within granter's authority".
- Routes: `GET /api/v1/orgs/{id}/members`,
  `POST /api/v1/orgs/{id}/members/{membershipId}/roles`,
  `DELETE /api/v1/orgs/{id}/members/{membershipId}/roles/{roleKey}`. **No admin UI** for
  these — same precedent as Phase 3's invitations/join-requests (service + routes exist, the
  page doesn't; deferred to Platform Admin/People, Phases 5-6).
- `packages/platform/src/db/service-role-manifest.ts` — justification text for
  tenancy-rbac's existing service-role entry extended to cover the new role-grant writes
  inside `acceptInvitation`/`decideJoinRequest` (same call sites, no new entry needed).

**Verified via a live-DB smoke script** (`npx tsx`, run against local `supabase start`,
not committed — matches Phase 2/3's precedent of hand-run smoke scripts, not a test suite):
independent-coach org bootstrap grants Owner+Coach; `hasPerm()` (app-layer) agrees with what
RLS actually allows/denies (Owner can update org settings/billing/branding, Coach cannot,
verified both via the service function *and* a raw UPDATE that RLS silently zero-rows);
`acceptInvitation`/`decideJoinRequest` correctly apply their role grants; `listMembers`
visibility works under `memberships_select_staff`; `grantRole` succeeds for an authorized
granter and correctly throws `RoleGrantNotAllowedError` for an unauthorized one (Coach
granted Branch Admin); the last-Owner trigger blocks an Owner from revoking their own only
Owner role. `npm run type-check` (21 packages), `npm run lint`, `npm run db:reset` (all 6
migrations apply clean, in order), and `npm run db:check-rls` (20 tables, 1 allow-listed)
all pass.

**Known gaps / not built (deliberately, in scope for later phases):**
- No admin UI for members/roles (see above) — Platform Admin/People, Phases 5-6.
- `is_my_ward()` / the P4 guardian RLS policy shape is not built — needs `enrollments`
  (People, Phase 6) to know if a ward is actually enrolled in the target org.
- No platform-scope equivalent of `has_perm()` for `platform_role_assignments` — no
  platform-scoped table exists yet to gate (Platform Admin, Phase 5). The platform-role
  catalogue/role_permissions ARE seeded now (same seed step as the org matrix), just unread
  by any policy yet.
- No seed super admin actually created — the *protection* trigger exists
  (`platform_role_assignments_protect_seed`/`users_protect_seed_super_admin`), but creating
  the first real seed row is Platform Admin tooling (Phase 5).
- `coach_assignments.batch_id` has no FK yet (`batches` doesn't exist until Scheduling,
  Phase 7) and the table has no write path for `authenticated` yet (schema-only, same
  pattern as `org_domains`).
- Doc 04 §8's full anti-lockout rule set (rank ceiling beyond the grant-authority table,
  custom-role support) is not fully modeled — `ORG_ROLE_GRANTORS` in tenancy-rbac covers the
  documented grant table faithfully but isn't a general rank/hierarchy system.
- No automated tests (Phase 16) — verified via the live-DB smoke script above, matching
  Phase 2/3's precedent.

## Next: Phase 5 — Platform Admin

Scope (from the roadmap): Super Admin/Verification Ops/Support/Platform Finance console —
org verification review + approve/reject (the gate in US-1 AC5, `organizations.status`
`pending`→`active`), the actual seed-super-admin creation flow, platform role
grant/revoke UI (`platform_role_assignments`, now schema-complete from Phase 4), the
support-access-grant request/approve/audit workflow (Doc 04 §9, `support_access_grants`
already exists — Phase 4 only built its schema+read policy, not the write/request flow),
subscriptions/feature-flags/announcements (Doc 07 §15's `feature_flags`/
`org_feature_flags`/`announcements` tables — not yet created, check Doc 07 before assuming
they exist). **There is no dedicated Platform Admin doc in `docsV2/`** (only 00, 01, 02, 04,
05, 07, 08, 13, 14, 15, 17 exist — 03/06/09-12/16 were never written for this rebuild).
Platform Admin's actual spec is scattered: Doc 04 §9 (support access/impersonation) + §3's
platform role catalogue, Doc 07 §15-16 (the tables above + audit_log), and
`docsV2/Wireframes - Login & Superadmin.dc.html` (t1/t4 wireframes, referenced by Doc 04's
2026-07-19 addendum). Read those three, don't search for a doc number that isn't there.

## How to resume without re-reading everything

- Don't re-read all of `docsV2/` — this file plus Doc 04 §9/§3, Doc 07 §15-16, and the
  Login & Superadmin wireframe should be enough for Phase 5.
- Don't re-derive the gap analysis or ask the scope-change questions again — they're
  answered above.
- Do check `git status`/`git diff` against this file's "what exists" list before assuming
  something isn't built — this file is a snapshot, code is ground truth if they disagree.
- RBAC is schema-complete as of Phase 4 — `has_perm()`/`has_perm_branch()` are real and
  `SECURITY DEFINER`. Don't reintroduce an `is_org_wide_member()`-style coarse gate for
  anything Platform Admin builds; use real permission keys (extend the catalogue in a new
  migration if one's missing, following migration 0006's pattern).
