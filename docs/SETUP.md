# Abhyas — Developer Setup Guide

> Smart academy management + public coach/academy Discovery marketplace. Monorepo using **Turborepo + Next.js + Expo React Native + Supabase**.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20.0 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 10.0 | Bundled with Node |
| Docker Desktop | Latest | [docker.com/desktop](https://www.docker.com/products/docker-desktop/) |
| Supabase CLI | Latest | `npm install -g supabase` |
| Expo CLI (optional) | Latest | `npm install -g expo-cli` |

---

## Initial Setup

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-org/abhyas.git
cd abhyas
npm install
```

### 2. Configure Environment Variables

```bash
# For the web app
cp .env.example apps/web/.env.local

# For the mobile app
cp .env.example apps/mobile/.env
```

Edit both files and fill in your Supabase credentials (see Step 3 for local values).

### 3. Start Local Supabase (Docker)

```bash
# Start the local Supabase stack (PostgreSQL + Auth + Storage + Studio)
supabase start

# It will output your local credentials:
# API URL:     http://localhost:54321
# anon key:    eyJ...
# service_role key: eyJ...
```

Copy the `anon key` and `service_role key` into your `.env.local` / `.env` files.

### 4. Run Database Migrations

```bash
# Apply all SQL migrations in supabase/migrations/
supabase db reset
```

This will:
- Enable `uuid-ossp` and `pgvector` extensions
- Create all tables with constraints and triggers
- Create the `match_face_embedding` stored procedure
- Apply all performance indexes and RLS policies

### 5. Start the Development Servers

```bash
# Start all apps simultaneously (web + any future services)
npm run dev

# Or start individually:
cd apps/web && npm run dev     # → http://localhost:3000
cd apps/mobile && npx expo start  # → Expo DevTools
```

---

## Supabase Studio

Visit **http://localhost:54323** in your browser to access the local Supabase Studio — a full-featured database GUI where you can:
- Browse and edit table data
- Run SQL queries
- Monitor authentication events
- Manage storage buckets

---

## Project Structure

See [`docs/directory_structure.md`](./directory_structure.md) for the full annotated file tree.

```
Abhyas/
├── supabase/migrations/     ← SQL migrations (Phases 1)
├── packages/
│   ├── database/            ← Shared Supabase clients + TypeScript DB types
│   └── common/              ← Shared domain types, Zod schemas, constants
└── apps/
    ├── web/                 ← Next.js Admin Portal (Phase 3 & 4)
    └── mobile/              ← Expo React Native scanner app (Phase 5)
```

---

## Useful Commands

```bash
# Type-check all packages and apps
npm run type-check

# Lint all code
npm run lint

# Clean all build artifacts and caches
npm run clean

# Generate fresh Supabase TypeScript types (after schema changes)
supabase gen types typescript --local > packages/database/src/types.ts
```

---

## Deferred Modules (Coming Later)

The following are intentionally NOT implemented in the current build:

- 🔲 **Health Tracker** — sports vitals, medical reports, growth charts
- 🔲 **Payment Queue** — UPI/screenshot payment proof uploads, admin verification
- 🔲 **AI Insights** — Gemini Flash monthly progress summaries
- 🔲 **Notifications** — WhatsApp absence alerts, Expo push, Resend emails
