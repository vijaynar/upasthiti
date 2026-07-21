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

## Phase 5 — Platform Administration: ✅ DONE, verified live in-browser

Scope was narrower than the full wireframe (4a-4l): the console built here covers org
verification/lifecycle, platform roles, support access, feature flags, announcements, and
audit trail — the pieces IMPLEMENTATION_STATUS.md's Phase 5 section called out as decided
scope. Taxonomy, messaging-vendor config, payments reconciliation, plans/pricing UI, DSR
queue, and localization (wireframe 4g-4l) are deliberately NOT built — each depends on a
module that doesn't exist yet (Messaging, Finance, Marketplace, a DPDP compliance pass).

What exists (don't recreate):
- `supabase/migrations/0007_platform_admin.sql` — `has_platform_perm(perm)` (platform-scope
  equivalent of `has_perm()`, `SECURITY DEFINER`, keyed on `platform_role_assignments` ->
  `role_permissions`, no `current_org()` involvement). New tables: `feature_flags`,
  `org_feature_flags`, `announcements`, `plans`, `subscriptions`, `audit_log` (Doc 07 §15/§16
  core columns only — §21.5's console extras like `dlt_templates`/`dsr_requests`/
  `plans.limits` are deferred, same "schema follows the module that needs it" precedent as
  `org_domains`). `organizations.status` gained a 5th value, `'rejected'` — Doc 07's literal
  enum doesn't have one; this is a documented interpretive call (migration header) to give
  the verification queue's Reject action a real terminal state distinct from `archived`.
  `write_audit_log()` is the ONLY insert path into `audit_log` (`SECURITY DEFINER`, actor is
  always `current_user_id()`) — `authenticated` has no direct INSERT grant on the table.
  `support_grant_active()` (defined but unused since migration 0006) is now wired into
  `organizations`/`memberships` SELECT as additive permissive policies — scoped to just those
  two tables (enough for the org-360 view under a support grant); People's real roster tables
  (Phase 6) will need their own policies when they exist, not retrofitted here.
- `packages/modules/audit/src/service.ts` — `writeAuditLog()`/`listAuditLog()`, thin wrappers
  over `write_audit_log()` and a plain RLS-gated SELECT. Only Phase 5's own write paths call
  `writeAuditLog()` so far — retrofitting Phase 2-4 call sites (role grants, invitation
  accept, join-request decide) with audit logging is real debt per Doc 07 §16 ("every
  privileged action logs"), not done here, not blocking.
- `packages/modules/platform-admin/src/service.ts` — org verification/lifecycle
  (`listOrganizations`, `getOrganizationDetail`, `decideOrganizationVerification`,
  `setOrganizationSuspension`), platform role grant/revoke (`grantPlatformRole`/
  `revokePlatformRole` — gated by `platform.role.grant`, which only `super_admin` holds in
  the seeded catalogue, so no separate grant-authority table like tenancy-rbac's
  `ORG_ROLE_GRANTORS` was needed), support access (`requestSupportAccess`/
  `listSupportAccessGrants`/`revokeSupportAccessGrant` — schema has no separate
  request/approve state, so a row's existence IS the grant, capped at 24h app-side), feature
  flags (`listFeatureFlags`/`upsertFeatureFlag`/`listOrgFeatureFlags`/`setOrgFeatureFlag`),
  announcements (`listAnnouncements`/`createAnnouncement`). Two access patterns: feature
  flags/org-flags/announcements have real RLS write policies (`has_platform_perm()`) and use
  `withRequestContext` throughout; org verification/suspend, platform role grant/revoke, and
  support-access request/revoke have no self-insert RLS path (cross-actor, same shape as
  tenancy-rbac's `acceptInvitation`) and call `assertPlatformPerm()` (a real
  `withRequestContext` query against `has_platform_perm()`) BEFORE `getServiceClient()` —
  that call is the only authorization gate for those paths, not RLS. Plans/subscriptions are
  schema-only in Phase 5 (RLS + tables exist, no service functions/UI) — real billing lands
  with Finance (Phase 9).
- `scripts/bootstrap-superadmin.mjs` — rewritten for V2 (the old file was a V1 Supabase-
  Admin-API script, referenced `role`/`available_roles`/`tenant_id` columns that don't exist
  in V2). Grants the seed Super Admin role to an ALREADY-EXISTING V2 identity by email
  (`auth_methods.verified_identifier`) — deliberately not a user-creation script, since V2 has
  no admin-create-user path; sign in once via the normal magic-link/Google flow first. Refuses
  to run if a seed super admin already exists. `npm run admin:bootstrap-superadmin -- <email>`.
- Routes: `GET /api/v1/platform/organizations` (+ `?status=`/`?search=`),
  `GET /api/v1/platform/organizations/{id}`, `POST .../{id}/verify` ({decision, note}),
  `POST .../{id}/suspend` ({action, reason}), `GET/POST .../{id}/feature-flags`,
  `GET/POST /api/v1/platform/roles`, `DELETE /api/v1/platform/roles/{userId}/{roleKey}`,
  `GET/POST /api/v1/platform/support-access`, `DELETE .../{id}`,
  `GET/POST /api/v1/platform/feature-flags`, `GET/POST /api/v1/platform/announcements`,
  `GET /api/v1/platform/audit-log`.
- `apps/web/src/app/platform/page.tsx` — single-page console with a tab sidebar
  (Verification queue / Organizations / Platform roles / Support access / Feature flags /
  Announcements / Audit trail), matching the workspace/onboarding pages' plain-fetch client
  component style. Shows an access-denied state (not a redirect) for any signed-in user
  without a platform role, detected by probing `GET /api/v1/platform/organizations`.
- `eslint.config.mjs`: `V2_WEB_PATHS` extended with `api/v1/platform/**`, `app/platform/**`.
- `packages/platform/src/db/service-role-manifest.ts`: new entry for
  `platform-admin/src/service.ts` explaining its service-role usage is gated by
  `assertPlatformPerm()`, not RLS.

**Verified live in a real browser**: bootstrapped a seed super admin via the new script,
signed in, hit `/platform` (200, console renders). Created a second identity, ran "I run an
academy" onboarding (org lands `pending`) — verification queue showed it, Approve
transitioned it to `active` (`verified_at`/`verified_by` set). Organizations tab
suspend/reinstate round-tripped the status correctly. Granted `verification_ops` to the
second user via Platform roles, then revoked it (seed `super_admin` row correctly has no
revoke button). Created a feature flag and toggled it on. Published an announcement.
Requested a support-access grant against the test org (24h cap enforced) and revoked it. The
Audit trail tab showed all ten actions above, in order, correctly attributed. Also hit a real
cross-tab bug during testing worth remembering: this Browser pane's tabs share ONE cookie
jar per origin — signing in as a second identity on another tab silently overwrites the first
tab's session cookie (got a genuine 403 `has_platform_perm` check, not a bug in the check
itself — confirmed by testing `has_platform_perm()` directly against Postgres). Don't
misdiagnose that pattern as an RBAC bug in a future session; it's a two-tabs-one-cookie-jar
test artifact, not a code issue.

`npm run type-check` (21 packages incl. the two new modules), `npm run lint` (one violation
fixed — a dynamic-WHERE query for `listOrganizations` needed its SQL text built in a
variable rather than inline in the `.query()` call to satisfy the no-raw-interpolation rule;
same safety, the values still flow through `params`), `npm run db:reset` (7 migrations apply
clean), and `npm run db:check-rls` (26 tables, 1 allow-listed) all pass.

**Known gaps / not built (deliberately, in scope for later phases):**
- Plans/subscriptions have schema + RLS but no service functions or UI — real billing
  checkout lands with Finance (Phase 9).
- Taxonomy, messaging-vendor config (WhatsApp BSP/DLT templates), payments reconciliation,
  and localization (wireframe 4g/4h/4i/4l) are not built — each needs a module (Notifications,
  Finance/Payments) that doesn't exist yet.
- Audit logging is NOT retrofitted onto Phase 2-4 write paths (role grants, invitation
  accept/decide, org branding updates) — only Phase 5's own new writes call
  `writeAuditLog()`. Doc 07 §16 says every privileged action should log; this is real,
  acknowledged debt.
- `support_grant_active()` is only wired into `organizations`/`memberships` SELECT — People's
  real roster/enrollment tables (Phase 6) need their own support-grant read policies when
  they're created.
- No admin UI for `plans`/`subscriptions`, org branch list, or org branding from the platform
  side (the org-360 view shows counts only, not a drill-down) — not required by Phase 5's
  scoped-down deliverable.
- No automated tests (Phase 16) — verified via the live-DB smoke queries above plus the
  in-browser pass, matching every prior phase's precedent.

## Phase 6 — People: ✅ DONE, verified live in-browser

Scope actually built: enrollments (org-scoped student records), guardianship-aware RLS
(`is_guardian_of`/`has_consent_authority`/`is_my_ward` — `is_my_ward()` was deferred from
Phase 4 because it needed `enrollments` to know if a ward is actually enrolled, which this
phase adds), the guardian-adds-child flow, the guardian-requests-for-a-ward join-request path
Phase 3 explicitly deferred, and closing a real RLS gap in `consents` (see below). **There is
no dedicated People doc in `docsV2/`** — spec was scattered across Doc 02 §6-9, Doc 07 §6, Doc
04 §7; all three read and cross-referenced for this phase.

What exists (don't recreate):
- `supabase/migrations/0008_people.sql` — `enrollments` table (Doc 07 §6, literal, plus an
  `updated_at` column the doc's snippet omits — convention #9). **`batch_enrollments` is NOT
  built** — it FKs into `batches`, which doesn't exist until Scheduling (Phase 7); same
  "schema follows the module that needs it" precedent as `org_domains`/
  `coach_assignments.batch_id`. Three new `SECURITY DEFINER` functions: `is_guardian_of(ward)`
  (bare active guardianship link), `has_consent_authority(ward)` (link +
  `consent_authority=true`), `is_my_ward(ward, org)` (link + active enrollment in that org +
  the org's `guardian_visibility` setting, default on) — see the migration header for why
  they're split three ways instead of one function. Also **tightens two pre-existing RLS
  gaps**, not just adds policies: `consents` insert/update (migration 0003) only ever checked
  `granted_by = current_user_id()` — any authenticated user could grant a consent row for an
  arbitrary `subject_user_id`; now requires self-subject or `has_consent_authority(subject)`.
  `join_requests_insert_self` (migration 0004) is replaced with
  `join_requests_insert_self_or_ward`, unlocking the guardian-on-behalf-of-a-ward path that
  migration 0004's own comment pointed at this phase to build. New `users_select_ward` policy
  gives a guardian read access to a ward's own `users` row (Doc 04 §7 "Read ward's profile") —
  migration 0003's `users` policies were self-only before this.
- `packages/modules/people/src/service.ts` — `enrollStudent` (RLS-gated insert,
  `people.student.update` branch-scoped, upserts on conflict to reactivate a
  cancelled/paused enrollment), `updateEnrollment`, `getEnrollment`, `listEnrollments` (staff),
  `listMyEnrollments` (self), `listWardEnrollments` (guardian, via `is_my_ward`). Query text is
  built into `const ... _SQL` variables before `.query()` calls — the no-raw-interpolation
  eslint rule (Doc 13 §9 A03) flags a template literal with `${}` passed *directly* as a
  `.query()` argument even when the interpolated value is a static column-list constant, not
  user input; same fix shape as Phase 5's `listOrganizations`.
- `packages/modules/identity-auth/src/service.ts` — the Phase-1-era `createGuardianshipUnsafe`
  placeholder is gone, replaced by the real flow: `addWard` (service-role, creates a
  profile-only `users` row + `guardianships` link in one transaction; app-layer gate is
  `guardianUserId === session.userId` — self-request only, never name an arbitrary adult as a
  ward's guardian) and `listWards`. A ward's `users` row has zero `auth_methods` by design
  (Doc 05 §9 minors stay profile-only until phone OTP) — confirmed this does NOT trip the
  deferred `assert_user_has_verified_method` trigger, since that trigger only fires on
  `auth_methods` writes, never on a bare `users` insert.
- `packages/modules/tenancy-rbac/src/service.ts` — `createJoinRequest` gained an optional
  `subjectUserId` (guardian-on-behalf; RLS is the real gate, this just forwards the caller's
  choice). `decideJoinRequest` now returns a `JoinRequestDecisionResult`
  (`approved`/`organizationId`/`branchId`/`subjectUserId`/`requestedRole`) instead of `void`,
  so the route layer can react to a student approval without tenancy-rbac importing people
  (Doc 14 §2 rule 2 — modules call each other's public service, never reach into internals;
  this keeps tenancy-rbac People-agnostic by pushing the cross-module reaction to the route).
- `apps/web/src/app/api/v1/orgs/[id]/join-requests/[reqId]/decide/route.ts` — updated: on a
  `student` role approval, resolves the enrollment's branch (the join request's own `branchId`
  if set, else the org's Main branch via `listBranches`) and calls
  `people.enrollStudent` — the actual place Doc 02 §9's "join request → org approves" flow
  produces a real enrollment, not just a bare membership. New routes:
  `GET/POST /api/v1/orgs/{id}/enrollments`, `GET/PATCH /api/v1/orgs/{id}/enrollments/{id}`,
  `GET /api/v1/me/enrollments` (self), `GET/POST /api/v1/me/wards` (guardian). The existing
  `POST /api/v1/orgs/{id}/join-requests` route gained an optional `subjectUserId` passthrough.
- `apps/web/src/app/people/page.tsx` — staff console for the active workspace: enroll an
  existing identity by user ID + branch + roll number, list enrollments, change status via a
  dropdown. No member/role admin UI here either — same "service + routes exist, the page
  doesn't" precedent as Phase 3/4's members/invitations, unrelated to this phase's scope.
- `apps/web/src/app/family/page.tsx` — new, standalone from `/onboarding` (guardianship is an
  ongoing relationship a parent revisits, not a one-time provisioning choice): add-a-child
  form, wards list, and a per-ward "request enrollment" mini-flow (search org by slug → send a
  join request with `subjectUserId` = the ward).
- `packages/platform/src/db/pool.ts` — **real bug found and fixed while verifying this phase
  in-browser**: node-postgres's default `date` (OID 1082) type parser returns a JS `Date`
  object, which later JSON-serializes with a timezone shift (IST midnight on a `dob`/
  `started_on` column round-tripped as the previous day's evening UTC — caught live on
  `/family`'s ward DOB display). Fixed platform-wide with
  `pgTypes.setTypeParser(pgTypes.builtins.DATE, v => v)` in the one place the `Pool` is
  constructed, rather than `::text`-casting every `date` column in every module. This was a
  **pre-existing gap since Phase 2** (`identity-auth.getProfile`'s `dob` column had the exact
  same latent bug) — not newly introduced by this phase, just newly surfaced by being the
  first phase to actually render a `date` column value in the UI.
- `eslint.config.mjs`: `V2_WEB_PATHS` extended with `app/people/**`, `app/family/**`.

**Verified live in a real browser**: signed in as a new identity via magic link, created an
academy org (onboarding), went to `/family`, added a child ("Browser Test Kid", DOB
2016-03-10 — confirmed rendering correctly after the date-parser fix, was off by one day
before it), searched the own org by slug and sent a join request naming the child as subject,
approved it via a direct API call (`POST .../join-requests/{id}/decide`, matching Phase 3/4's
no-dedicated-approval-UI precedent), then confirmed on `/people` that the ward was
auto-enrolled (Main branch, `status: active`) with the exact same `studentUserId` as the
ward's `wardUserId` from `/family` — the join-request-approval → auto-enroll wiring works
end-to-end through the real Next.js route, not just in a smoke script. Also exercised the
status-change dropdown (`active` → `paused`) and confirmed the PATCH persisted via a direct
`GET` re-fetch.

Also verified via a live-DB smoke script (`npx tsx`, run against local `supabase start`, not
committed — matches every prior phase's precedent): guardian-adds-child, `listWards` (proves
`users_select_ward`), guardian-on-behalf join request + Owner approval + auto-enroll,
guardian read of the ward's enrollment (`is_my_ward`), an unrelated user reading zero rows for
the same ward (RLS silently filters, not an error), the ward's own constructed session reading
its own enrollment (`enrollments_select_self` — proves the RLS shape even though a
profile-only ward can't actually log in), guardian consent capture succeeding and an unrelated
user's consent-capture attempt failing with a genuine 42501, direct staff enrollment +
`updateEnrollment`, and a non-staff enrollment attempt failing with 42501. 16/16 assertions
passed. `npm run type-check` (21 packages), `npm run lint`, `npm run db:reset` (8 migrations
apply clean), and `npm run db:check-rls` (27 tables, 1 allow-listed) all pass.

**Known gaps / not built (deliberately, in scope for later phases):**
- `batch_enrollments` — Scheduling, Phase 7 (needs `batches` to exist first).
- Audit logging is still not retrofitted onto Phase 2-4 write paths, and this phase's own new
  writes (`enrollStudent`, `addWard`, consent capture) don't call `writeAuditLog()` either —
  same acknowledged debt Phase 5 flagged, now one phase larger.
- No search-by-name for staff enrolling a student directly — `/people`'s enroll form takes a
  raw user ID, same interim shape as Phase 3's email-based invitations before any admin UI
  existed. A real "find an existing member" picker is a UI-polish item, not blocking.
- Doc 04 §7's "Enable/disable ward login (≥13)" consent-gated action is not built — same
  phone-OTP dependency already documented as deferred (Doc 05 §9), not a new gap.

## Phase 7 — Scheduling: ✅ DONE, verified live in-browser

Scope built: programs, batches, class_sessions, holidays (Doc 07 §7), plus the two joins
deferred into this phase for lack of a `batches` table — `coach_assignments.batch_id`'s FK
(deferred from Phase 4) and `batch_enrollments` (Doc 07 §6, deferred from Phase 6) — and the
Doc 07 §7 "rolling 30-day window" class-session materialization job.

What exists (don't recreate):
- `supabase/migrations/0009_scheduling.sql` — `programs`/`batches`/`batch_enrollments`/
  `class_sessions`/`holidays` (Doc 07 §7, literal) + the `coach_assignments.batch_id` FK +
  real write-path RLS (was schema-only since migration 0006). `programs.sport_key` stays a
  plain `text` column, not Doc 07's literal FK to `taxonomy_sports` — that table doesn't exist
  (Marketplace/taxonomy deferred), same "schema follows the module that needs it" precedent as
  `org_domains`/`coach_assignments.batch_id` itself. Program insert/update reuses
  `schedule.batch.create`/`.update` — Doc 04 §4's catalogue has no dedicated
  `schedule.program.*` key and nothing in the matrix calls out programs as a separate row; an
  interpretive call, documented in the migration header.
  **Two real bugs found and fixed while building/smoke-testing this migration, not
  pre-existing:**
  1. **RLS policy cycle** — `batches`' student/guardian select policies originally queried
     `batch_enrollments` directly, and `batch_enrollments`' staff policies queried `batches`
     directly back → "infinite recursion detected in policy for relation batches" on ANY
     `batches` insert/select (RETURNING requires the SELECT policy too). Fixed the same way
     migration 0006's `has_perm()`/`has_perm_branch()` avoid recursion, but for a cross-table
     cycle rather than a self-referencing function: `is_batch_participant(batch_id)`, a
     `SECURITY DEFINER` function whose internal query runs as the owning role (bypasses RLS
     entirely, not just re-scopes it) — `batches_select_participant` uses it instead of an
     inline `EXISTS` subquery. `class_sessions`' and `coach_assignments`' inline subqueries into
     `batch_enrollments`/`batches` are fine as-is (one-directional, no cycle back) now that
     `batches`' own policies no longer touch `batch_enrollments`.
  2. **`schedule.batch.archive` vs `schedule.batch.update`** — migration 0006 seeds Coach with
     `.update` but deliberately NOT `.archive` (Owner/Org Admin/Branch Admin get both). A single
     `batches_update_staff` RLS policy gated on just `.update` would have let a Coach archive a
     batch they merely have edit rights on — RLS's `WITH CHECK` can't cheaply compare
     `OLD.status` vs `NEW.status` in one clause. Fixed with a `BEFORE UPDATE` trigger
     (`enforce_batch_archive_perm`, same shape as this migration's own Last-Owner/seed-admin
     protection triggers), not a second policy. Verified in the smoke test: an Assistant Coach
     membership (update, no archive) gets a genuine rejection archiving a batch; the Owner
     succeeds.
  - "Own batches" (`my_batch_ids()`, built in migration 0006, unused until now) is NOT layered
    into the staff RLS policies as an extra restriction — same precedent migration 0008 already
    set for Coach's `people.student.read` (branch-scoped permission is sufficient at the RLS
    layer even though the matrix says "🔷 own batches"; the narrowing is an app-layer/UI scope).
    `my_batch_ids()` gets its first real consumer here: `listMyBatches` in the scheduling
    service.
  - Student/Parent read access (matrix: "👁 own"/"👁 wards") is real RLS
    (`batches_select_participant`, `class_sessions_select_self`/`_guardian`) even though no
    dedicated student/guardian schedule page is built this phase — same "RLS complete now, UI
    later" precedent as Phase 6's `listWardEnrollments`.
- `packages/modules/scheduling/src/service.ts` — full CRUD for programs/batches/holidays,
  coach assignment (`assignCoach`/`listCoachAssignments`/`removeCoachAssignment`), batch roster
  (`addToBatchRoster`/`listBatchRoster`/`removeFromBatchRoster` over `batch_enrollments`), class
  session listing/status override (`listClassSessions`/`setClassSessionStatus`), and the
  materialization job (`materializeSessions`, `materializeBatchSessions` for a single batch).
  `createBatch`/`updateBatch` (when `schedule` changes) call `materializeBatchSessions`
  immediately — a coach/admin creating or editing a batch sees its upcoming sessions right
  away, not after the next nightly job run — and `createBatch` also idempotently enqueues the
  recurring rolling-window job (`ensureMaterializationJobScheduled`, keyed by date so the
  bootstrap enqueue and the job's own self-reschedule converge on one job/day instead of
  racing). `materializeSessions`/`materializeBatchSessions` use `getServiceClient()` (no single
  caller's session to scope to — registered in `SERVICE_ROLE_MANIFEST`); every other export
  uses `withRequestContext` and is RLS-gated.
- `packages/modules/scheduling/src/tz.ts` — zoned-time → UTC conversion
  (`zonedTimeToUtc`/`isoDayOfWeek`/`addDays`) for materialization, hand-rolled via
  `Intl.DateTimeFormat` (no date library exists in this monorepo yet) — a two-pass offset
  lookup, DST-safe for any IANA zone though v1 orgs are India-only (`Asia/Kolkata`, no DST).
  Verified live in-browser against the real `Asia/Kolkata` conversion (16:00 local → 10:30 UTC).
- `apps/worker/src/registry.ts` — first real job handler:
  `scheduling.materialize_sessions` → `materializeSessions()` then self-reschedules +24h
  (the queue has no native recurrence; idempotency-keyed by date, same convergence logic as
  `ensureMaterializationJobScheduled`). `apps/worker` now depends on `@abhyas/module-scheduling`.
- Routes (all new): `GET/POST /api/v1/orgs/{id}/programs`, `GET/POST .../batches`,
  `GET/PATCH .../batches/{batchId}`, `GET/POST .../batches/{batchId}/coaches` +
  `DELETE .../{membershipId}`, `GET/POST .../batches/{batchId}/roster` +
  `DELETE .../{enrollmentId}` (marks `left`, not a hard delete),
  `GET .../batches/{batchId}/sessions` + `PATCH .../{sessionId}` (ad-hoc status override),
  `GET/POST .../holidays` + `DELETE .../{holidayId}`.
- `apps/web/src/app/scheduling/page.tsx` — staff console: programs, batch create form
  (day-of-week picker, start/end time, branch/program selects), an expandable per-batch panel
  (coaches / roster / upcoming sessions with cancel), and holidays. Same plain-fetch client
  component style as `/people`/`/family`. No student/guardian schedule view — RLS is real,
  page is deferred (see gap above).
- `eslint.config.mjs` — `V2_WEB_PATHS` gained `app/scheduling/**` (`api/v1/orgs/**` already
  covered the new org sub-routes).
- `packages/platform/src/db/service-role-manifest.ts` — new entry for
  `scheduling/src/service.ts` (materialization job only; everything else in that file is
  RLS-gated).

**Verified live in a real browser**: signed in, created an academy org, went to `/scheduling`.
Created a program ("Swimming Level 1"). Created "Batch A" (Main branch, Mon/Wed/Fri,
16:00-17:00 local, starting today) — 13 sessions materialized immediately, all `scheduled`,
confirmed via direct API fetch that `startsAt` is `2026-07-20T10:30:00.000Z` for a 16:00
`Asia/Kolkata` batch (exactly UTC+5:30, confirmed against the browser's own `Asia/Kolkata`
timezone offset). Added a holiday on one of the batch's session dates, PATCHed the batch's
schedule to force immediate re-materialization, and confirmed that exact date's session
flipped from `scheduled` to `holiday` (idempotent — no duplicate rows, other sessions
untouched) — both via a direct API check and re-rendered in the UI. Assigned a coach
(the org's Owner membership) to the batch via the UI dropdown and confirmed it listed.
Also unit-smoke-tested directly against a live DB (`npx tsx`, not committed, matches every
prior phase's precedent) — 18/18 assertions: batch creation immediately materializes ~30
sessions; holiday-triggered re-materialization flips status and is idempotent; a manual
cancellation survives re-materialization; coach assignment + `my_batch_ids()`-backed
`listMyBatches`; batch roster add; an enrolled student can read the batch and its sessions via
`batches_select_participant`/`class_sessions_select_self`; an unrelated user is correctly
denied (batch read, coach assignment); an Assistant Coach (has `.update`, not `.archive`) is
correctly denied archiving a batch while the Owner succeeds; coach assignment removal.
`npm run type-check` (21 packages incl. `module-scheduling` and `worker`'s new dependency),
`npm run lint`, `npm run db:reset` (9 migrations apply clean), and `npm run db:check-rls`
(32 tables, 1 allow-listed) all pass.

**Known gaps / not built (deliberately, in scope for later phases):**
- No student/guardian-facing schedule page — RLS (`batches_select_participant`,
  `class_sessions_select_self`/`_guardian`) is real and smoke-tested, only the consuming UI is
  deferred, same precedent as Phase 6's `listWardEnrollments`.
- No search-by-name/roll-number picker beyond what `/people`'s enrollment list already returns
  — the roster/coach pickers on `/scheduling` reuse the existing enrollments/members list
  fetches, same interim shape as prior phases' raw-ID pickers before a real search UI exists.
- Audit logging is still not retrofitted onto this phase's writes (batch/program/holiday
  create-update, coach/roster assignment) — same acknowledged debt every phase since Phase 5
  has flagged, now one phase larger.
- The worker's `scheduling.materialize_sessions` cron path is only exercised by
  `createBatch`'s bootstrap enqueue + the handler's own self-reschedule in this phase's
  verification — no `apps/worker --once` cron trigger is wired up in any deployed environment
  yet (no hosting project provisioned, per Phase 1's ground truth); local verification instead
  called `materializeSessions()`/`materializeBatchSessions()` directly and via the batch
  create/update paths.

## Phase 8 — Attendance: ✅ DONE, verified live in-browser + live-DB smoke test

Scope built: `face_enrollments` (+ Doc 07 §21.2's `membership_id` staff-enrollment extension,
folded in now rather than deferred), `attendance_events`, `attendance_review_queue`,
`staff_attendance_events` (§21.2, also folded in now), face matching (`match_face()`), the
face check-in engine (US-3), append-only corrections, the review queue resolve flow, staff
self-attendance, and both Doc 14 §8 background jobs (grace-period absence evaluation, 5-min
cadence; consent-withdrawal embedding purge, 6h cadence). face-api.js 128-dim embeddings per
this project's locked scope decision (not Doc 07's literal `vector(512)`) — reused the archived
V1 build's already-working face-api.js integration wholesale (same model weight files at
`apps/web/public/models/`, same descriptor extraction call), not rebuilt from scratch.

What exists (don't recreate):
- `supabase/migrations/0010_attendance.sql` — all four tables (Doc 07 §8 + §21.2) + RLS +
  `match_face()`. Two real, non-obvious design points, both explained in the migration's header
  — re-read it before touching this schema:
  1. `face_enrollments.embedding` is **nullable**, deviating from Doc 07's literal `not null` —
     required to support the tombstone-on-withdrawal behavior the doc's own prose describes one
     line below the schema ("embedding nulled + row tombstoned"). A `not null` column can't
     later be nulled.
  2. `match_face(p_batch_id, p_embedding, p_match_count)` is `SECURITY DEFINER` and takes **no**
     org/tenant parameter — it derives scope from `current_org()` plus a caller-supplied
     `batch_id` it independently verifies belongs to that org. This closes a real gap in the
     archived V1 function of the same purpose
     (`migrations_v1_legacy/0004_functions_triggers.sql`'s `match_face_embedding`), which took
     `p_tenant_id` as a caller-supplied parameter with no ownership check — any authenticated
     caller could pass an arbitrary tenant and search its enrolled faces. Doc 07 §17 names this
     gap explicitly ("fixes gap G-`match_face_embedding`"); this migration is where the fix
     lands.
  Low-confidence face matches never write `attendance_events` directly (US-3 AC2, "never
  auto-fine") — they land in `attendance_review_queue` instead; only a human confirmation (or a
  high-confidence match) produces a real attendance event. Corrections are append-only via
  `superseded_by`: a new `method='override'` row is inserted, then every currently-live row for
  that (session, enrollment) is updated to point at it — never edited in place.
  **One real bug found and fixed while smoke-testing this migration**, not pre-existing:
  `enforce_face_enrollment_consent()` (the "no consent row → no embedding" BEFORE INSERT
  trigger) was originally plain `plpgsql`, not `SECURITY DEFINER` — its internal `SELECT`s
  against `consents`/`enrollments` ran under the *enrolling staff member's* RLS, and
  `consents_select_related` (migration 0003) only allows the subject or the granter to read a
  consent row. A coach enrolling a face on a guardian-granted consent isn't either of those, so
  every legitimate enrollment was being rejected with "requires an active biometric_face
  consent" even though the consent genuinely existed. Fixed the same way `has_perm()`/
  `is_guardian_of()`/`is_batch_participant()` needed `SECURITY DEFINER` for their own internal
  reads (migrations 0006/0008/0009) — worth remembering as a general rule for any future
  trigger function (not just RLS policy) that reads a table gated by someone else's RLS.
  RBAC-wise, no new permission keys were needed — migration 0006 (Phase 4) had already seeded
  `attendance.record`/`.read`/`.override`/`.review_queue.resolve`/`.face.enroll`/`.self_record`
  with role grants matching Doc 04 §5's matrix exactly (verified by smoke test: Front Desk can
  record but not override; Assistant Coach/Owner can't self-record or can respectively, per
  Doc 04 §21.2's literal "granted to Coach, Assistant Coach, Front Desk" — Owner deliberately
  does NOT hold `attendance.self_record`, confirmed live in-browser, not a bug).
- `packages/modules/attendance/src/service.ts` — full implementation: face enrollment
  (`enrollFace`/`listFaceEnrollments`/`deleteFaceEnrollment`), matching + check-in
  (`matchFace`/`checkInByFace`), manual record + append-only override
  (`recordAttendance`/`overrideAttendance`), listings (`listAttendanceEvents`/
  `listMyAttendance`/`listWardAttendance`), review queue (`listReviewQueue`/
  `resolveReviewQueueItem`), staff self-attendance (`recordStaffAttendance`/
  `listStaffAttendance`), and the two background jobs (`evaluateAbsences`/
  `purgeWithdrawnFaceEmbeddings`) with idempotent bootstrap helpers
  (`ensureAbsenceEvalJobScheduled`/`ensurePurgeJobScheduled`) called opportunistically from
  `recordAttendance`/`enrollFace` — same self-bootstrapping shape as Phase 7's
  `ensureMaterializationJobScheduled`, but triggered from this module's own write paths instead
  of `scheduling.createBatch`, so attendance stays independent of scheduling's internals (Doc 14
  §2 rule 2). `evaluateAbsences()` enqueues `attendance.absence_confirmed` (Doc 14 §8's literal
  event-kind name) per newly-marked absence — no consumer exists yet (Notifications/Finance are
  Phases 9-10), so these dead-letter after 5 attempts (migration 0002's default) until a later
  phase registers a handler; harmless, the underlying signal (the `absent` `attendance_events`
  row) is real and queryable regardless.
- `apps/worker/src/registry.ts` — two new self-rescheduling job handlers:
  `attendance.evaluate_absences` (+5min, matching Doc 14 §8's "time-critical absence alerts get
  a dedicated per-5-min cron") and `attendance.purge_withdrawn_face_embeddings` (+6h,
  comfortably inside Doc 14 §8's 24h consent-withdrawal-deletion SLA). `apps/worker` now depends
  on `@abhyas/module-attendance`.
- Routes (all new): `GET/POST /api/v1/orgs/{id}/batches/{batchId}/sessions/{sessionId}/attendance`
  (list live events / manual record), `.../attendance/override` (append-only correction),
  `.../attendance/face-check-in` (US-3 engine), `GET/POST /api/v1/orgs/{id}/attendance/
  face-enrollments` + `DELETE .../{faceEnrollmentId}`, `GET /api/v1/orgs/{id}/attendance/
  review-queue` + `POST .../{reviewQueueId}/resolve`, `GET/POST /api/v1/orgs/{id}/attendance/
  staff-check-in`, `GET /api/v1/me/attendance`, `GET /api/v1/me/wards/{wardUserId}/attendance`.
- `apps/web/src/app/attendance/page.tsx` — staff console: batch/session picker, roster with
  manual mark/override buttons, a live face-scan panel, the review queue (confirm/reject), and a
  face-enrollment panel. `apps/web/src/app/attendance/face-scanner.tsx` — shared face-api.js
  camera capture component, ported from the archived V1 build's already-working
  `admin/enroll-face` page (same model loading, same `detectSingleFace().withFaceLandmarks()
  .withFaceDescriptor()` call) but simplified from V1's decorative HUD overlay down to a plain
  functional widget matching this codebase's console style.
  **Face enrollment is a genuine two-actor flow, not a UI simplification** — Doc 04 §5's matrix
  marks Parent as "consent only" for the "Face enrollment" row, meaning a guardian can never
  hold `attendance.face.enroll` (staff-only) and staff can never see a guardian's `consents` row
  via RLS (`consents_select_related` is subject-or-granter-only). `apps/web/src/app/family/
  page.tsx` gained a "Grant biometric consent" button (`BiometricConsentButton`) that calls the
  existing `POST /api/v1/me/consents` and displays the resulting consent id for the guardian to
  hand to staff (shown on-screen — a real, verified-working handoff pattern, not a stub).
- `eslint.config.mjs` — `V2_WEB_PATHS` gained `app/attendance/**` (`api/v1/orgs/**`/
  `api/v1/me/**` already covered the new nested attendance routes).
- `packages/platform/src/db/service-role-manifest.ts` — new entry for
  `attendance/src/service.ts` (the two background jobs only; everything else is RLS-gated via
  `withRequestContext`).

**Verified two ways, matching every prior phase's precedent:**
1. **Live-DB smoke test** (`npx tsx`, run against local `supabase start`, not committed) — 27/27
   assertions: unrelated staff denied face enrollment; coach enrolls successfully; a consent for
   the wrong subject is rejected (the trigger fix above, confirmed working); `match_face` finds
   an exact-embedding match at ~1.0 similarity; a confident face check-in records attendance
   directly; a nudged (lower-confidence) embedding either records or queues for review, never
   silently drops; an unrelated embedding reports `no_match`; the review queue lists a queued
   item, a role without `attendance.review_queue.resolve` is denied resolving it, and confirming
   writes a real `attendance_events` row; front desk records manually but is denied overriding
   (no `attendance.override`); an owner's override supersedes the prior row (confirmed via
   `superseded_by`, not an edit) and `listAttendanceEvents` returns only the live row; the
   student reads their own attendance, the guardian reads their ward's, an unrelated user reads
   zero rows; coach self-checks-in, is denied an `admin_override` self-insert, and the owner
   successfully `admin_override`s the coach's row instead; `evaluateAbsences` marks an unattended
   past-grace-period session absent and enqueues `attendance.absence_confirmed`; withdrawing a
   consent and running `purgeWithdrawnFaceEmbeddings` nulls the embedding, tombstones the row,
   and writes an `audit_log` entry; manually deleting a face enrollment tombstones it.
2. **Live in-browser**: signed in, created an academy org, built a program/batch/enrollment via
   `/scheduling`/`/people` (Phase 7/6 UIs), granted biometric consent for a guardian-added ward
   via `/family`'s new button (real consent id returned and displayed), and drove the full
   `/attendance` console — manual "Present" mark, override to "Late" (roster badge updated
   correctly), a correctly-denied self-check-in for the Owner role (RLS working as documented,
   not a bug), and the face-scan/enrollment panels: face-api.js's models loaded successfully
   (`GET /models/*` all 200, confirmed via network log) and the camera-permission-denied state
   rendered gracefully (the Browser pane sandbox blocks `getUserMedia`, a known environment
   limitation — the model pipeline itself is confirmed working, live device capture is not
   testable in this environment).

`npm run type-check` (22 packages incl. the two new/changed workspace deps), `npm run lint`
(fixed 12 raw-SQL-interpolation violations the same way Phase 5-7 did — column-list `${}`
template literals moved into pre-built `const ..._SQL` variables before the `.query()` call),
`npm run db:reset` (10 migrations apply clean), and `npm run db:check-rls` (36 tables, 1
allow-listed) all pass.

**Known gaps / not built (deliberately, in scope for later phases):**
- `attendance.absence_confirmed` has no consumer yet — Notifications (Phase 10, the real
  <5min-latency alert dispatch) and Finance (Phase 9, fine assessment per Doc 14 §2 rule 2
  "attendance never inserts into charges; it calls `finance.assessFine()`") both land later. The
  signal
  (the `absent` attendance_events row + the queued event) is real now; only the reaction is
  deferred.
- No admin-facing "consent id" lookup — the guardian must copy/relay the id to staff manually
  (shown on `/family`, copy-to-clipboard button). A QR-code handoff or a staff-side "pending
  consents" inbox would be a real UX improvement but isn't required for the flow to work
  correctly; same "service+routes real, UI polish later" precedent as every prior phase's
  raw-ID pickers.
- No student/guardian-facing attendance history page — `listMyAttendance`/`listWardAttendance`
  and their routes are real and RLS-gated, only the consuming UI is deferred, same "RLS complete
  now, UI later" precedent as Phase 7's `batches_select_participant`.
- Audit logging is retrofitted onto exactly one new write path this phase (the purge job's
  `write_audit_log()` call) — every other new write (enrollFace, recordAttendance,
  overrideAttendance, resolveReviewQueueItem, recordStaffAttendance) does not call
  `writeAuditLog()`, same acknowledged debt every phase since Phase 5 has flagged, now one phase
  larger.
- Live device capture (camera + face-api.js in a real browser tab) is confirmed working via the
  model-loading network trace, but this environment's Browser pane sandbox blocks
  `getUserMedia`, so an actual face-match round trip was verified only via the live-DB smoke
  test (synthetic embeddings), not with a real captured face. Worth a manual pass in a
  non-sandboxed browser (or staging) before treating the face-scan UX itself as fully verified,
  though the engine it calls is.

## Phase 9 — Finance: ✅ DONE, verified live-DB smoke test (27/27) + live in-browser

Scope built: `fee_policies`/`charges`/`payments`/`payment_allocations`/`ledger_accounts`/
`ledger_entries`/`payouts`/`org_bank_accounts` (Doc 07 §9, literal schema), the
accounting-truth constraint-trigger pairing, payment recording (cash/waiver instant-settle,
manual-proof submit + staff approve/reject), refunds, payouts (manual settlement — no
gateway configured), and `finance.assessFine()` as the real consumer of
`attendance.absence_confirmed` (Doc 14 §2 rule 2), emitted-but-unconsumed since Phase 8.

What exists (don't recreate):
- `supabase/migrations/0011_finance.sql` — all 8 tables + RLS + `batches.default_fee_policy_id`
  (Doc 07 §21.3, folded in — see below) + two SECURITY DEFINER SQL functions +
  a deferred constraint trigger + a new `finance.payout.manage` permission key. Several
  interpretive calls, all explained in the migration's own header — re-read it before
  touching this schema, don't re-derive from memory:
  1. **`fine_policy` jsonb is reused for two distinct fine concepts.** Doc 07 §9's own
     comment ("late-fee rules: grace days, flat/percent, cap") only covers late-PAYMENT
     fines; Doc 14 §2 separately names `finance.assessFine()` as the
     `attendance.absence_confirmed` consumer with no fine-amount shape given anywhere.
     Rather than add a second column/table, this migration keys `fine_policy` two ways:
     `{ lateFee: {...}, absenceFine: { amountMinor } }`. `assessFine()` no-ops (never
     auto-fines) when a batch's `default_fee_policy_id` is unset or `fine_policy.absenceFine`
     is absent — same never-fine-without-explicit-signal posture as Attendance's US-3 AC2.
  2. **No automated recurring charge generation** — `fee_policies.kind` implies a schedule
     but nothing in this phase's named deliverables (fee policies, charges, payment
     recording, proof approval, refunds, payouts) calls for a generator job, unlike
     Scheduling/Attendance's explicitly named background jobs. Charges are staff-created
     (`createCharge`) this phase; a scheduled generator is a real, deliberate gap.
  3. **`payments.method = 'gateway'` is schema-complete but not wired** — no RLS insert
     path, no service function. `packages/platform/src/payments` is still a typed
     interface only (Phase 1) with no merchant account to configure against, same
     "designed, not verified end-to-end" shape as Phase 2's Google OAuth. The three real
     v1 methods — `manual_proof`/`cash`/`waiver` — need no gateway and are fully built.
  4. **New permission key `finance.payout.manage`** (Owner + Accountant) — Doc 04 §5's
     "Payouts & ledger" row needs to distinguish "can request/settle" from "can only view",
     but the one seeded key (`finance.payout.read`) is held by Owner/Org Admin/Accountant
     alike and no other existing key (e.g. `org.billing.manage`) lines up with exactly
     Owner+Accountant. Same category as migration 0006's own `people.join_request.read`/
     `finance.proof.submit` additions.
  5. **`charges.status` transitions each require a different permission** than one RLS
     WITH CHECK can express (can't compare OLD vs NEW status there) —
     `enforce_charge_status_transition()`, a BEFORE UPDATE trigger, same shape as migration
     0009's `enforce_batch_archive_perm()`. The current seed happens to grant all four
     finance permissions to the same roles together so this doesn't change today's
     behavior, but Doc 04 §5 treats "Charges & payments" and "Proof approval / waivers /
     refunds" as separate rows and a future role split shouldn't need this trigger touched.
  6. **`ledger_entries`/`ledger_accounts` have NO write grant to `authenticated` at all**
     (Doc 07 §9's literal invariant) — the only insert path is `post_ledger_entries()`,
     mirroring migration 0007's `write_audit_log()` exactly: SECURITY DEFINER, callable
     from inside any `withRequestContext` transaction, no service-role escalation needed
     for routine finance writes. A **deferred constraint trigger**,
     `check_ledger_entry_group_balanced()`, is the real DB-enforced "sum(entry_group) = 0"
     guarantee Doc 07 §9 names — unlike the status-transition rules above (service-layer
     trust boundary, same precedent as Attendance's append-only corrections), this one
     gets real PL/pgSQL enforcement regardless of application-code correctness. Verified
     two ways in the smoke test: `post_ledger_entries()`'s own fast-fail check, AND a
     direct service-role insert bypassing that function entirely (the trigger catches it
     independently at COMMIT).
  7. **This phase's ledger only books the SETTLEMENT leg** — charge creation posts nothing
     (Doc 07 §9's invariant is scoped to `payments.status → succeeded`, not charge
     creation); `org_receivable` functions as the clearing/offset leg for collected cash
     rather than a running accrual balance. A full accrual model (charge creation posting
     its own entry) isn't required by any Phase 9 named deliverable.
  8. **`batches.default_fee_policy_id`** (Doc 07 §21.3, otherwise a later wireframe
     follow-up) is folded in — without it there's no path from an attendance-triggered
     absence back to "which fee_policy's fine rules apply here", which `assessFine()`
     needs to do anything. The rest of §21.3 (packages/trials/registration kinds,
     `enrollment_fee_overrides`, `package_balances`) is NOT built — not required.
  - **Real node-postgres bug hit and fixed while smoke-testing**, worth remembering for
    any future jsonb *array* parameter: pg auto-`JSON.stringify`s a plain JS **object**
    bound to a query param (already relied on elsewhere, e.g. `batches.schedule`), but a
    top-level JS **array** gets serialized as a Postgres ARRAY literal instead, which
    breaks a `jsonb` function parameter expecting a JSON array. `post_ledger_entries(p_entries jsonb)`
    callers must `JSON.stringify()` the array explicitly — object params still pass
    through raw. Don't "clean up" an explicit `JSON.stringify()` on an array param in this
    codebase without checking which case it is.
- `packages/modules/finance/src/service.ts` — fee policy CRUD, charge CRUD + waive/cancel,
  payment recording (`recordManualPayment` for cash/waiver — settles instantly, no separate
  approval step; `submitPaymentProof` + `approvePayment`/`rejectPayment` for the
  proof-of-payment path), `issueRefund`, `listLedgerEntries`, payouts
  (`requestPayout`/`settlePayout`/`markPayoutFailed`, manual settlement) + bank accounts,
  and `assessFine()` — service-role (added to `SERVICE_ROLE_MANIFEST`), idempotent on a
  redelivered `attendance.absence_confirmed` event via a description-string match (no
  dedicated reference column). Every other export uses `withRequestContext` and is
  RLS-gated; routine ledger writes go through `post_ledger_entries()`/
  `get_or_create_ledger_account()` from inside that same request context, not service-role.
- `apps/worker/src/registry.ts` — new one-shot (not self-rescheduling) event-consumer
  handler wired to `ABSENCE_CONFIRMED_JOB_KIND` (`'attendance.absence_confirmed'`, exported
  from `@abhyas/module-finance` rather than left as a magic string on the worker side) →
  `assessFine()`. `apps/worker` now depends on `@abhyas/module-finance`.
- Routes (all new): `GET/POST /api/v1/orgs/{id}/finance/fee-policies` +
  `PATCH .../{feePolicyId}`, `GET/POST .../finance/charges` +
  `POST .../{chargeId}/{waive,cancel,refund}`, `GET/POST .../finance/payments` +
  `POST .../{paymentId}/{approve,reject}`, `GET .../finance/ledger`,
  `GET/POST .../finance/payouts` + `POST .../{payoutId}/{settle,fail}`,
  `GET/POST .../finance/bank-accounts`, `GET /api/v1/me/finance/charges`,
  `GET/POST /api/v1/me/finance/payments`, `GET /api/v1/me/wards/{wardUserId}/finance/charges`.
- `apps/web/src/app/finance/page.tsx` — staff console (fee policies, charges, payments +
  pending-proof review, payouts, ledger), same plain-fetch client component style as
  `/scheduling`/`/attendance`. `apps/web/src/app/family/page.tsx` gained a per-ward
  `WardFeesSection` (view open charges, submit proof of payment) — same "consent-only
  guardian action, staff does the privileged half" shape as Phase 8's
  `BiometricConsentButton`, reused deliberately.
- `eslint.config.mjs` — `V2_WEB_PATHS` gained `app/finance/**` (`api/v1/orgs/**`/
  `api/v1/me/**` already covered the new nested finance routes).
- `packages/platform/src/db/service-role-manifest.ts` — new entry for
  `finance/src/service.ts` (`assessFine()` only; everything else is RLS-gated).

**Verified two ways, matching every prior phase's precedent:**
1. **Live-DB smoke test** (`npx tsx`, run against local `supabase start`, not committed) —
   27/27 assertions: fee policy create (owner) / denied (coach, no `finance.policy.manage`);
   charge create + student self-read + guardian ward-read + outsider sees zero; cash payment
   settles a charge to `paid` and posts exactly 2 balanced ledger legs; refund flips the
   charge to `refunded` and posts a balanced reversing group; manual-proof submit by a
   guardian + denied-approve by Coach (no `finance.proof.approve`) + approve by Accountant
   settles it; waive; `assessFine()` creates a fine charge when a batch's
   `default_fee_policy_id` has `absenceFine` configured, is idempotent on a redelivered
   event id, and no-ops when no fee policy is configured; payout request (denied for Coach,
   succeeds for Accountant via the new `finance.payout.manage` key) + settle posts a
   balanced ledger group; the ledger balance invariant rejects an unbalanced leg set both
   via `post_ledger_entries()`'s own fast-fail check and via the deferred constraint trigger
   independently (direct service-role insert bypassing the function).
2. **Live in-browser**: signed in via real magic-link flow, created an academy org (lands
   as Owner), opened `/finance`, created a fee policy through the actual form — confirmed
   rendering (`₹2,500.00`, correctly formatted) with no console errors and no failed
   network requests.

`npm run type-check` (22 packages incl. the new module + worker's new dependency),
`npm run lint` (one real bug caught and fixed — see the node-postgres jsonb-array note
above), `npm run db:reset` (11 migrations apply clean), and `npm run db:check-rls`
(44 tables, 1 allow-listed) all pass.

**Known gaps / not built (deliberately, in scope for later phases):**
- No automated recurring charge generation (see header point 2 above) — Notifications
  (Phase 10) is a natural place to also drive fee-due reminders off the same generator
  when it's eventually built.
- `payments.method = 'gateway'` / `packages/platform/src/payments` real Razorpay wiring —
  same "designed, not configured" gap as Google OAuth since Phase 2.
- No admin UI for `org_bank_accounts` beyond the raw add-form on `/finance` (no masked
  display polish, no KYC verification flow) — schema + RLS real, UI is functional but
  minimal, matching every prior phase's "service+routes real, UI polish later" precedent.
- Audit logging is not retrofitted onto this phase's writes (payment approve/reject,
  refund issue, charge waive, payout settle) despite finance being the paradigm case for
  Doc 07 §16 — same acknowledged debt every phase since Phase 5 has flagged, now one
  phase larger.
- No student/guardian-facing full payment history page beyond `/family`'s compact
  `WardFeesSection` (open charges + proof submission only) — `listMyCharges`/
  `listMyPayments` and their routes are real, a fuller self-service view is UI polish.

## Phase 10 — Notifications: ✅ DONE, verified live-DB smoke test (16/16) + live in-browser

Scope built: `notification_templates`/`notification_preferences`/`notification_deliveries`
(Doc 07 §10, literal) + `push_subscriptions` (new — see below), real email (SMTP/Inbucket)
and real push (Web Push/VAPID) channel transports, manual send + template management +
delivery log, self-service preferences, and `notifyAbsenceConfirmed()` — the real consumer
of `attendance.absence_confirmed` (Doc 14 §8's <5min parent-alert latency target),
coexisting with Finance's `assessFine()` on the same event since Phase 9.

What exists (don't recreate):
- `supabase/migrations/0012_notifications.sql` — all 3 literal tables + `push_subscriptions`
  (new) + RLS + grants + an en-only seed of the `attendance.absence_confirmed` platform
  template (email + push). Interpretive calls, all explained in the migration's own header:
  1. **No branch-column refinement** on templates/deliveries (Doc 07 §10's literal schema
     has no `branch_id`) — `has_perm()` (org-wide) gates every policy, same "branch-scoped
     permission is sufficient at the RLS layer, narrowing is app-layer/UI" precedent Phase 7
     set for Coach's "own batches" People read. RBAC needed **no new permission keys** —
     migration 0006 already seeded `notify.template.manage`/`notify.send.manual`/
     `notify.log.read`/`notify.fee_reminder.send` matching Doc 04 §5's row exactly.
  2. **`updated_at` added** to `notification_templates`/`notification_deliveries` (convention
     #9) — both rows are genuinely mutable (template edits; delivery status transitions).
  3. **`push_subscriptions` is a new table**, not in Doc 07 §10's literal list — needed to
     make "push" a real, verifiable channel via Web Push (VAPID) instead of another
     `not_configured` stub (FCM/APNs both need an unconfigured paid vendor, same category as
     WhatsApp BSP/SMS DLT/Razorpay). VAPID needs no vendor account, just a self-generated
     keypair (`npm run keys:generate:vapid`, same shape as this repo's own JWT keypair
     script) — matches this project's existing bias toward portable/self-hosted infra over
     vendor lock-in (Doc 02 §11). Owned by this module, not identity-auth, since it's
     push-channel machinery.
  4. **`notification_deliveries` gets an asymmetric grant** — `select, insert` to
     `authenticated`, no `update`/`delete`. The manual-send path inserts its own `queued` row
     (RLS-gated, genuinely the staff caller's own action — unlike `ledger_entries`/
     `audit_log`'s "no grant at all" reserved for pure system-of-record tables); only the
     dispatch job (service-role, `apps/worker`) may flip `status` afterward. `push_subscriptions`
     similarly gets no `update` grant — re-subscribing an existing endpoint is delete+insert,
     not upsert (a real bug caught by this phase's own smoke test: an `ON CONFLICT ... DO
     UPDATE` in the service code required an UPDATE grant the migration deliberately doesn't
     have — fixed by matching the code to the migration's original intent instead of adding
     the grant).
  5. **Two partial unique indexes** on `notification_templates`, not one constraint — Postgres
     treats every `NULL` as distinct, so a plain `unique(organization_id, key, channel,
     language)` would let the platform library accumulate duplicate rows.
- `packages/platform/src/notify/index.ts` — **redesigned from Phase 1's pre-declared
  interface**, which coupled template/recipient lookup (tables owned by this module, not
  platform) into the transport layer and was never implemented ("Full schema and dispatch
  pipeline land in Phase 10"). Replaced with a plain transport-only `send(target)` over a
  discriminated union (`email`/`push`/`whatsapp`/`sms`) — the caller resolves the template,
  renders the body, and looks up contact info itself (same "read across module boundaries via
  direct SQL" precedent Attendance/Finance already set reading Scheduling's tables).
  `packages/platform/src/notify/channels/email.ts` — real, via `nodemailer` against local
  Supabase's Inbucket SMTP (127.0.0.1:54325, no auth) by default, the exact same infra Phase 2
  already verified end-to-end for magic-link emails; `SMTP_HOST`/`PORT`/`USER`/`PASS`/`FROM`
  env vars point it at a real relay in staging/prod, no code change.
  `packages/platform/src/notify/channels/push.ts` — real, via `web-push` (VAPID). WhatsApp/SMS
  stubs (Phase 1) unchanged, still `not_configured`.
- `packages/modules/notifications/src/service.ts` — template CRUD (`listTemplates`/
  `upsertTemplate`), self-service preferences (`getMyPreferences`/`setMyPreference` — no
  permission gate, Doc 04 §4 "own notification prefs" is an identity right), push subscription
  self-service (`subscribeToPush`/`unsubscribeFromPush`), manual send
  (`sendManualNotification` — RLS-gated insert of `queued` delivery rows, then enqueues one
  `notifications.dispatch_delivery` job per row), the delivery log (`listDeliveries`), the
  dispatch primitive (`dispatchDelivery`, service-role — renders a template's `{{placeholders}}`
  and calls `notify.send()`), and `notifyAbsenceConfirmed()` (service-role — resolves the
  absent student's own account plus active guardians via a direct `guardianships` read,
  notifies each over every real channel they haven't muted, idempotent via a
  `ref_type`/`ref_id`/`recipient`/`channel` dedup lookup on redelivery).
  **Real bug found and fixed during this phase's own smoke test**: the muting-floor check
  (US-4 AC3) in `sendManualNotification` originally ran inside the staff caller's own
  `withRequestContext` session — but `notification_preferences` RLS is strictly self-only
  (migration 0012), so that SELECT against the *recipient's* preference row silently returned
  zero rows every time, meaning the floor could never engage (a muted recipient still got
  notified). Fixed by reading preferences via a service-role client instead — a legitimate
  read (enforcing someone's own opt-out), same category as `notifyAbsenceConfirmed`'s
  already-service-role preference check; the delivery-row INSERT itself stays RLS-gated on
  `notify.send.manual`.
- `apps/worker/src/registry.ts` — **`JOB_HANDLERS` changed shape**, from
  `Record<string, JobHandler>` to `Record<string, JobHandler[]>` — `attendance.absence_confirmed`
  now has two independent consumers (`finance.assessFine`, `notifications.notifyAbsenceConfirmed`)
  and a single-handler map can only ever hold one function per key. `apps/worker/src/index.ts`'s
  poller now runs every handler for a claimed job kind and only marks it complete if all
  succeed; a retry re-runs all of them, so every handler must be idempotent on redelivery
  (both of this event's consumers already are). New handlers: the two
  `attendance.absence_confirmed` consumers, plus `notifications.dispatch_delivery` (the
  manual-send path only — `notifyAbsenceConfirmed` calls `dispatchDelivery()` directly since
  it's already running in-worker). `apps/worker` now depends on `@abhyas/module-notifications`.
- Routes (all new): `GET/PUT /api/v1/me/notification-preferences` (PUT sets one row per call —
  the resource's PK is composite, there's no single "whole set" to PUT),
  `POST/DELETE /api/v1/me/push-subscriptions` (not in Doc 08's literal route list — necessary
  plumbing for the push channel to work at all), `GET/POST /api/v1/orgs/{id}/notifications/templates`
  (POST upserts by key/channel/language), `POST /api/v1/orgs/{id}/notifications/send`,
  `GET /api/v1/orgs/{id}/notifications/log`.
- `apps/web/src/app/notifications/page.tsx` — staff console (templates, manual send, delivery
  log), same plain-fetch client component style as `/scheduling`/`/attendance`/`/finance`.
  `apps/web/src/app/me/notifications/page.tsx` — new, standalone self-service page (any
  signed-in user, not org-scoped) for per-kind/channel mute toggles and a "Enable push on this
  device" button driving the real `PushManager.subscribe()` flow.
  `apps/web/public/sw.js` — service worker handling the `push` event → `showNotification`.
- `scripts/generate-vapid-keys.mjs` (`npm run keys:generate:vapid`) — VAPID keypair generation,
  same shape as `scripts/generate-keys.mjs`'s JWT keypair. `.env.example` gained the
  SMTP/VAPID vars (all optional locally — email defaults to Inbucket, push fails cleanly with
  a clear error if VAPID keys are unset).
- `eslint.config.mjs` — `V2_WEB_PATHS` gained `app/notifications/**`, `app/me/**`.
- `packages/platform/src/db/service-role-manifest.ts` — new entry for
  `notifications/src/service.ts` (dispatch, the absence consumer, and the muting-floor
  preference pre-check — everything else is RLS-gated via `withRequestContext`).

**Verified two ways, matching every prior phase's precedent:**
1. **Live-DB smoke test** (`npx tsx`, run against local `supabase start`, not committed) —
   16/16 assertions: template create/upsert-in-place/RLS-denial for an outsider/platform-library
   read; manual send creates a queued delivery, `dispatchDelivery` sends a real email via
   Inbucket (confirmed `status: sent`); a recipient with no `notify.log.read` reads zero
   delivery rows; the muting floor actually blocks a muted recipient (post-fix);
   `notifyAbsenceConfirmed` dispatches over both real channels, the email sends, the push
   fails cleanly with no subscription on file, and a redelivered event is idempotent (0
   dispatched, 2 skipped); a real subscribed push attempt runs the full VAPID transport
   without crashing even against a fake endpoint; the no-UPDATE-grant invariant on
   `notification_deliveries` is enforced by RLS, not just app-layer trust (direct `UPDATE`
   and a direct non-`queued` `INSERT` both correctly rejected with 42501).
2. **Live in-browser**: signed in via real magic-link flow (confirmed via Inbucket UI —
   the sign-in email AND the smoke test's own notification emails were both visible there,
   real SMTP delivery, not mocked), created an academy org, opened `/notifications` — the
   seeded platform template library rendered correctly. Sent a manual notification to self
   (`attendance.absence_confirmed`, email) — delivery appeared as `queued`; ran the actual
   `apps/worker --once` binary (not a direct function call) and confirmed the delivery
   flipped to `sent` through the real claim → dispatch → complete job cycle. On
   `/me/notifications`, toggled the email preference off via the real PUT round trip and
   confirmed the UI reflected the muted/enabled state correctly (screenshot-verified: email
   greyed out with a bell-off icon, push still green/enabled).

`npm run type-check` (23 packages incl. the new module + worker's new dependency),
`npm run lint` (one raw-SQL-interpolation violation caught and fixed — same
column-list-in-a-const-before-`.query()` pattern every prior phase used),
`npm run db:reset` (12 migrations apply clean), and `npm run db:check-rls` (48 tables, 1
allow-listed) all pass.

**Known gaps / not built (deliberately, in scope for later phases):**
- WhatsApp/SMS remain `not_configured` stubs — no vendor chosen (locked scope decision).
- Push (VAPID) has no retry/backoff beyond the queue's own job-level retry — a `failed` push
  delivery isn't automatically retried on a different channel (`status: 'fallback'` exists in
  the schema's check constraint per Doc 07 §10 but nothing writes it yet — no fallback-routing
  logic is built this phase).
- Template library seeding is `en`-only — `hi`/`te` need real translation content, not
  fabricated placeholder text (same posture as every prior phase's "designed, content polish
  later" gaps).
- Audit logging is not retrofitted onto this phase's writes (template upsert, manual send,
  preference changes) — same acknowledged debt every phase since Phase 5 has flagged, now one
  phase larger.
- No automated recurring-charge-driven fee-due reminders (Phase 9's own flagged gap) — the
  notification plumbing to send them now exists, but nothing generates the underlying charges
  yet.
- No student/guardian-facing view of their own delivery history — `notification_preferences`
  is self-service and real, but there's no "here's what you were sent" page, only the
  org-staff `/notifications` log (gated on `notify.log.read`, which no student/parent role
  holds per Doc 04 §5's matrix — same "—" cells Attendance/Scheduling left for those roles).

## Phase 11 — Marketplace: ✅ DONE, verified live-DB smoke test (33/33) + live in-browser

Scope built: `taxonomy_sports`/`geo_cities`/`geo_areas` (platform reference data),
`listings`/`leads`/`reviews` (Doc 07 §11, literal), and `referrals` (Doc 07 §15) —
folded in here per the marketplace module's own Phase-1 stub comment, which
already scoped referrals into this phase ("listings, leads, reviews, taxonomy,
geography, referrals (M9, Doc 07 §11)"), not a later phase. Public/anonymous
discovery (`/explore`, listing detail, lead capture) is real and SEO-facing;
featured placement is schema-only (`featured_until`, staff-settable, no paid
checkout — same "no gateway configured" posture as Finance's payouts).

What exists (don't recreate):
- `supabase/migrations/0013_marketplace.sql` — all 7 new tables + RLS +
  `is_org_owner()`/`activate_org_listings()`/`get_or_create_user_ledger_account()`/
  `get_or_create_platform_ledger_account()` (SECURITY DEFINER) + a new
  `platform.referral.manage` permission key + taxonomy/geography seed data.
  Several interpretive calls and **two real RLS bugs found and fixed while
  smoke-testing**, all explained in the migration's own header — re-read it
  before touching this schema:
  1. **No literal Postgres `anon` role exists in this app** — `withRequestContext`
     always drops to `authenticated`, so public/anonymous reads (search, listing
     detail, reviews, taxonomy) and the anonymous lead-capture write go through
     `getServiceClient()` with an explicit `status = 'live'` filter, the exact
     precedent `resolveOrgBySlug` (Phase 3) already set — not RLS `anon` policies.
  2. **One listing per organization** (`listings.organization_id` UNIQUE) — Doc 08
     §7 names the org route singular (`GET/PATCH /org/listing`), not N-per-org.
  3. **Listing publish→live is gated on the org's OWN verification status** (Doc 02
     §9 / PRD US-1 AC5): `publishListing()` sets `live` immediately if the org is
     already `active`, else `pending_verification`. A listing published before its
     org finishes verification is promoted later by `activateOrgListings()`, wired
     as a queue consumer of a new `platform.org_verified` event — enqueued by a
     small, additive edit to **Phase 5's already-shipped**
     `platform-admin.decideOrganizationVerification()` (on approval only), per
     Doc 14 §2 rule 2 (cross-module reactions go through the queue, not a direct
     table write from platform-admin into marketplace's tables).
  4. **Referral reward approval is a manual platform action**, not an automatic
     post-subscription trigger — `subscriptions` is still schema-only (Phase 9's
     own documented gap), so there's no real subscription-succeeded event to
     consume; `approveReferralReward()` takes an explicit `amountMinor` from
     platform staff instead (`platform.referral.manage`, a new key — Doc 04's
     catalogue has no referral-specific key, same "add one, documented" precedent
     as Phase 9's `finance.payout.manage`).
  5. **Self/circular referral rejection (US-8 AC2)** is a `BEFORE UPDATE` trigger
     (`enforce_referral_attribution`, fires on attribution) using a new
     `is_org_owner()` helper — matches Doc 07 §15's own comment. WHO may attempt an
     attribution (RLS: caller must be working in the target org and hold
     `org.settings.update`) and WHETHER the attribution is valid (the trigger) are
     deliberately separate concerns, same split as `batches_update_staff` RLS vs.
     `enforce_batch_archive_perm`'s trigger.
  6. **Real bug #1**: Postgres ANDs a table's **SELECT** policy onto **UPDATE** row
     visibility *in addition to* the UPDATE policy's own USING clause, when a
     SELECT policy exists on the same table — confirmed via `EXPLAIN`, not
     prominently documented. Since `referrals_select_self` only lets the
     *referrer* see a row, the party being *referred* (who must attribute someone
     else's code) could never even see the row to update it. Fixed with a second
     SELECT policy, `referrals_select_unattributed` (`referred_org_id is null`).
  7. **Real bug #2**, same root cause one step further: Postgres ALSO ANDs a
     SELECT policy onto the **WITH CHECK** validation of the *new* (post-update)
     row. After attribution, `referred_org_id` is no longer null (so bug #1's fix
     stops matching) and the attributing party still isn't the referrer — so
     `attributeReferral()` always failed its own WITH CHECK with a real 42501.
     Fixed with a third SELECT policy, `referrals_select_referred_org`, mirroring
     the WITH CHECK's own condition. **Any future cross-actor UPDATE RLS policy on
     a table that also has a self-scoped SELECT policy needs to budget for this —
     add matching SELECT policies for both the pre- and post-update row shapes, or
     the UPDATE will silently affect zero rows (old-row case) or throw 42501
     (new-row case) even when the UPDATE policy's own USING/WITH CHECK looks
     correct in isolation.**
  8. GIN has no default operator class for a plain scalar `text` column — a
     composite `(city_key, sport_keys)` GIN index (as Doc 07 §18's phrasing might
     suggest) doesn't work; split into a btree on `city_key` + a GIN on
     `sport_keys` alone.
  9. Lead-spam mitigation (captcha + rate limit, Doc 08 §10) is **not built** — no
     captcha vendor and no request-IP-tracking infra anywhere in this codebase,
     same "designed, not configured" category as Google OAuth/Razorpay/WhatsApp.
     `submitPublicLead()` validates the listing exists and is live; nothing else
     guards against abuse. Documented gap, not a silent skip.
- `packages/modules/marketplace/src/service.ts` — full implementation: listing
  CRUD (`upsertMyListing`/`getMyListing`/`publishListing`/`pauseListing`/
  `removeListing`), `activateOrgListings()` (queue consumer, service-role), lead
  triage (`listLeads`/`updateLead`) + anonymous capture (`submitPublicLead`,
  service-role), reviews (`createReview`/`listOrgReviews`/`respondToReview`),
  public reads (`searchPublicListings`/`getPublicListing`/
  `getPublicListingReviews`/`getPublicTaxonomy` — all service-role + explicit
  filtering, real `avg(rating)`/`count(*)` aggregates over `reviews` computed
  per-query, not denormalized onto `listings`), and referrals
  (`createReferral`/`listMyReferrals`/`attributeReferral`/`listPlatformReferrals`/
  `approveReferralReward` — the last two import `hasPlatformPerm` from
  `@abhyas/module-platform-admin` rather than duplicating the platform-perm-check
  pattern). `approveReferralReward()` is the one write in this file that DOES call
  `writeAuditLog()` (a platform-staff financial action, same category
  platform-admin already audits) — every other write here follows every prior
  phase's documented not-yet-retrofitted-audit-logging precedent.
- `packages/modules/platform-admin/src/service.ts` — `decideOrganizationVerification()`
  gained one small addition: on approval, enqueues `platform.org_verified` (idempotency-keyed by org id). This is the only edit to an already-shipped
  (Phase 5) file this phase made.
- `apps/worker/src/registry.ts` — new one-shot consumer,
  `platform.org_verified` → `activateOrgListings()`. `apps/worker` now depends
  on `@abhyas/module-marketplace`.
- Routes (all new): `GET/PATCH /api/v1/orgs/{id}/listing` +
  `POST .../listing/{publish,pause,remove}`, `GET /api/v1/orgs/{id}/leads` +
  `PATCH .../{leadId}`, `GET/POST /api/v1/orgs/{id}/reviews` +
  `POST .../{reviewId}/respond`, `POST /api/v1/orgs/{id}/referral-attribution`,
  `GET/POST /api/v1/me/referrals`, `GET /api/v1/platform/referrals` +
  `POST .../{id}/approve-reward`, and the fully anonymous
  `GET /api/v1/public/{listings,listings/{slug},listings/{slug}/reviews,taxonomy}`
  + `POST /api/v1/public/leads`.
- `apps/web/src/app/marketplace/page.tsx` — staff console (listing editor with
  city/sport pickers from real taxonomy, publish/pause, leads triage, review
  respond), same plain-fetch client component style as `/finance`/`/attendance`.
- `apps/web/src/app/explore/page.tsx` + `explore/[slug]/page.tsx` — the public
  discovery surface, styled after the "Wireframes - Marketplace.dc.html"
  reference doc added mid-phase (hero search + category chips + result cards
  with a real review-rating aggregate + featured badge; listing detail with a
  sticky lead panel, a lead-capture modal, and a success screen with a soft
  "create free account" nudge). **Deleted the superseded V1 `/explore` tree**
  (`page.tsx`/`layout.tsx`/`coaches/`/`academies/`) — it queried V1 tables
  (`categories`, `coaches` via `adminDb()`) that don't exist on this branch,
  same "deleted, referenced the archived V1 schema" precedent Phase 2 set for
  the old auth routes; user-confirmed before deleting. The wireframe's filter
  rail goes well beyond this phase's schema (radius search, availability, fee
  ranges, batch type, coach demographics) — explicitly out of scope, documented
  in `marketplace/src/service.ts`'s header, same "narrower than the full
  wireframe" precedent Phase 5's platform console already set. "Send a
  message"/"Show phone" CTAs and a live batches/timings section from the
  wireframe are also not built — no public phone field on listings, and pulling
  live Scheduling data into an anonymous page is out of scope.
- `apps/web/src/app/me/referrals/page.tsx` — self-service referral code
  generation + copy-link (BR4/US-8, "any user" identity right, no permission
  gate), same standalone-settings-page shape as `/me/notifications`. No
  platform-side reward-approval UI — service+routes are real and smoke-tested,
  same "service+routes real, UI deferred" precedent every prior phase's
  platform-only actions have used.
- `eslint.config.mjs` — `V2_WEB_PATHS` gained `api/v1/public/**`,
  `app/marketplace/**`, `app/explore/**`.
- `packages/platform/src/db/service-role-manifest.ts` — new entry for
  `marketplace/src/service.ts` (public reads/lead-capture, `activateOrgListings`,
  `approveReferralReward`/`listPlatformReferrals` — everything else is RLS-gated
  via `withRequestContext`).

**Verified two ways, matching every prior phase's precedent:**
1. **Live-DB smoke test** (`npx tsx`, run against local `supabase start`, not
   committed) — 33/33 assertions: draft→live publish for an already-verified org,
   draft→pending_verification for an unverified one; an outsider denied updating
   another org's listing; a real `decideOrganizationVerification()` approval
   enqueues `platform.org_verified`, `activateOrgListings()` promotes the pending
   listing to live; public search/detail/reviews find only live listings and
   respect the city filter; `submitPublicLead` succeeds against a live listing and
   rejects an unknown/non-live slug; staff lead triage RLS (owner sees/updates,
   outsider sees zero); an enrolled student creates a review, a non-enrolled user
   is denied, staff responds, the public review read shows the response, and
   `searchPublicListings` aggregates the real rating; referral self-referral
   rejected, valid cross-org attribution succeeds, a reciprocal/circular referral
   rejected, a non-platform-staff caller denied `listPlatformReferrals`, and
   `approveReferralReward` posts a real, balanced ledger credit to the referrer.
   This smoke test is also where both RLS bugs above were caught — the first
   attribution attempt against a real cross-actor scenario failed exactly the way
   the fixes describe, not a hypothetical.
2. **Live in-browser**: real magic-link sign-in, created an `independent_coach`
   org (lands `pending`), built a listing on `/marketplace` (slug/headline/
   description/city/sport, persisted correctly via a direct API check), published
   it — correctly landed `pending_verification` (org not yet verified). Generated
   a referral code on `/me/referrals`. Separately, on `/explore`, found the smoke
   test's seeded listings by city/sport, opened a listing detail page (real
   review + org response rendering, `5.0 · 1 reviews`), and ran the full lead-
   capture flow through the actual modal — submit → `POST /api/v1/public/leads`
   → real `201 Created` → success screen with the soft account nudge, no console
   errors.

`npm run type-check` (22 packages incl. the new module + worker's new
dependency), `npm run lint` (one raw-SQL-interpolation violation caught and
fixed — a `LIMIT ${PAGE_SIZE + 1}` template literal moved to a real `$6`
parameter instead), `npm run db:reset` (13 migrations apply clean), and
`npm run db:check-rls` (55 tables, 1 allow-listed) all pass.

**Known gaps / not built (deliberately, in scope for later phases):**
- Featured placement has no paid checkout — `featured_until` is staff-settable
  only (no route/UI to set it this phase either, though the column and the
  search/display logic honoring it are real) — same "no gateway configured"
  category as Finance's payouts and Google OAuth.
- The wireframe's expanded filter rail (radius search, availability, fee-range,
  batch type, coach gender/language/experience, verified-only/verified-reviews
  trust toggles) is not built — none of it has backing columns in Doc 07 §11's
  literal schema or this migration; search only exposes city/sport/area/text.
- No "Send a message"/"Show phone" lead CTAs (no public phone field on
  listings/organizations) and no live batches/timings section on the public
  listing page (would require pulling Scheduling data into an anonymous public
  route — out of scope this phase).
- No platform-console UI for reviewing/approving referral rewards — the
  `GET /api/v1/platform/referrals` + `POST .../approve-reward` routes and the
  underlying service are real and smoke-tested, only the `/platform` console
  page wasn't extended with a Referrals tab.
- Audit logging is retrofitted onto exactly one write this phase
  (`approveReferralReward`) — every other new write (listing CRUD, lead triage,
  review create/respond, referral create/attribution) doesn't call
  `writeAuditLog()`, same acknowledged debt every phase since Phase 5 has
  flagged, now one phase larger.
- No automated recurring-charge-driven fee-due reminders, gateway payments, or
  WhatsApp/SMS — all pre-existing, unrelated gaps, unchanged by this phase.

## Phase 12 — Coach & Staff HR: ✅ DONE, verified live in-browser

Scope built (module README): `staff_profiles`/`staff_documents`/
`staff_availability`/`leave_requests`/`payout_settings` (Doc 07 §12). Coach
onboarding itself (the four workflows in Doc 04 §8 — invite, join-request,
self-serve independent-coach, platform-initiated) already exists since
Phase 3 (invitations/join_requests) and Phase 4 (membership_roles) — this
phase is the HR *data* layer for a staff member who already holds an org
membership, not a second invite mechanism. "Onboard staff" here means
creating that HR profile for an existing active member.

What exists (don't recreate):
- `supabase/migrations/0014_staff_hr.sql` — all 5 new tables + RLS. Every
  table denormalizes `organization_id`/`branch_id`/`user_id` directly
  (same convention as `attendance_events`/`batches`), so every RLS policy
  reads `has_perm_branch(perm, branch_id)` inline with no join back through
  `staff_profiles` — `has_perm_branch` alone covers both org-wide (Owner/
  Org Admin) and branch-scoped (Branch Admin) callers uniformly, since an
  org-wide caller's own membership has `branch_id is null`, matching any
  target branch. Two permission keys added beyond the Doc 04 §4 catalogue
  (`hr.staff.read` → Branch Admin, `hr.payout_settings.read` → Accountant),
  same "add a narrower key, documented" precedent as `finance.payout.read`/
  `people.join_request.read`. Self-service (`🔷 self` in the access matrix)
  is `user_id = current_user_id()` identity-right policies, not a granted
  permission — leave-request withdrawal is delete-while-pending, not an
  update, avoiding an OLD-vs-NEW status trigger (Doc 07 §17 pattern from
  migration 0009) since "pending" is the only self-mutable state.
  **Real, pre-existing RLS gap found and fixed while building the staff
  directory, not a regression**: migration 0003's own header says "no
  org-staff read paths yet (those arrive with memberships in Phase 3)" for
  the `users` table, but no phase since ever added one — `tenancy-rbac`'s
  `listMembers()` (Phase 3) quietly works around it by never joining
  `users` at all (returns bare `user_id`, no `display_name`). Nothing
  needed a co-member's actual name badly enough to hit the gap until this
  phase's onboarding picker, which showed only the caller themself instead
  of every onboardable member. Fixed with a new `users_select_org_staff`
  policy scoped to exactly the visibility `people.member.read` already
  grants elsewhere (mirrors `memberships_select_staff`, migration 0006) —
  no broader exposure than an admin already gets from the members list.
  **Any future feature that needs to display a co-member's name should
  check this policy exists first, not assume `users` is readable.**
- `packages/modules/staff-hr/src/service.ts` — full implementation: staff
  profiles (`onboardStaff`/`listStaffProfiles`/`getMyStaffProfile`/
  `listOnboardableMembers`/`updateStaffProfile`/`offboardStaff`), documents
  (`uploadStaffDocument`/`listStaffDocuments`/`reviewStaffDocument`/
  `deleteStaffDocument`), availability (`listAvailability`/
  `setAvailability` — delete+insert bulk rewrite in one `withRequestContext`
  transaction, same pattern Doc 02 §9 provisioning already established),
  leave requests (`requestLeave`/`listLeaveRequests`/`listMyLeaveRequests`/
  `cancelLeaveRequest`/`decideLeaveRequest`), and payout settings
  (`getPayoutSettings`/`getMyPayoutSettings`/`setPayoutSettings`, upsert via
  `ON CONFLICT`). RLS is the real gate throughout (no service-role calls in
  this module) — UPDATE/DELETE denials surface as `rowCount === 0`
  (`NotAuthorizedError`), INSERT denials throw Postgres 42501 for the
  route's `isRlsDenied()`. `writeAuditLog()` called on the privileged
  decision points only (onboard, document review, leave decide, payout
  set) — same selective-audit precedent Phase 5/11 established, not every
  write.
- `staff_documents.storage_path` is a plain text reference, not a real
  upload pipeline — no module in this repo has built actual file upload yet
  (Finance's `payments.proof_path`, migration 0011, set this precedent);
  building a signed-URL/ClamAV pipeline here would be scope creep beyond
  "Core" (Doc 00 M10 row). Document review does NOT gate `membership_roles`
  activation — Doc 04 §8 says roles "activate on acceptance + any
  org-required document verification", but wiring a hold on RBAC's existing
  accept-invitation path is a real cross-module coupling change, deferred
  and tracked here rather than silently half-built.
- Routes (all new): `GET/POST /api/v1/orgs/{id}/staff` +
  `GET .../staff/onboardable` + `PATCH .../staff/{staffId}` +
  `GET/POST .../staff/{staffId}/documents` +
  `PATCH/DELETE .../documents/{docId}` +
  `GET .../staff/{staffId}/availability` +
  `GET/PUT .../staff/{staffId}/payout-settings`,
  `GET /api/v1/orgs/{id}/leave-requests` + `PATCH .../leave-requests/{leaveId}`,
  and self-service `GET /api/v1/me/staff-profile` +
  `GET/POST/DELETE /api/v1/me/staff/documents[/{docId}]` +
  `GET/PUT /api/v1/me/staff/availability` +
  `GET/POST/DELETE /api/v1/me/staff/leave-requests[/{leaveId}]` +
  `GET /api/v1/me/staff/payout-settings`.
- `apps/web/src/app/staff/page.tsx` — org staff console (directory with an
  "Onboard staff" picker sourced from `listOnboardableMembers`, an
  expandable per-staff row showing documents/availability/pay settings,
  and a Leave requests tab with status-filtered approve/reject), same
  plain-fetch client component style as `/finance`/`/people`.
- `apps/web/src/app/me/staff/page.tsx` — self-service ("My HR": own
  availability editor, leave request/withdraw, document upload/withdraw,
  read-only pay settings), same standalone-settings-page shape as
  `/me/notifications`/`/me/referrals`. Renders a "no staff profile" empty
  state for any user without one in their active org.
- `apps/web/src/components/AppShell.tsx` — new nav entries: "Staff HR"
  under Manage (org staff), "My HR" under Me (self-service) — this phase
  also happened to fix an unrelated nav bug reported mid-session (Platform
  console had its own bolted-on second sidebar instead of living in the
  global nav; now an expandable "Administration" group with query-param
  sub-items, same collapsible pattern as V1's `admin/layout.tsx` Reports
  menu).

**Verified live in-browser** (no automated smoke-test script this phase —
manual browser + direct-API verification instead, both exercising the same
route/service/RLS code paths): created a fresh academy org, invited a
second identity with the Coach role, accepted the invite, confirmed the
onboarding picker showed both members (post-RLS-fix) not just the caller,
onboarded the coach with a designation, set their payout settings (INR
50,000 salary) from the admin console, confirmed `/me/staff` rendered the
correct profile/pay info as that coach, submitted a leave request as the
coach, and approved it as the owner — end state (`status: 'approved'`,
`decidedBy`, `decisionNote`) confirmed via a direct API read after the UI
action. `npm run db:reset` (14 migrations apply clean) and
`npm run db:check-rls` (60 tables, 1 allow-listed) both pass; `tsc --noEmit`
clean across the new module, all new routes, and both new UI pages.

**Known gaps / not built (deliberately, in scope for later phases):**
- No document upload pipeline (see above) — `storage_path` is a manually
  entered reference/link, not a file picker.
- Document review doesn't gate role activation — `staff_documents.review_status`
  exists as data; nothing currently reads it to hold back a coach's granted
  role until KYC clears.
- No dashboards/reporting anywhere in the app yet (a user question raised
  this session, unrelated to this phase's scope) — the Doc 01 PRD's
  role-specific summary views (US-2's per-child guardian cards, US-6's
  org-dashboard branch aggregation, coach "today's batches"/student "my
  schedule" home screens from Doc 05 §7's post-login routing) were never a
  standalone phase in the 17-phase roadmap; each module shipped its
  management/CRUD screens only. Not assigned to a phase — raise with the
  user before assuming Progress (Phase 13) or any other phase owns this.

## Next: Phase 13 — Progress

## How to resume without re-reading everything

- Don't re-read all of `docsV2/` — this file plus the Phase 9 doc pointers above should be
  enough to start.
- Don't re-derive the gap analysis or ask the scope-change questions again — they're
  answered above (see "User-approved scope changes").
- Do check `git status`/`git diff` against this file's "what exists" list before assuming
  something isn't built — this file is a snapshot, code is ground truth if they disagree.
- RBAC (org-scope) is schema-complete as of Phase 4; platform-scope RBAC
  (`has_platform_perm()`) is schema-complete as of Phase 5. Guardianship-aware RLS
  (`is_guardian_of`/`has_consent_authority`/`is_my_ward`) is schema-complete as of Phase 6 —
  reuse these three functions for any ward-facing read in Attendance/Progress rather than
  inventing a parallel guardian check. `my_batch_ids()` ("own batches") is schema-complete
  since Phase 4 and gained its first real consumer (`listMyBatches`) in Phase 7 — reuse it for
  any coach-scoped read/write in Attendance rather than inventing a parallel check.
- If a new table's RLS policy needs to read a DIFFERENT RLS-enabled table (not just call an
  existing `SECURITY DEFINER` helper), do that through a new `SECURITY DEFINER` function, not
  an inline `EXISTS` subquery — Phase 7 hit a genuine "infinite recursion detected in policy"
  error from two tables' policies (`batches`/`batch_enrollments`) reading each other directly.
  One-directional cross-table reads (A reads B, B doesn't read A back) are fine inline, same as
  `branches_select_member` (Phase 3) reading `memberships` has always been.
- The cross-tab-shared-cookie-jar behavior noted in Phase 5's verification section applies to
  ANY future multi-identity browser testing in this environment, not just Platform Admin —
  sign out (or use separate browser profiles) between identities, don't assume two open tabs
  are two independent sessions.
- `SECURITY DEFINER` matters for trigger functions too, not just RLS-policy helper functions —
  Phase 8 hit a real bug where a BEFORE INSERT trigger's own internal `SELECT`s got silently
  RLS-filtered by the *inserting caller's* session rather than seeing the full table, because
  the trigger function was plain `plpgsql` instead of `SECURITY DEFINER`. Any future trigger
  that reads a table gated by someone else's RLS (not just the row being inserted/updated) needs
  the same treatment as `has_perm()`/`is_guardian_of()`/`is_batch_participant()`.
- This environment's Browser pane sandbox blocks `getUserMedia` — any future feature needing
  live camera capture (this phase's face-scan UI, a future QR/barcode scanner, etc.) can only be
  verified up to "the model/library loads and the permission-denied state renders correctly,"
  not an actual captured-frame round trip. Don't mistake that limitation for a code bug.
- `date`-typed columns now come back from `pg` as plain `YYYY-MM-DD` strings, not JS `Date`
  objects (`packages/platform/src/db/pool.ts`, Phase 6) — don't reintroduce a per-query
  `::text` cast workaround for this, the platform-wide parser override already handles it.
- **`apps/worker/src/registry.ts`'s `JOB_HANDLERS` maps a job kind to an ARRAY of handlers, not
  one**, since Phase 10 — a single queue event (`attendance.absence_confirmed`) can have more
  than one independent module consumer (Finance, Notifications). If a future phase adds another
  consumer of an existing event, append to that kind's array rather than assuming one handler
  per kind; every handler in the array must be independently idempotent since a retry re-runs
  all of them, not just the one that failed.
- **Self-only RLS (`user_id = current_user_id()`) silently blocks a STAFF caller from reading
  someone else's row it legitimately needs to check** (not just "the recipient's own data") —
  Phase 10 hit this for real: `sendManualNotification`'s muting-floor check ran inside the
  staff caller's own `withRequestContext` session, so the SELECT against the *recipient's*
  `notification_preferences` row (self-only RLS) silently returned zero rows every time,
  and a muted recipient kept getting notified. The fix was a service-role read for just that
  lookup, not a new RLS policy (preferences have no org/staff dimension to scope a policy to
  in the first place). Any future "check someone else's self-scoped setting before acting on
  their behalf" code path should default to a service-role read for that specific lookup,
  not assume the caller's own RLS session can see it.
- `web-push`/VAPID is this project's answer for a real, verifiable push channel with no vendor
  account (`packages/platform/src/notify/channels/push.ts`) — reuse this pattern (self-generated
  keypair, no paid vendor dependency) before reaching for FCM/APNs if a future phase needs
  another vendor-gated capability and a self-hosted alternative exists.
- **A cross-actor UPDATE RLS policy needs matching SELECT policies for BOTH the pre- and
  post-update row shapes, or it silently breaks** — Phase 11 hit this for real (twice) building
  referral attribution: Postgres ANDs an applicable table SELECT policy onto UPDATE row
  visibility *in addition to* the UPDATE policy's own USING (confirmed via `EXPLAIN`), and
  separately ANDs a SELECT policy onto the WITH CHECK validation of the *new* row too. A
  self-scoped SELECT policy (`referrer_user_id = current_user_id()`) alone made
  `attributeReferral()` structurally impossible for the party actually attributing someone
  else's code — first silently affecting zero rows (old-row case), then a real 42501 once the
  first gap was patched (new-row case). Needed two additional narrow SELECT policies, one for
  each row shape. Any future table with a self-scoped SELECT policy AND a cross-actor UPDATE
  policy (anywhere a different user than the row's own "owner" needs to legitimately update it)
  should budget for this from the start, not discover it via a live 42501.
- This app has no literal Postgres `anon` role — genuinely anonymous public reads/writes
  (Marketplace's `/explore`, `/public/leads`) go through `getServiceClient()` with an explicit
  status filter in the query text, the same pattern `resolveOrgBySlug` (Phase 3) already
  established, not RLS policies scoped `to anon`. Doc 07's occasional "RLS for the anon role"
  phrasing describes the literal PostgREST/Supabase-native shape, not how this app's own
  Next.js API layer actually authenticates unauthenticated requests.
- **`users` has no org-staff SELECT policy for reading a co-member's `display_name`** — flagged
  as deferred in migration 0003's own header ("arrives with memberships in Phase 3") but never
  actually added by any phase since; `tenancy-rbac.listMembers()` (Phase 3) silently works
  around it by never joining `users`. Phase 12 added `users_select_org_staff` (migration 0014,
  scoped to exactly `people.member.read`'s existing visibility) because its onboarding picker
  was the first feature to actually need a co-member's name. Before joining `users` from any
  future org-scoped query, confirm this policy still covers your case rather than assuming
  `users` is generally readable — it's still self-only plus this one staff carve-out plus
  guardian-of-ward (Phase 6), not a blanket org-visibility grant.
- `has_perm_branch(perm, branch_id)` alone is sufficient to gate BOTH an org-wide role (Owner/
  Org Admin, whose own membership has `branch_id is null`) and a branch-scoped role (Branch
  Admin) on the same policy, with no separate `has_perm()` check needed — Phase 12 used this
  uniformly across `staff_profiles`/`staff_documents`/`staff_availability`/`leave_requests`/
  `payout_settings` instead of writing two policies per table. Reach for this pattern before
  duplicating an org-wide and a branch-scoped policy separately.
- This Browser pane's tabs share one cookie jar (Phase 5's note) makes multi-identity testing
  slow enough that direct `fetch()` calls via the JS console (magic-link start, org create,
  invitation create/accept, workspace switch) are faster and more reliable than clicking through
  onboarding UI every time a new test identity is needed — Phase 12 used this to set up two
  full org+staff test fixtures in one session. Keep the UI clicks for what you're actually
  verifying, not for routine test-data setup.
