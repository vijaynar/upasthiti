# API Guidelines

REST-style endpoints under `apps/web/src/app/api/v1/`, implemented as Next.js App Router Route Handlers (`route.ts` exporting `GET`/`POST`/`PUT`/etc.). There is no separate backend service — the API layer lives inside the Next.js app.

## Route inventory

Resource directories under `api/v1/`:

- `auth/` — `me`, `register`, `resolve-identifier`, `session`, `signup`
- `students/` — root CRUD, `enroll-face`, `join-request` (+ `[id]`), `remove`
- `coaches/` — root CRUD, `assignments`, `availability`, `documents`, `payroll`
- `batches/`, `classes/`, `attendance/` (+ `match-face`, `match-group`), `fines/`, `settings/`
- `governance/` — `audit-logs`, `roles`, `users` (RBAC administration)
- `public/` — `categories`, `coaches`, `service-areas`, `service-communities` (unauthenticated storefront endpoints)
- `superadmin/`, `users/switch-role/`

No API versioning beyond `v1`, no OpenAPI/spec files. New resources follow this same flat `api/v1/<resource>/route.ts` (+ nested sub-actions as subdirectories) shape.

## Auth pattern

There is **no `middleware.ts`** anywhere in `apps/web` — auth is enforced per-route, not centrally. Every authenticated route starts with:

```ts
const ctx = await getAuthContext();
if (!ctx) return err('Unauthorised', 401);
if (!hasRole(ctx, 'admin', 'superadmin', 'coach')) return err('Forbidden', 403);
```

`getAuthContext()` (`apps/web/src/lib/api.ts`) creates an `@supabase/ssr` server client bound to Next's `cookies()` to call `supabase.auth.getUser()`, then looks up `role`/`tenant_id`/`email` from `public.users` using the **admin (service-role) client**, falling back to the JWT's `app_metadata` if the DB row isn't populated yet (onboarding edge case). It returns `AuthContext { userId, tenantId, role, email }` or `null`.

All data access inside routes then goes through `adminDb()` — a service-role client that **bypasses RLS**. This is the dominant, expected pattern; don't reach for the anon/browser client inside a route handler.

## Authorization

Two RBAC styles coexist — use the one that matches the resource:

- **`hasRole(ctx, ...roles)`** — coarse static role-string membership check. Used by nearly all CRUD routes (students, coaches, batches, attendance, fines).
- **`hasPermission(ctx, module, action)`** — async, DB-backed fine-grained check (`users → roles → role_permissions → permissions`). `superadmin` always passes; everyone else needs a matching `(module, action)` row. Used exclusively by `governance/*` and `settings` routes. Prefer this for new admin-configuration surfaces; use `hasRole` for straightforward operational CRUD.

Coach `account_status` (`Onboarding` → `Active`/`Inactive`/etc.) gates the coach *activation workflow* specifically (`PUT` with `action=approve|reactivate|deactivate` on `coaches/route.ts`), not general request auth — other routes don't consult it. Don't assume `account_status` blocks a coach from hitting unrelated endpoints unless you've checked.

## Request / response shape

Use the shared helpers from `apps/web/src/lib/api.ts`:

```ts
ok(data, status = 200)       // { success: true, data }
created(data)                 // ok(data, 201)
err(message, status = 400, code?)  // { success: false, error: message, code? }
```

Wrap the handler body in `try/catch` and return `err(message, 500)` on unexpected failure — every existing route follows this shape; match it for consistency.

**Validation**: prefer a Zod schema from `@abhyas/common` (`packages/common/src/schemas.ts`) — schema + `z.infer` type pairs already exist for most resources (`CreateStudentSchema`, `ManualAttendanceSchema`, `FaceEnrollSchema`, etc.):

```ts
const parsed = CreateStudentSchema.safeParse(body);
if (!parsed.success) return err(parsed.error.errors[0].message, 422);
```

Not every existing route does this — some fall back to manual `if (!field) return err(...)` checks on an untyped body. That's legacy inconsistency, not the target pattern: **new routes should validate with a Zod schema**, adding one to `packages/common/src/schemas.ts` if it doesn't exist yet, so both web and (future) mobile can reuse it.

## Multi-tenancy

Because routes use the service-role client, RLS does not protect them — **you must manually scope every query**:

```ts
if (ctx.role !== 'superadmin') query = query.eq('tenant_id', ctx.tenantId);
```

Apply this to every list/read/write query in a new route unless the table is intentionally platform-wide (taxonomy, service areas, roles). See [`database.md`](./database.md#multi-tenancy) for the full model.

## Audit logging

`logAuditEvent(tenantId, userId, action, description, ipAddress?)` (`apps/web/src/lib/api.ts`) inserts into `audit_logs` via `adminDb()` and swallows its own errors — it must never crash the calling operation. Currently only `governance/*` and `superadmin/*` routes call it. When adding or modifying a route that performs a significant mutation (create/edit/delete of users, roles, coach approval, financial records), add an audit log call — most existing CRUD routes (students, coaches, attendance) skip this today, which is a gap, not a pattern to replicate for new sensitive operations.

## Shared package usage (`@abhyas/common`)

- `constants.ts` — `as const` string-union arrays (`USER_ROLES`, `ATTENDANCE_STATUSES`, `FINE_STATUSES`, `STUDENT_STATUSES`) plus numeric config (`FACE_MATCH_THRESHOLD_CONFIDENT`, fine amounts). Treat as the intended source of truth, but verify against the DB CHECK constraint in `supabase/migrations/` before relying on it — it has drifted before (e.g. missing `coach` in a role list).
- `types.ts` — hand-written camelCase domain interfaces mirroring DB rows, for UI consumption.
- `schemas.ts` — Zod validation schemas + inferred types, one per resource/action. This is what route handlers should validate against.

Both web and mobile import this package as `@abhyas/common`; keep additions here framework-agnostic (no Next.js- or React-Native-specific code).

## Mobile

`apps/mobile` has no API client code yet (see [`agents/frontend.md`](../agents/frontend.md)) — there's no established mobile fetch pattern to follow. When building it, reuse `@abhyas/common` Zod schemas/types for request/response shapes rather than redefining them, and target the same `/api/v1/*` endpoints the web app uses.
