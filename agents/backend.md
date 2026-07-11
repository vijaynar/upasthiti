# Backend Agent Guide

Scope: `apps/web/src/app/api/v1/**`, `apps/web/src/lib/*` (server helpers), `packages/database`, `packages/common`, `supabase/migrations/**`. Full reference: [`../docs/api-guidelines.md`](../docs/api-guidelines.md), [`../docs/database.md`](../docs/database.md).

## Before you start

- There is no `middleware.ts` — auth/authorization is per-route. Don't assume a request reaching a route handler is already authenticated or scoped.
- Routes use a **service-role client** (bypasses RLS). RLS policies in the DB are defense-in-depth for anon/browser access, not the enforcement mechanism for `/api/v1`. You are responsible for tenant scoping in every query you write.
- No test framework exists. `npx tsc --noEmit` is the only automated check — run it before considering backend work done.

## Checklist for a new or modified route

1. **Auth**: `const ctx = await getAuthContext(); if (!ctx) return err('Unauthorised', 401);`
2. **Authorization**: `hasRole(ctx, ...)` for coarse CRUD access; `await hasPermission(ctx, module, action)` for admin-configuration surfaces (governance-style). Pick based on what the resource resembles — don't default to `hasRole` for something that should be permission-gated (e.g. anything under a future `governance/`-style admin config surface).
3. **Tenant scoping**: `if (ctx.role !== 'superadmin') query = query.eq('tenant_id', ctx.tenantId)` on every read/write against a tenant-scoped table. Skip only for genuinely platform-wide tables (taxonomy, service areas, roles) — check [`database.md`](../docs/database.md#multi-tenancy) if unsure whether a table is tenant-scoped.
4. **Validation**: validate the request body with a Zod schema from `packages/common/src/schemas.ts`. If one doesn't exist for this shape yet, add it there (not inline in the route) so mobile can reuse it later.
5. **Response shape**: use `ok()`/`created()`/`err()` from `apps/web/src/lib/api.ts` — don't hand-roll `NextResponse.json(...)`.
6. **Error handling**: wrap the handler body in `try/catch`, return `err(message, 500)` on unexpected failure.
7. **Audit logging**: if the route performs a significant mutation (create/edit/delete of users, roles, coach approval/status change, financial records), call `logAuditEvent(...)`. Most existing student/coach/attendance CRUD routes skip this — that's a known gap, not something to copy for new sensitive operations.
8. **Migrations**: schema changes go in a new sequential file under `supabase/migrations/`, never editing an already-applied one. Add the corresponding RLS policy alongside the table, even though the API layer bypasses it — other consumers (browser client, future direct queries) rely on it.

## Common pitfalls in this codebase (don't propagate them)

- Some existing routes skip Zod and do manual `if (!field)` checks on an untyped body — don't copy this for new code, even if the file you're editing already does it. Prefer fixing it if you're touching that route anyway (small, low-risk).
- `packages/common/src/constants.ts` role/status lists have drifted from the DB CHECK constraints before. Cross-check against `supabase/migrations/` before trusting a constant list wholesale.
- `apps/web/src/lib/api.ts` and `apps/web/src/lib/supabase.ts` both define Supabase client factories — know which one a given route uses (`api.ts`'s `adminDb()`/`getAuthContext()` is the one actually used in route handlers) and don't introduce a third variant.
- `coaches.account_status` only gates the coach-activation workflow itself — it's not a general request-auth gate. Don't assume other coach routes already check it.

## When something doesn't fit the pattern

If a new feature genuinely needs a different auth model, response shape, or tenancy exception than what's described here, say so explicitly and ask rather than silently inventing a third convention — this codebase already has some drift between routes (Zod vs. manual validation, `hasRole` vs. `hasPermission`) and it's better not to add a third variant.
