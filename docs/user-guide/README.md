# Abhyas — End-to-End User Guide

This guide documents every real, working user-facing workflow in Abhyas as it actually behaves in the local development build (not the aspirational feature set in `docs/feature_plan.md` — see `docs/SETUP.md`'s "Deferred Modules" list for what's intentionally not built yet).

Screenshots were captured against a freshly seeded local environment (`scripts/seed-demo-data.mjs`) using a scripted browser walkthrough of the real UI — not mockups. See [`docs/demo-data-summary.md`](../demo-data-summary.md) for what was populated, and [`docs/issues-and-recommendations.md`](../issues-and-recommendations.md) for bugs and UX gaps discovered while producing this guide.

## Contents

1. [Platform Administration](01-platform-administration.md) — Super Admin dashboard, platform analytics, provisioning new academies
2. [Organization Setup](02-organization-setup.md) — academy self-registration, coach self-registration (invite link), tenant settings
3. [User Management](03-user-management.md) — coach approval, governance users, custom roles, audit logs
4. [Batch Management](04-batch-management.md) — creating classes/batches, assigning coaches, enrolling students
5. [Attendance](05-attendance.md) — manual override, AI group-scan (simulator mode), coach leave requests & approvals
6. [Payments & Fines](06-payments-fines.md) — issuing fines, student payment-proof upload, admin verification
7. [Communication](07-communication.md) — announcements (local-only mock — see caveat)
8. [Reports & Analytics](08-reports-analytics.md) — batch/coach/student/collection reports
9. [Marketplace / Discovery](09-marketplace.md) — public coach search, public coach profile, academy search (placeholder)

## Roles referenced in this guide

| Role | Demo account used | Sign-in method |
|---|---|---|
| Super Admin | `admin@abhyas.local` | Magic link (password `admin123` also works, but the UI has no password field) |
| Academy Admin | e.g. `meena.krishnan@vidyasopan.demo` | Magic link |
| Coach | e.g. `coach1@vidyasopan.demo` | Magic link |
| Student | e.g. seeded student emails, see demo data summary | Magic link |

**Every account signs in the same way**: enter the email on `/auth/login`, click **Continue**, then open the sign-in link from the email. Locally, "email" means [Mailpit](http://127.0.0.1:54324) (Supabase's local mail catcher) — nothing is sent to a real inbox. See `docs/SETUP.md`.
