# Frontend Agent Guide

Scope: `apps/web/src/app/**`, `apps/web/src/components/**`, `apps/web/src/lib/**` (client helpers), `apps/mobile/**`. Full reference: [`../docs/ui-guidelines.md`](../docs/ui-guidelines.md).

## Web (`apps/web`) — where the real UI is

- **No component primitives library.** There's no `Button`/`Card`/`Modal`/`Table` to import — style with the existing utility classes (`.glass-panel`, `.glass-input`, `.btn-premium`, `.btn-secondary`, `.glow-*`) plus Tailwind directly, matching whatever the nearest existing page/component does. Don't invent a new primitives layer unless asked.
- **Never hardcode colors.** Use the CSS custom properties defined in `apps/web/src/app/globals.css` (`--primary`, `--success`, `--panel-bg`, etc.) or existing Tailwind utility classes already used elsewhere in the app. If you need a color that has no token, add the token (and its `[data-mode="light"]` override) to `globals.css` rather than hardcoding a hex or inventing a Tailwind class like `text-slate-450`.
- **No form library.** Controlled inputs via `useState`, one per field. For multi-step flows, follow `CoachOnboardingWizard.tsx`'s shape: numeric `step` state, per-step `useState` fields grouped with comment headers, `isStepNValid` booleans gating navigation, sub-steps extracted into their own presentational components.
- **Data fetching is client-side.** Pages/layouts are `'use client'` components fetching in `useEffect` via the Supabase browser client or `fetch('/api/v1/...')`. Don't introduce Server Component data fetching or a query library (SWR/React Query) without flagging it — it'd be a new pattern, not a continuation of an existing one.
- **Icons**: `lucide-react` only, named imports of individual icons.
- **Role gating**: no shared `useAuth` hook exists — each role-section layout (e.g. `admin/layout.tsx`) independently fetches the user + `users` row (with joined `roles.role_permissions`) and gates via `hasPermission(module, action)` (a client-side reimplementation, kept manually in sync with the server-side one in `lib/api.ts`). Follow this per-layout pattern for a new role section rather than assuming a shared hook.
- **Theming**: custom `ThemeProvider`/`useTheme` (`apps/web/src/lib/theme.tsx`), not `next-themes`. Don't touch the anti-flash `<script>` in `layout.tsx` casually — it prevents a flash of the wrong theme on load.

### QA checklist — run through this before calling frontend work done (binding project rule)

- Both mobile and desktop layouts render correctly.
- Both dark and light themes look correct (contrast, borders, backgrounds).
- Role-based visibility is correct for Super Admin, Admin, Coach, and Student.
- Loading, empty, and error states are all handled, not just the happy path.
- Any user preference introduced actually persists (localStorage/DB as appropriate).
- Proactively call out any regression you notice elsewhere, even if unrelated to your change.

## Mobile (`apps/mobile`) — effectively empty, be honest about this

As of this writing, `apps/mobile` is an **unmodified Expo template** — `App.tsx`/`index.ts` are the stock `create-expo-app` output. There is no navigation library installed (no React Navigation, no Expo Router), no `lib/supabase.ts`, no screens, no camera/face-detection code, despite `expo-camera`, `expo-av`, `@supabase/supabase-js`, `@abhyas/database`, and `@abhyas/common` already being listed as dependencies (staged intent, not built).

If asked to build mobile screens:

1. **Don't trust `docs/directory_structure.md`'s mobile section** — it's an aspirational plan from an earlier phase, not current state. Verify what exists on disk first.
2. **A navigation library decision hasn't been made.** Surface this rather than silently picking one — React Navigation is the conventional default for a bare Expo app (no Expo Router installed), but confirm before committing the app to it.
3. **Reuse `@abhyas/common`** for Zod schemas/types shared with the web app's API contracts — don't redefine request/response shapes.
4. **Session persistence** will need `expo-secure-store` or `AsyncStorage` wired into the Supabase client (`@supabase/supabase-js` `createClient(..., { auth: { storage } })`) — this doesn't exist yet in `packages/database`, so it likely needs a mobile-specific client, not a blind reuse of the web one.
