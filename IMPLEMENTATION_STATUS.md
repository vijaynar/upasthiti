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

## Next: Phase 3 — Multi-Tenancy & Organization Core

Scope (from the roadmap): `organizations`/`branches`/`memberships`/`invitations`/
`join_requests`/`org_branding`/`org_domains` + RLS; workspace switcher; all 4 provisioning
flows (Doc 02 §9); session-context wiring for `current_org()`/`my_branch_scope()` (extends
the helper-function pattern started in migration 0003). Also: add the FK from
`consents.organization_id` → `organizations(id)` once the table exists (noted in migration
0003's comments). Read `docsV2/02_multi_tenancy_identity.md` before starting.

## How to resume without re-reading everything

- Don't re-read all of `docsV2/` — this file plus `docsV2/05_authentication_architecture.md`
  and `docsV2/07_database_design.md` §3 are enough for Phase 2.
- Don't re-derive the gap analysis or ask the scope-change questions again — they're
  answered above.
- Do check `git status`/`git diff` against this file's "what exists" list before assuming
  something isn't built — this file is a snapshot, code is ground truth if they disagree.
