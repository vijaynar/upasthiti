# Coding Standards

## Monorepo & tooling

Turborepo (npm workspaces: `apps/*`, `packages/*`), Node ≥ 20, npm ≥ 10 (`packageManager: npm@10.9.2`). Root scripts (`package.json`) proxy to `turbo run <task>`: `build`, `dev`, `lint`, `type-check`, `clean`.

`turbo.json` pipeline: `build` depends on upstream package builds (`^build`), caches `.next/**` and `dist/**`; `dev` is uncached/persistent; `lint` and `type-check` depend on `^build`; `clean` is uncached. `globalEnv` declares the Supabase/App/`DATABASE_URL` env vars turbo is aware of.

## TypeScript

Root `tsconfig.base.json` sets full strict mode: `strict`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `exactOptionalPropertyTypes` all `true`, target `ES2022`, `module: ESNext`, `moduleResolution: Bundler`. `packages/common` and `packages/database` extend this directly.

`apps/web/tsconfig.json` is Next.js's own generated config (does **not** extend the base file) but keeps `strict: true`. Path aliases: `@/*` → `apps/web/src/*`, `@abhyas/database` and `@abhyas/common` → their package `src/index.ts`.

`apps/mobile/tsconfig.json` extends `expo/tsconfig.base` with `strict: true`; it consumes `@abhyas/common`/`@abhyas/database` as regular versioned workspace packages (`^0.1.0`), not via `*`/path-alias like web does.

Write new code to satisfy strict mode as configured — don't relax `tsconfig` settings to make an error go away; fix the type instead.

## Linting & formatting — currently unconfigured

Be aware, don't assume otherwise:

- **ESLint**: no config file exists anywhere in the repo. `apps/web/package.json` defines `"lint": "next lint"` but has no `eslint`/`eslint-config-next` devDependency installed, so the script isn't actually wired up. If you need to add linting, that's a real gap to fill, not a broken existing setup to debug.
- **Prettier**: installed as a root devDependency (`^3.4.2`) but has no config file and no script anywhere referencing it. Effectively unused today.
- **No git hooks / CI**: no `.husky/`, no `.github/workflows/`, no pre-commit tooling.

Given this, match the *surrounding file's* style exactly (quote style, semicolons, indentation) rather than assuming a formatter will normalize it later — nothing will.

## Testing — none exists

There is currently **no test framework anywhere in this repo** — no Jest, Vitest, Playwright, or Testing Library; no `*.test.ts(x)`/`*.spec.ts` files; no `__tests__` directories; no `test` script in any `package.json`. Don't assume tests exist for code you're changing, and don't write tests against an imagined runner — check [`agents/testing.md`](../agents/testing.md) before adding a testing setup, since introducing a framework is itself a decision worth surfacing to the user first rather than silently picking one.

The closest thing to automated verification today is `npx tsc --noEmit` (type-check) — treat that as the baseline "does this compile" gate for any change, per the verification plans used in past feature work (e.g. `implementation_plan.md`).

## Naming & structure

- Shared domain logic (types, Zod schemas, enums/constants) belongs in `packages/common/src/` — `types.ts` (interfaces), `schemas.ts` (Zod schema + `z.infer` type pairs), `constants.ts` (`as const` string-union arrays + config values). Both `apps/web` and `apps/mobile` import this as `@abhyas/common`; keep it framework-agnostic.
- Supabase client construction belongs in `packages/database/src/` (browser vs. server/service-role clients) — reuse these rather than instantiating `createClient` ad hoc in a new file. (Note: `apps/web/src/lib/api.ts` and `apps/web/src/lib/supabase.ts` currently duplicate similar client-factory logic — when touching this area, prefer consolidating into `packages/database` over adding a third copy.)
- Database schema changes go in a new numbered file under `supabase/migrations/` (next sequential number after the current highest) — never edit a past migration that's already been applied/consolidated. See [`database.md`](./database.md).
- API routes: `apps/web/src/app/api/v1/<resource>/route.ts`, following the response/validation/RBAC conventions in [`api-guidelines.md`](./api-guidelines.md).
- UI: see [`ui-guidelines.md`](./ui-guidelines.md) for component/styling/theming conventions.

## Environment variables

Defined in `.env.example` at repo root, in four groups:

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (direct Postgres connection, for migrations/admin tooling).
- **App config**: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME`.
- **Google Maps/Places**: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — optional; the Coach Onboarding service-area picker falls back to manual community-name entry when unset. See [`coach_service_areas.md`](./coach_service_areas.md).
- **Expo mobile**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`.
- A commented-out **Deferred** section lists future integrations (Gemini, Twilio, WhatsApp, Resend) — not active, don't wire up code against these without confirming the feature is actually in scope.

Never commit real values — `.env.local` (web) / `.env` (mobile) are gitignored; only `.env.example` is tracked, with placeholders only.

## General project rules (binding — `.clinerules`/`.cursorrules`)

These apply to every code change, not just UI:

- Verify both mobile and desktop layouts.
- Verify both dark and light themes.
- Verify role-based visibility (Super Admin, Admin, Coach, Student).
- Verify loading, empty, and error states.
- Persist user preferences.
- Proactively report regressions before calling a task done.
- Use design tokens/CSS variables from `globals.css` — never hardcode colors or invent non-existent Tailwind classes.
