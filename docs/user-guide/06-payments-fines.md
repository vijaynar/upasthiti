# Payments & Fines

Attendance-linked fines, manual fines, and the student-submits/admin-verifies payment-proof loop. This is one of the few money-adjacent flows that's fully wired end-to-end and actually works in this build.

---

## Workflow: Issue a manual fine

**Purpose:** Charge a student for something other than an auto-generated absence fine (equipment damage, late payment penalty, etc.).

**Prerequisites:** Signed in as Admin or Super Admin.

**Steps:**
1. Open **Fines** ("Payment Records & Audit").
2. Click **Issue Manual Fine**.
3. Choose the student, enter an amount and a reason.
   ![Issue Manual Fine — filled](screenshots/06-payments-fines/08-issue-fine-form-filled.png)
4. Click **Issue Fine Record**.

**Expected result:** A new fine, status `unpaid`, immediately visible to the student on their dashboard.

**Tips:** Every seeded academy in this environment uses a different absence-fine tier (₹200–₹1000 for the first 4 absences, doubling after) via [Organization Setup → tenant settings](02-organization-setup.md) — manual fines are independent of those tiers and can be any amount.

---

## Workflow: Student submits payment proof

**Purpose:** A student (or parent) clears an outstanding fine by uploading a UPI/bank transfer screenshot and transaction reference.

**Prerequisites:** Signed in as a Student with at least one `unpaid` fine.

**Steps:**
1. On the Student Dashboard, find **Payment History & Settlements** and click **Submit Proof** on the fine you're clearing.
   ![Student dashboard with outstanding fines](screenshots/06-payments-fines/03-student-dashboard-with-fine.png)
2. Choose a payment method (UPI / Bank Transfer / Cash), enter the transaction reference, and attach a screenshot.
   ![Submit proof modal filled](screenshots/06-payments-fines/05-student-submit-proof-modal-filled.png)
3. Click **Submit Proof Receipt**.

**Expected result:** The fine's status changes from `unpaid` to `pending_verification` — visibly reflected on the dashboard immediately.
![Fine now pending verification](screenshots/06-payments-fines/06-student-fine-pending-verification.png)

**Common mistakes:** Nothing to submit against a `pending_verification` or already-`paid` fine — the button only appears for `unpaid` ones.

---

## Workflow: Admin verifies a payment

**Purpose:** Cross-check the submitted proof against real bank/UPI records and settle the fine.

**Prerequisites:** Signed in as Admin or Super Admin. At least one fine in `pending_verification`.

**Steps:**
1. Open **Fines → Verification Queue**.
   ![Payment verification queue](screenshots/06-payments-fines/05-admin-payment-verification-queue.png)
2. Click **View Receipt** to inspect the uploaded screenshot alongside the transaction ID.
3. Click **Approve** (marks `paid`, records the payment timestamp) or **Reject** (with a reason — reverts to `unpaid` and notifies the student).

**Expected result:** The fine leaves the Verification Queue; the student sees the outcome (and, if rejected, your reason) on their own dashboard.
![Verification queue after approval](screenshots/06-payments-fines/06-admin-payment-approved-result.png)

**Tips:** This full loop — student uploads proof → admin approves/rejects — is genuinely implemented and reliable, unlike several other creation flows in this build (see [issues-and-recommendations.md](../issues-and-recommendations.md)). It's a good reference for "what working looks like" in this codebase.

**Missing feature:** There's no in-UI way to **waive** a fine (`status: waived` exists in the schema and is used by demo data, but no button reaches it from either the student or admin fines screens observed in this build).
