# UI Guidelines

Scope: `apps/web` (Next.js 16, React 19, App Router, Tailwind CSS v4). `apps/mobile` has no UI built yet — see [`agents/frontend.md`](../agents/frontend.md).

## Design tokens & theming

All visual tokens are plain CSS custom properties defined in `apps/web/src/app/globals.css`, not Tailwind theme extension — there is **no `tailwind.config.ts`**; Tailwind v4 is wired up purely via `@import "tailwindcss";` + `postcss.config.mjs`. Groups of tokens:

- **Canvas**: `--background`, `--foreground`, `--foreground-muted`, `--foreground-subtle`
- **Glass/panel**: `--panel-bg`, `--glass-bg`, `--glass-input-bg`/`--glass-input-border`, `--track-bg`
- **Overlays**: `--overlay-xs/sm/md`, `--overlay-border(-md)`
- **Brand**: `--primary`, `--primary-glow`, `--primary-hover`, `--accent`, `--accent-glow`
- **Semantic**: `--success`/`--warning`/`--danger` + `-glow` variants
- **Effects**: `--glow-primary`, `--scroll-thumb(-hover)`, `--radial-a/b`

The app is **dark-first**: `:root` defines the dark palette, and `[data-mode="light"]` overrides it — including a large block that remaps raw Tailwind color utilities (`text-slate-400`, `bg-indigo-500/20`, etc.) for light mode, because those literal classes are used directly in components rather than semantic token classes everywhere.

**Rule (from `.cursorrules`/`.clinerules`, binding project-wide):** always use the existing design tokens/CSS variables — never hardcode color hexes, inline colors, or invented Tailwind classes (e.g. `text-slate-450`). If a new color need doesn't map to an existing token, add the token to `globals.css` (and its light-mode override) rather than hardcoding.

Theming is driven by a custom `ThemeProvider`/`useTheme` (`apps/web/src/lib/theme.tsx`) — not `next-themes`. It supports 6 named color themes plus a `mode: 'dark' | 'light'` toggle, persisted to `localStorage` (`upasthiti-theme`, `upasthiti-mode`), applied imperatively via `document.documentElement` custom properties + `data-theme`/`data-mode` attributes. `layout.tsx` includes an inline anti-flash `<script>` that applies the saved mode before hydration — preserve this if touching root layout.

Reusable utility classes worth knowing: `.glass-panel`, `.glass-panel-hover`, `.glass-input`, `.glow-border`/`.glow-indigo`/`.glow-emerald`/`.glow-text-indigo`, `.btn-premium` (gradient CTA), `.btn-secondary`, `.radial-mesh-bg` (animated backdrop), `.no-scrollbar`, `.safe-top`/`.safe-bottom`.

## Component conventions

There's no `components/ui/` primitives library (no shared Button/Card/Input/Modal/Table/Badge) — styling is applied via the utility classes above plus raw Tailwind directly in each component/page. Components live in:

- `apps/web/src/components/` — cross-cutting feature components (`CategoryPicker.tsx`, `CoachOnboardingWizard.tsx`, `ServiceAreaPicker.tsx`, `LocalityAutocompleteInput.tsx`, etc.)
- `apps/web/src/app/admin/components/` — admin-shell-scoped components (`CustomSelect.tsx`, `IndiaMap.tsx`, `ThemeSelector.tsx`)

Pattern for a new bespoke component: `'use client'`, default-exported function component, typed props interface, conditional classes via template literals (not `clsx`/`cva`, even though `clsx` is a dependency — check whether the surrounding file already uses it before introducing it). No `forwardRef` usage seen; only add it if the component genuinely needs ref forwarding.

## Page structure

Under `apps/web/src/app/`: `admin/` (dashboard, coaches, students, batches, classes, attendance incl. `attendance/group-scan`, fines, leaves incl. `leaves/approvals`, announcements, `governance/{audit-logs,roles,users}`, reports, settings, superadmin, enroll-face, profile), `student/` (dashboard, reports), `auth/` (login, register, reset-password, callback), `coaches/[slug]` (public profile), `explore/` (coaches, academies — public marketplace), `api/v1/` (route handlers). These are plain nested folders acting as role-based sections, not parenthesized route groups. `admin/layout.tsx` is a single shared client-component shell (sidebar/topbar) wrapping all `/admin/*` pages — mirror this pattern (one shared layout per role section) if adding a new top-level section.

## Data fetching

Pages and layouts are **Client Components** (`'use client'`) that fetch in `useEffect`, using either the Supabase browser client directly or `fetch()` against `/api/v1/*`. There is no Server Component data-fetching pattern in use today and no SWR/React Query — don't introduce one without discussing it first, since it'd be a new pattern. Mutations are plain `fetch(url, { method, headers, body: JSON.stringify(...) })` calls. Small custom hooks (e.g. `useCategoryTaxonomy.ts`, `useServiceAreas.ts` in `apps/web/src/lib/`) wrap fetch+state for reusable, feature-specific data — follow this shape for new shared fetches rather than duplicating `useEffect` fetch logic across pages.

## Forms

No form library (no `react-hook-form`). Forms use plain controlled inputs — one `useState` per field. Multi-step forms (the canonical example is `CoachOnboardingWizard.tsx`) use numeric `step`/`maxStepReached` state, one `useState` per field grouped by step with `// --- Step N: ... ---` comment headers, a per-step `isStepNValid` boolean gating Next/Back, and sub-steps extracted into presentational components (e.g. `PaymentPricingStep.tsx`, `CategoryPicker.tsx`, `ServiceAreaPicker.tsx`) that co-locate their own `createDefault...Selection`/`is...Valid` helpers. Follow this shape for new wizards rather than introducing a schema-driven form library.

Client-side validation is hand-rolled boolean checks, not Zod — Zod (`packages/common/src/schemas.ts`) is used **server-side only**, in API route handlers. If you want shared validation logic between client and server, that's currently unestablished; discuss before introducing a new pattern rather than silently diverging per-component.

## Icons

`lucide-react`, always via named imports of individual icons (`import { ChevronDown, Check } from 'lucide-react'`). No other icon set.

## Role-based rendering

No shared `useAuth`/`useUser` hook exists yet — each top-level layout (`admin/layout.tsx`, presumably a `student/layout.tsx` equivalent) independently fetches the Supabase user + `users` row (including joined `roles.role_permissions`) into local `profile` state, then gates:

```ts
if (!['admin', 'superadmin', 'coach'].includes(userProfile.role)) router.push('/student/dashboard');
```

Fine-grained checks read `profile.roles.role_permissions` via a local `hasPermission(module, action)` helper (mirrors the server-side one in `lib/api.ts`, but is a separate client-side implementation — keep both in sync manually if permission logic changes). Users with more than one role see a role switcher (`profile.available_roles.length > 1`).

If you're adding a new role-gated page, follow the existing per-layout fetch+check pattern rather than assuming a shared hook exists.

## QA checklist (binding — `.cursorrules`/`.clinerules`)

After any UI change, verify:

- Both mobile and desktop layouts.
- Both dark and light themes (text contrast, border alignment, background harmony).
- Role-based visibility across Super Admin, Admin, Coach, and Student.
- Loading, empty, and error states for every component/page touched.
- User preferences persist correctly.
- Proactively report any UI or functional regressions before considering the task done.
