# Testing Agent Guide

## Current state: no testing infrastructure exists

Be direct about this rather than assuming otherwise. Across the entire repo (root, `apps/web`, `apps/mobile`, `packages/common`, `packages/database`):

- No test framework is installed — no Jest, Vitest, Playwright, or Testing Library in any `package.json`.
- No `*.test.ts(x)` / `*.spec.ts` files, no `__tests__` directories.
- No `test` script anywhere.
- No CI (`.github/workflows/`) and no git hooks (`.husky/`) that would run tests even if they existed.
- No ESLint config either (the `apps/web` `lint` script exists but has no `eslint`/`eslint-config-next` dependency installed, so it isn't actually functional).

The only automated correctness check currently available is TypeScript compilation:

```bash
npm run type-check          # turbo run type-check across all packages/apps
npx tsc --noEmit            # from a specific package/app directory
```

Treat that as the baseline gate for any change — it's what past feature work (`implementation_plan.md`'s "Verification Plan") has used as the automated check, paired with manual verification.

## What "testing" means in this codebase today

Verification is manual, following the checklist in `.cursorrules`/`.clinerules` and echoed in [`../docs/ui-guidelines.md`](../docs/ui-guidelines.md):

- Layouts (mobile + desktop)
- Themes (dark + light)
- Role-based visibility (Super Admin, Admin, Coach, Student)
- Loading/empty/error states
- Preference persistence
- Regression check across adjacent features

For backend changes, manual verification means actually exercising the route (e.g. via the running dev server + `curl`/browser network tab against `http://localhost:3000/api/v1/...`) against a local Supabase instance (`supabase start`, see [`../docs/SETUP.md`](../docs/SETUP.md)), not just reading the code.

## If asked to add automated tests

This is a real gap worth filling, but it's a decision with monorepo-wide implications (which runner, whether it covers Next.js route handlers vs. React components vs. Supabase-dependent logic, whether mobile needs its own setup) — don't silently wire up a framework as a side effect of an unrelated task. Surface the choice explicitly:

- **Unit/logic tests** (Zod schemas in `packages/common`, pure helpers): Vitest is the lowest-friction choice for a TypeScript monorepo — no JSX/DOM config needed for `packages/common`/`packages/database`.
- **API route tests**: Next.js Route Handlers can be tested by importing and invoking the exported `GET`/`POST` functions directly against a mocked `Request`, or via integration tests against a local Supabase instance. Given routes go through the service-role client and manual tenant filtering (see [`../docs/api-guidelines.md`](../docs/api-guidelines.md)), an integration-style test against a real local DB (via `supabase start`) is more likely to catch real bugs than mocking Supabase entirely.
- **Component/UI tests**: React Testing Library, if/when component behavior (not just visual QA) needs coverage.
- **E2E**: Playwright, if end-to-end flows (login → onboarding → attendance) need regression protection — likely the highest-value addition given how much of this app's correctness lives in multi-step flows and role-based routing.

Whatever is chosen, add it to `turbo.json`'s task graph and this file should be updated to reflect the new reality — don't let this doc go stale once testing exists.
