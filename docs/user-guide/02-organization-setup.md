# Organization Setup

Covers the two ways a new organization (tenant) gets created, how a coach joins one, and per-tenant settings.

---

## Workflow: Register a new academy (public self-service)

**Purpose:** Let a prospective customer sign up their own academy without any platform operator involvement — the primary SaaS growth loop ("SaaS attendance & payment management starting at ₹0/month").

**Prerequisites:** None — this is a public, unauthenticated page.

**Steps:**
1. Go to `/auth/register`.
   ![Empty academy registration form](screenshots/02-organization-setup/01-academy-register-empty.png)
2. Fill in Academy Details (name, subdomain slug, country/state/city, optional address) and the Owner/Admin Account section (name, email, phone, password).
   ![Filled academy registration form](screenshots/02-organization-setup/02-academy-register-filled.png)
3. Click **Onboard Academy & Log In**.

**Expected result:** A new tenant, a new admin account, and immediate sign-in into that academy's dashboard.

> ⚠️ **Currently broken — P0.** Submitting this form fails with `Internal server error` every single time on a fresh database. Root cause and fix recommendation: [issues-and-recommendations.md](../issues-and-recommendations.md#p0-tenant-provisioning-is-completely-broken). Captured evidence:
> ![Registration fails with 500](screenshots/02-organization-setup/03-academy-register-result-KNOWN-BUG-500.png)
>
> **This is the same underlying bug as Super Admin's "Onboard Academy" form** (see [Platform Administration](01-platform-administration.md)) — both code paths insert into `public.users` in a way that collides with an auto-provisioning database trigger. Neither path to creating a new organization currently works end-to-end through the UI. All demo organizations in this environment were created via a direct database seed script instead (see [demo-data-summary.md](../demo-data-summary.md)).

**Common mistakes:** None currently reachable — the flow fails before any user input could be "wrong".

---

## Workflow: A coach joins an academy (self-registration via invite link)

**Purpose:** An academy shares a coach-onboarding link (`/auth/register?role=coach&tenantId=<tenant-uuid>`); the coach fills out their own professional profile, documents, pricing, and account, then is auto-logged-in pending admin approval.

**Prerequisites:** A valid, existing tenant ID (share this link only after an academy already exists — see the bug above for why a brand-new academy can't currently self-serve this on day one).

**Steps — a 6-step wizard:**
1. **Personal Information** — name, gender, DOB, email, phone, languages, address/location.
   ![Step 1: Personal information](screenshots/02-organization-setup/02-coach-register-step1-filled.png)
2. **Professional Profile** — sport/category & specialty tags, age groups, skill levels, experience, qualification, service types (Online/Offline), class types, bio, service areas.
   ![Step 2: Professional profile](screenshots/02-organization-setup/03-coach-register-step2-professional.png)
3. **Documents** — upload Aadhaar/PAN/qualification certificate (optional but required later for admin approval — see [User Management](03-user-management.md)).
   ![Step 3: Documents](screenshots/02-organization-setup/04-coach-register-step3-documents.png)
4. **Payment & Pricing** — which student-facing pricing policies to offer (monthly subscription, per-class, packages, trial, fine-based, one-time registration) and their rates.
   ![Step 4: Payment & pricing](screenshots/02-organization-setup/05-coach-register-step4-pricing.png)
5. **Account Security** — password + bank/UPI payout details.
   ![Step 5: Account security](screenshots/02-organization-setup/06-coach-register-step5-security.png)
6. **Review & Submit** — final review screen, then **Complete Onboarding**.
   ![Step 6: Review & submit](screenshots/02-organization-setup/07-coach-register-step6-review.png)
   ![Successful coach registration result](screenshots/02-organization-setup/08-coach-register-result.png)

**Expected result:** A new coach account with `account_status: Pending Verification` (if all mandatory docs were uploaded) or `Document Upload Pending` otherwise — not immediately active. The coach is auto-logged-in but blocked from batch/attendance actions until an academy admin approves them (see [User Management](03-user-management.md)).

**Common mistakes:**
- Sharing the invite link with an invalid or missing `tenantId` — the wizard will let you fill out all 6 steps, but the final submission fails with a database error (`invalid input syntax for type uuid`) because the tenant ID is never validated until the very last step.
- Assuming the coach can log in immediately with full access — they can log in, but every batch/attendance action is blocked until an admin explicitly approves them.

**Tips:** Every field on every step can be instantly filled with realistic-looking fake data via the **⚡ Auto-fill Test Data** button (only visible in test/admin contexts) — it even fake-uploads a generated avatar and dummy PDF documents. Useful for QA, not something a real coach would see.

---

## Workflow: Configure academy settings (fines, attendance rules, holidays)

**Purpose:** Set the academy's attendance grace period, late threshold, absence fine tiers, currency, weekend days, and holiday calendar.

**Prerequisites:** Signed in as that academy's Admin (or Super Admin).

**Steps:** Open **Global Settings** (or **Academy Settings**) from the sidebar.
![Tenant settings page](screenshots/02-organization-setup/34-tenant-settings-page.png)

**Expected result:** A form for `absentFineRule1`/`absentFineRule1Days`/`absentFineRule2`, `lateThresholdMinutes`, `gracePeriodMinutes`, `currency`, `holidays`, `weekends`, and an `autoFineEnabled` toggle. These directly drive the automatic fine calculation described in [Payments & Fines](06-payments-fines.md).

**Tips:** Every seeded academy in this environment has slightly different fine amounts (₹200–₹1000 for the first tier) to make the demo data feel like independently-configured businesses rather than clones.
