# Demo Data Summary

What's populated in the local development environment right now, and how it was produced. See [`docs/user-guide/`](user-guide/README.md) for the workflows this data supports, and [`issues-and-recommendations.md`](issues-and-recommendations.md) for what was discovered along the way.

## How this was built

Per the brief, **bulk volume was seeded directly against the database** (`scripts/seed-demo-data.mjs`, ~700 lines, idempotent-on-reset) rather than through the UI — creating dozens of accounts and months of attendance history one click at a time isn't a good use of either the UI or your time. **Every workflow type was then additionally exercised once through the real UI** with a scripted Playwright browser (`apps/web/pw-capture-all.mjs`), producing the 79 screenshots in `docs/screenshots/` used throughout the user guide.

Both scripts are checked into the repo (`scripts/seed-demo-data.mjs`, `apps/web/pw-*.mjs`) and are safe to re-run — they refuse to target anything but local Supabase.

**Why a script instead of clicking through the UI 200 times:** two of the six ways to create an org/user through the UI turned out to be completely broken (see the P0 bug below) — a script was the only way to get organizations into the database at all, and the fastest way to get realistic volume regardless.

## Entities created

| Entity | Count | Notes |
|---|---|---|
| Organizations (tenants) | **8** | See table below. (A 9th "Global System Default" row is a platform-internal placeholder from the base migrations, not a real organization.) |
| Users (all roles) | 82 | |
| — Admins | 9 | One per organization, plus one extra "Front Desk" admin at VidyaSopan |
| — Coaches | 17 | 15 `Active` (marketplace-visible), 2 `Pending Verification` (for testing the approval workflow) |
| — Students | 57 | |
| Classes | 11 | |
| Batches | 16 | |
| Coach ↔ Batch assignments | 15 | All `approved` — see the [known display bug](issues-and-recommendations.md#p1-batch--coach-assignment-list-never-reflects-reality) where the UI doesn't show these despite them being real |
| Attendance records | 1,528 | ~6-8 weeks per student, matched to each batch's actual scheduled days. 801 present / 94 late / 105 absent, plus realistic gaps |
| Fines | 162 | 75 paid · 44 unpaid · 30 pending verification · 13 waived |
| Coach leave requests | 5 | Mixed Pending/Approved/Rejected |
| Coach reviews | 7 | Drives the star ratings visible in the marketplace |
| Coach pricing policies | 20 | Every coach has a `monthly_subscription` policy enabled by default |
| Coach documents | 21 | One "Government ID" per coach (enough to pass the approval gate), `Verified` |

## Organizations

| Name | Type | Coaches | Students | Batches |
|---|---|---|---|---|
| VidyaSopan Sports School | Multi-sport academy (seeded default, largest) | 4 | 15 | 3 |
| Elite Football Academy | Single-sport academy | 2 | 8 | 2 |
| Champions Cricket Academy | Single-sport academy | 2 | 8 | 2 |
| Ace Badminton Academy | Single-sport academy | 2 | 6 | 2 |
| AquaPro Swimming Academy | Single-sport academy | 2 | 6 | 2 |
| Serenity Yoga & Wellness Center | Wellness studio | 2 | 5 | 2 |
| Rhythm Dance Academy | Arts academy | 2 | 5 | 2 |
| Priya Sharma Fitness Studio | **Independent coach** — Priya is simultaneously the tenant's Admin *and* its one Coach (`available_roles: ['admin','coach']`), which is how "independent coach" is actually representable in this data model | 1 | 3 | 1 |

All in and around Hyderabad, matching the platform's seeded 50-locality service-area taxonomy (Gachibowli, Kondapur, Jubilee Hills, Secunderabad, Uppal, Kukatpally, and more).

## Realism choices worth knowing about

- **Names, phones, addresses**: drawn from pools of real Indian first/last names, `9XXXXXXXXX`-format phone numbers, and real Hyderabad-area street/locality combinations — no "Test User" or "ABC Academy" placeholders anywhere.
- **Fine amounts vary by academy** (₹200–₹1000 for the first tier) so the 8 organizations don't read as clones of each other.
- **Attendance is date-accurate**: only generated on each batch's actual `days_of_week`, skipping days before a student's `joining_date`, with an 80/10/10 present/late/absent split.
- **Coach statuses are intentionally mixed** (15 Active, 2 Pending Verification) so the approval workflow in [User Management](user-guide/03-user-management.md) has something real to demonstrate — though see the bug report for why that screen can't currently load them.

## What this data model does *not* support (by design, not a seeding shortcut)

A few things requested in the brief don't have a real representation in the current schema — noted here so it's clear these weren't skipped by accident:

- **A coach teaching at two different academies.** `coaches.tenant_id` is singular and NOT NULL — every coach belongs to exactly one tenant. There's no cross-tenant coach-batch assignment path. If this is a real requirement, it needs a schema change (a `coach_tenant_memberships` join table, or similar), not just more seed data.
- **A student enrolled in multiple batches at once.** `students.batch_id` is a single nullable column, not a join table — one batch per student, period.
- **"Independent coach" as a first-class concept.** There's no `is_independent` flag or similar — it's represented here as a single-person tenant where the same user has both the Admin and Coach roles (see Priya Sharma Fitness Studio above), which is a reasonable approximation but required directly manipulating the `coaches` table via the seed script, since no UI flow produces this state on its own.

## Login credentials

- **Superadmin**: `admin@abhyas.local` (password `admin123`, though the UI only offers magic-link — see below)
- **All seed-script-created accounts**: password `DemoPass123!` (also magic-link only in the UI)
- **Every account** signs in the same way: enter the email at `/auth/login` → **Continue** → open the sign-in link in [Mailpit](http://127.0.0.1:54324) (local mail catcher, not a real inbox)

Full list of admin emails per organization is printed at the end of `scripts/seed-demo-data.mjs`'s run — re-run it any time (after `npm run supabase:reset`) to see it again, or query `select email, role from users where role = 'admin'` in Supabase Studio.
