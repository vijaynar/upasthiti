# Abhyas — Developer Setup Guide

> Smart academy management + public coach/academy Discovery marketplace. Monorepo using **Turborepo + Next.js + Expo React Native + Supabase**.

---

## Environments

| Environment | Supabase | Where credentials live |
|---|---|---|
| **Development** | Local, running in Docker via Supabase CLI | `.env.development.local` (repo root, gitignored) |
| **Staging** | Hosted Supabase project (pre-production validation) | `.env.staging.local` (repo root, gitignored) |
| **Production** | Hosted Supabase project | `.env.production.local` (repo root, gitignored) — real deploys use the hosting platform's own env var config (Vercel/EAS dashboards), not this file |

Development, staging, and production are fully isolated. **Never** put staging/production credentials in `.env.development.local`, and never commit any of the three env files — all are gitignored.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20.0 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 10.0 | Bundled with Node |
| Docker Desktop | Latest | [docker.com/desktop](https://www.docker.com/products/docker-desktop/) |
| Supabase CLI | Latest | `npm install -g supabase` |
| Expo CLI (optional) | Latest | `npm install -g expo-cli` |

On Windows, Docker Desktop requires WSL2. If `docker` isn't recognized or Docker Desktop won't start:
```powershell
wsl --install --no-distribution   # run in an elevated PowerShell, then restart your PC
```

---

## First-Time Setup

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd Abhyas
npm install
```

### 2. Configure Environment Variables

There is **one** env template at the repo root. Create your local dev file from it:

```bash
cp .env.example .env.development.local
```

Leave the Supabase URL/keys as placeholders for now — you'll fill them in after starting Supabase (Step 3). If you need to run against the hosted project (staging/prod work), also create:

```bash
cp .env.example .env.production.local
```

and fill it in with the real hosted project's credentials (ask a teammate — never invent or reuse someone else's).

Both `apps/web` and `apps/mobile` read these two root files automatically via `dotenv-cli` in their `dev`/`start` scripts — there is no per-app `.env` file to maintain.

### 3. Start Local Supabase (Docker)

```bash
npm run supabase:start
```

First run pulls Docker images and can take a few minutes. Once running, it prints local credentials:

```
API URL:     http://127.0.0.1:54321
anon key:    eyJ...
service_role key: eyJ...
```

You can reprint these anytime with:

```bash
npm run supabase:status
```

Copy the `anon key` and `service_role key` into `.env.development.local`.

### 4. Apply Database Migrations

```bash
npm run supabase:reset
```

This recreates the local database from scratch by replaying every file in `supabase/migrations/` in order — extensions, schema, indexes, functions/triggers, RLS/storage policies, and seed reference data. Safe to run anytime you want a clean slate.

### 5. Generate TypeScript Types

```bash
npm run supabase:types
```

Regenerates `packages/database/src/types.ts` from the local schema. **Run this after every migration change.**

### 6. Start the Development Servers

```bash
npm run dev                       # all apps via Turborepo

# or individually:
cd apps/web && npm run dev        # → http://localhost:3000
cd apps/mobile && npm run start   # → Expo DevTools
```

---

## Supabase Studio

```bash
npm run supabase:studio
```

Opens **http://127.0.0.1:54323** — a full local database GUI: browse/edit table data, run SQL, inspect auth events, manage storage buckets.

---

## Switching Between Environments

- **Day-to-day development** → always use local Supabase (`.env.development.local`). This is the default for `npm run dev` / `npm run start` in both apps.
- **Testing against the staging project** → `npm run dev:staging` (web) or `npm run start:staging` (mobile), which load `.env.staging.local`.
- **Running an admin script against staging or production** (`scripts/*.mjs`) → pass `--staging` or `--prod` explicitly, e.g. `node scripts/audit-coach-status.mjs --staging`. Without a flag, these scripts hit your local Supabase. The script prints a warning when targeting a hosted project.
- **Real staging/production deploys** (Vercel, EAS) → configure environment variables directly in that platform's dashboard. `.env.staging.local` / `.env.production.local` are only for local tooling that intentionally needs to reach a hosted project (e.g. one-off admin scripts, or manually pointing your dev server at staging) — they are never read by the actual deployed build.

---

## Development Rules

1. **Never** edit schema manually in Supabase Studio or via the SQL Editor.
2. Every schema change is a migration file in `supabase/migrations/`.
3. Every migration must apply cleanly to an **empty** database — verify with `npm run supabase:reset`.
4. Regenerate types after every schema change: `npm run supabase:types`.
5. Keep Local, Staging, and Production completely isolated — never copy production credentials into a dev env file.
6. Never commit `.env.development.local`, `.env.staging.local`, or `.env.production.local`. Keep `.env.example` updated with placeholders only.

---

## Project Structure

See [`docs/directory_structure.md`](./directory_structure.md) for the full annotated file tree.

```
Abhyas/
├── .env.example                 ← template — copy to .env.development.local / .env.staging.local / .env.production.local
├── .env.development.local       ← gitignored, local Docker Supabase creds
├── .env.staging.local           ← gitignored, staging Supabase creds
├── .env.production.local        ← gitignored, hosted production Supabase creds (optional, for admin scripts)
├── supabase/migrations/         ← SQL migrations, applied in order by `supabase db reset`
├── packages/
│   ├── database/                ← Shared Supabase clients + generated TypeScript DB types
│   └── common/                  ← Shared domain types, Zod schemas, constants
└── apps/
    ├── web/                     ← Next.js Admin Portal
    └── mobile/                  ← Expo React Native scanner app
```

---

## Useful Commands

```bash
npm run supabase:start     # start local Supabase (Docker)
npm run supabase:stop      # stop local Supabase
npm run supabase:status    # print local API URL + anon/service_role keys
npm run supabase:reset     # recreate local DB from migrations (destructive, local only)
npm run supabase:types     # regenerate packages/database/src/types.ts
npm run supabase:studio    # open local Supabase Studio in your browser
npm run supabase:lint      # lint migrations for schema issues

npm run type-check         # type-check all packages and apps
npm run lint               # lint all code
npm run clean              # clean all build artifacts and caches
```

---

## Troubleshooting

**`docker` command not found / Docker Desktop won't start**
Docker Desktop needs the WSL2 backend on Windows. Run `wsl --install --no-distribution` in an elevated PowerShell, restart, then launch Docker Desktop once to finish setup.

**`supabase start` hangs or fails with a port conflict**
Another process is using one of Supabase's ports (54321–54329). Run `npm run supabase:stop` first, or check `supabase/config.toml` for the port list and free them up.

**`supabase db reset` fails partway through a migration**
The error names the failing file in `supabase/migrations/`. Fix the SQL there — migrations are replayed in filename order from an empty database every time, so the file must be correct in isolation, not just as a delta from your last local state.

**App shows stale types / TS errors after a schema change**
Re-run `npm run supabase:types` — `packages/database/src/types.ts` is generated, not hand-edited.

**Env vars are `undefined` in the app**
Confirm `.env.development.local` exists at the repo root (not inside `apps/web` or `apps/mobile`) and has real values, not the placeholder strings from `.env.example`. Restart the dev server after editing it — Next.js/Expo only read env files at process start.

**Accidentally ran a script against production**
Every `scripts/*.mjs` admin script defaults to local Supabase and only touches production when you pass `--prod` explicitly (and prints a warning when it does). If you ran one without meaning to hit prod, you're safe by default — double-check the printed Supabase URL if unsure which environment a script is using.

---

## Deferred Modules (Coming Later)

The following are intentionally NOT implemented in the current build:

- 🔲 **Health Tracker** — sports vitals, medical reports, growth charts
- 🔲 **Payment Queue** — UPI/screenshot payment proof uploads, admin verification
- 🔲 **AI Insights** — Gemini Flash monthly progress summaries
- 🔲 **Notifications** — WhatsApp absence alerts, Expo push, Resend emails
