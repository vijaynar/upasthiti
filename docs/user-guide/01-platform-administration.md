# Platform Administration (Super Admin)

The Super Admin role operates one level above every academy — it's the SaaS operator's view across all tenants, not scoped to a single academy.

---

## Workflow: Sign in and view the academy dashboard

**Purpose:** Every account, including Super Admin, lands on an academy-scoped dashboard by default (Super Admin's default "home" tenant here is VidyaSopan Sports School — the seeded default tenant).

**Prerequisites:** A confirmed account. Locally, [Mailpit](http://127.0.0.1:54324) catches the sign-in email.

**Steps:**
1. Go to `/auth/login`, enter the account email, click **Continue**.
   ![Login page](..\screenshots\01-platform-admin\01-superadmin-login-page.png)
2. The app shows "Check Your Email" — open Mailpit and click the sign-in link in the email addressed to that account.
   ![Check your email](screenshots/01-platform-admin/02-superadmin-check-email.png)
3. You land on the academy dashboard for your default tenant.
   ![Academy dashboard](screenshots/01-platform-admin/03-academy-dashboard-view.png)

**Expected result:** A fully populated dashboard — student/coach/batch counts, a 7-day attendance trend chart, batch performance table, action center (pending join requests, payment verifications), recent activity feed, and pending fee payments.

**Common mistakes:** Looking for a password field — there isn't one. The **"Try it first"** guest button on the login page references a `demo-student@upasthiti.com` account that isn't seeded anywhere in this codebase; it 400s if clicked.

**Tips:** Any seeded account works with this exact flow — just swap the email.

---

## Workflow: Switch to the platform-wide Super Admin view

**Purpose:** See metrics and manage tenants across the *entire platform*, not just one academy.

**Prerequisites:** The signed-in user's `available_roles` must include `superadmin` (only the seed account `admin@abhyas.local` has this locally).

**Steps:**
1. On any admin page, find the role switcher at the bottom of the left sidebar (shows your current active role, e.g. "ADMIN").
2. Select **Super Admin** from the dropdown. The app does a full page reload and lands back on `/admin/dashboard`, but the sidebar now shows an **Academies** nav item.
3. Open **Academies** (`/admin/superadmin`) to reach the platform console.
   ![Superadmin analytics dashboard](screenshots/01-platform-admin/04-superadmin-analytics-dashboard.png)
4. Scroll down for the full academy registry table, growth charts, revenue-by-academy breakdown, and an activity feed.
   ![Academy registry table](screenshots/01-platform-admin/05-superadmin-academy-registry-table.png)

**Expected result:** KPI cards for total academies/students/coaches/admins/active batches/attendance %/pending fees, a searchable+filterable table of every tenant, and a "Active Academies Map".

**Common mistakes:** Expecting the role switcher to jump straight to `/admin/superadmin` — it doesn't; it reloads the regular dashboard and you navigate to **Academies** from there yourself.

---

## Workflow: Onboard a new academy (Super Admin direct provisioning)

**Purpose:** A Super Admin can directly create a new tenant + its owner/admin account, without the owner self-registering.

**Prerequisites:** Signed in as Super Admin.

**Steps:**
1. From **Academies**, open the **Onboard Academy** tab.
   ![Empty onboarding form](screenshots/01-platform-admin/06-onboard-academy-form-empty.png)
2. Fill in the Academy Identity Profile (name, slug, optional email, subscription state), Academy Location Profile, and Owner/Primary Administrator Profile (name, email, phone, password).
   ![Filled onboarding form](screenshots/01-platform-admin/07-onboard-academy-form-filled.png)
3. Click **Onboard & Provision Academy Profile**.

**Expected result:** A new tenant row plus a working admin login for the owner.

> ⚠️ **Currently broken.** In this build, submitting this form returns `500 Internal server error` every time — see [issues-and-recommendations.md](../issues-and-recommendations.md#p0-tenant-provisioning-is-completely-broken) for the root cause (a `.insert()` that collides with an auto-provisioning database trigger). The screenshot below is the actual failure state captured during this walkthrough, left as evidence rather than staged:
> ![Provisioning fails](screenshots/01-platform-admin/08-onboard-academy-result.png)
> All 8 demo organizations in this environment were therefore created directly via a seed script, not through this form. See the [Organization Setup](02-organization-setup.md) doc for the *other* tenant-creation path (public self-registration), which hits the identical bug.

**Common mistakes:** N/A while this is broken — there's nothing a user can do differently to work around it.

---

## Workflow: System Governance tab

**Purpose:** Platform-wide settings distinct from any one tenant's settings.

**Steps:** From **Academies**, open **System Governance**.
![System governance tab](screenshots/01-platform-admin/09-system-governance-tab.png)

**Expected result:** Global configuration surface for the platform operator (separate from the per-tenant Settings page covered in [Organization Setup](02-organization-setup.md)).
