# User Management

Adding people to an academy (students, coaches, staff), approving coach applications, custom RBAC roles, and the audit trail.

---

## Workflow: Add a student directly

**Purpose:** An academy admin enrolls a student without the student self-registering.

**Prerequisites:** Signed in as Admin or Super Admin.

**Steps:**
1. Open **Students**, click **Add Student Profile**.
2. Fill in Portal Account Credentials (email, optional password — defaults to phone number if left blank), Personal Information (name, phone, DOB), Academic Records (custom ID — auto-generated if blank, batch assignment, joining date), and emergency contact/address.
   ![Add Student form filled correctly](screenshots/02-organization-setup/05-new-academy-add-student-filled.png)
3. Click **Register Student Account**.

**Expected result:** A new student account, immediately assigned to the selected batch (no approval step needed when an admin creates the student directly — contrast with student self-service join requests, which do require approval).

> ⚠️ **Currently broken — P0.** This form always returns `Internal server error` on submit, on a fresh database:
> ![Add Student fails with 500](screenshots/02-organization-setup/06-new-academy-add-student-KNOWN-BUG-500.png)
> Same root cause as the tenant-provisioning bugs in [Platform Administration](01-platform-administration.md) and [Organization Setup](02-organization-setup.md) — `POST /api/v1/students` does a plain `.insert()` into `public.users` (and `public.students`) instead of an `.upsert()`, colliding with an auto-provisioning database trigger. See [issues-and-recommendations.md](../issues-and-recommendations.md#p0-tenant-provisioning-is-completely-broken) for the full list of affected endpoints and the fix. All 56 demo students in this environment were created via a direct database seed script, bypassing this route entirely.

**Common mistakes:** None currently reachable — correct input still fails.

---

## Workflow: Onboard / approve a coach

**Purpose:** Review a coach's application (whether self-registered via invite link or added by an admin) and activate their account.

**Prerequisites:** Signed in as Admin or Super Admin. The coach must have at least one "Government ID" document uploaded (Aadhaar or PAN) before they can be approved.

**Steps:**
1. Open **Coaches** to see every coach with their status (Onboarding, Document Upload Pending, Pending Verification, Active, Paused, Suspended, Rejected, Inactive, Archived).
   ![Coach Management list](screenshots/03-user-management/03-coaches-list-mixed-statuses.png)
2. Select a coach in **Pending Verification** to open their quick-view profile.
3. Click **Approve** to activate them, or **Reject** (with a reason), **Request Documents**, **Pause**, **Suspend**, or **Archive** depending on their current state and yours.

**Expected result:** The coach's `account_status` flips to `Active`, unblocking batch assignment and attendance marking for them.

> ⚠️ **The coach list itself is currently broken.** Every load of this page shows "Failed to load: API fetch failed" and an empty table — see the screenshot above, which is the *actual* rendered state, not a staged empty-state mock. Root cause: `GET /api/v1/coaches?includeInactive=true` always 500s because its query embeds `coach_batch_assignments` directly off the `users` table using a foreign-key hint that only exists on `coaches` — PostgREST can't resolve it. Full details: [issues-and-recommendations.md](../issues-and-recommendations.md#p1-coach-management-list-never-loads). **In practice, admins cannot browse, search, filter, or approve coaches through this screen at all right now** — a P0-severity functional blocker, distinct from (but as serious as) the creation-flow bugs above.

**Common mistakes:** N/A while broken.

**Tips:** Coach lifecycle statuses are more granular than students — worth knowing the full vocabulary: `Onboarding → Document Upload Pending / Pending Verification → Active`, with `Rejected`, `Paused`, `Suspended`, `Inactive`, and terminal `Archived` as off-ramps at various points.

---

## Workflow: Add a non-coach staff account (governance user directory)

**Purpose:** Add an Admin, Student, or Parent account outside the main Students/Coaches onboarding flows — e.g. a second front-desk admin.

**Prerequisites:** Signed in as Admin or Super Admin.

**Steps:**
1. Open **User Directory** (Administration section).
   ![User directory list](screenshots/03-user-management/26-governance-users-list.png)
2. Click **Add New User**, fill in First/Last Name, Email, Password, optional Phone, and Role (**Admin** or **Student** only — the form explicitly refuses `coach`, redirecting you to the Coaches page instead).
   ![Add New User form filled](screenshots/03-user-management/28-governance-add-user-filled.png)
3. Click **Add User**.

**Expected result:** A new account with the selected role, scoped to your tenant.

> ⚠️ **Currently broken — same root cause.** `POST /api/v1/governance/users` also plain-`.insert()`s into `public.users`, so this 500s every time too. This is the **5th confirmed endpoint** hitting the identical bug class — see [issues-and-recommendations.md](../issues-and-recommendations.md#p0-tenant-provisioning-is-completely-broken).

**Common mistakes:** Trying to add a coach here — the form will tell you to use "Onboard New Coach" on the Coaches page instead, since a coach account needs a full profile this simpler form doesn't collect.

---

## Workflow: Create a custom role (RBAC)

**Purpose:** Define a role narrower than the built-in Admin/Coach/Student system roles — e.g. a "Billing Clerk" who can only view/manage payments.

**Prerequisites:** **Super Admin only.** This is gated by the `roles.manage` permission, which — by design — no Admin role is ever granted (see the RBAC seed data: Admin gets every permission except `roles.manage`).

**Steps:**
1. Open **Roles & Permissions**.
2. Click **Create Role**, name it, click **Create**.
3. Click cells in the permission matrix (Module × View/Create/Edit/Delete/Manage/Mark/View Own) to toggle grants for the new role.
   ![Roles & Permissions — Forbidden for Admin](screenshots/03-user-management/30-governance-roles-list.png)

**Expected result:** A new tenant-scoped role, assignable to users via the User Directory or coach edit form.

> ⚠️ **UX inconsistency worth flagging (not a crash, a dead-end).** The **Roles & Permissions** nav link is shown to every Admin, but the page immediately shows **"Forbidden"** for anyone who isn't Super Admin — including the read-only GET request. The screenshot above is an Admin's actual view. Either the nav item shouldn't be shown to Admins at all, or (more useful) Admins should be allowed to *view* the permission matrix read-only even though only Super Admin can edit it. See [issues-and-recommendations.md](../issues-and-recommendations.md#p2-roles--permissions-nav-item-is-a-dead-end-for-admins).

**Tips:** As Super Admin, this page works end-to-end.

---

## Workflow: Review the audit log

**Purpose:** See a chronological trail of significant admin/governance actions for compliance.

**Prerequisites:** Signed in as Admin or Super Admin.

**Steps:** Open **Audit Logs**, optionally filter by module or user.
![Audit logs](screenshots/03-user-management/33-governance-audit-logs.png)

**Expected result:** A paginated, searchable log of actions like coach approvals and settings changes.

**Tips:** This is a read-only view (`GET` only) — there's no way to annotate or export entries from the UI.
