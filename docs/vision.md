# Vision

## What Abhyas is

Abhyas is a multi-tenant SaaS platform for coaching centers, schools, sports academies, tuition centers, and martial-arts institutes. It combines two halves:

1. **Academy Operations** — AI-powered attendance (face-match check-ins), batch/class management, fines & payment verification, leave approvals, coach HR/payroll, and student progress tracking for institutes already running on the platform.
2. **Public Discovery Marketplace** (`/explore`) — a category/subcategory-driven directory where students and parents browse and search coaches and academies by specialty, location (service area/community), rating, and price, and where coaches self-onboard against a structured taxonomy (Sports, Fitness, Martial Arts, Music, Academic/Tuition, and more) instead of free-text skill tags.

What began as a single-purpose attendance system has grown into this combined "run your academy" + "get discovered" platform. Most new feature work today lands on the Discovery side (coach onboarding, service areas, pricing policies) rather than the original attendance engine — keep that in mind when prioritizing: the attendance/biometric pipeline is stable infrastructure, the marketplace surface is the active growth area.

For the full functional spec (screens, workflows, per-role capabilities), see [`feature_plan.md`](./feature_plan.md). This document is the condensed orientation for new contributors and agents.

## Who uses it

| Role | Summary |
|---|---|
| **Super Admin** | SaaS platform owner. Onboards tenants, monitors subscriptions, sees cross-tenant analytics, controls global settings. |
| **Admin** | Institute manager. Manages students, batches/classes, attendance rules, fines, coach approvals, payment verification, reporting. |
| **Coach** | Runs classes under a tenant (or independently, via Discovery). Has an onboarding lifecycle (`Onboarding` → `Document Upload Pending` → `Pending Verification` → `Active`/`Inactive`/`On Leave`/`Terminated`), a public profile (`/coaches/[slug]`), configurable pricing policies, availability, leave requests, and payroll.
| **Student** | Attends batches, tracked via face-match attendance, views fines/dues, can browse Discovery and apply to "Become a Coach". |
| **Parent** | Linked to one or more students; oversees their attendance, fines, and (planned) medical/vitals data. |

A single tenant is a coaching institute; `superadmin` role and the platform-wide taxonomy/service-area reference data are the only cross-tenant concepts. See [`database.md`](./database.md#multi-tenancy) for how isolation is enforced.

## Core modules (current build)

- **Attendance** — face-embedding enrollment (`face-api.js`, 128-dim vectors via `pgvector`), group-photo scan and manual override, fines auto-generated from absence/lateness rules.
- **Coach lifecycle** — onboarding wizard (personal details → documents → service areas → category tagging → pricing → payroll settings), document verification, batch assignment requests, leave approvals, coach attendance.
- **Discovery marketplace** — public `categories`/`subcategories`/`tags` taxonomy, two-tier `service_areas`/`service_communities` geography (seeded Hyderabad localities + Google Places-backed communities), public coach/academy search and profile pages.
- **Pricing** — per-coach policy engine (`coach_pricing_policies`/`coach_pricing_rules`): Monthly Subscription, Per Class, Class Packages, Trial Session, Fine-Based, One-Time Registration — independently toggle-able, plus per-student overrides. See [`coach_pricing_policies.md`](./coach_pricing_policies.md).
- **Governance** — RBAC (`roles`/`permissions`/`role_permissions`), audit logging, super-admin tenant controls.

## Deferred / not yet built

These appear in the functional spec and in `package.json` dependency lists as staged intent, but have **no implementation yet** — don't assume they exist:

- **Mobile app** (`apps/mobile`) — unmodified Expo template scaffold only; no screens, navigation, or Supabase client wired up yet. See [`agents/frontend.md`](../agents/frontend.md).
- **Health Tracker** — sports vitals, medical vault, growth/fitness charts.
- **AI Insights** — Gemini-powered monthly progress summaries.
- **Notifications** — WhatsApp/SMS alerts, Expo push, Resend emails.
- **Automated testing and linting** — no test framework or ESLint config is wired up yet. See [`coding-standards.md`](./coding-standards.md).

## Tech stack at a glance

Turborepo monorepo (npm workspaces) — Next.js 16 (React 19, App Router) web app + Expo React Native mobile shell, both backed by a shared Supabase Postgres database (with `pgvector` for face matching) via `packages/database` and `packages/common` (Zod schemas, shared types, constants). See [`system_architecture.md`](./system_architecture.md) for the full diagram, and [`database.md`](./database.md), [`api-guidelines.md`](./api-guidelines.md), [`ui-guidelines.md`](./ui-guidelines.md), [`coding-standards.md`](./coding-standards.md) for the per-layer conventions.
