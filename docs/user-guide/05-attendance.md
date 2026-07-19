# Attendance

Three ways attendance gets marked: manual override, AI group-photo scan, and (not covered here, since it requires no login) student self-check-in isn't part of this build — see `docs/SETUP.md`'s deferred-modules list.

---

## Workflow: Mark attendance manually

**Purpose:** Directly set a student's status for a given batch/date — the reliable fallback when biometric scanning isn't set up or fails.

**Prerequisites:** Signed in as Admin, Super Admin, or the batch's assigned Coach.

**Steps:**
1. Open **Attendance**.
   ![Attendance page](screenshots/05-attendance/14-attendance-page-default.png)
2. Click **Override** on a student's row.
3. Pick **Present**, **Late**, or **Absent**, add an optional reason/note, and optionally waive any fine this override would otherwise trigger.
   ![Override modal filled](screenshots/05-attendance/16-attendance-override-filled.png)
4. Click **Save Override Log**.

**Expected result:** The attendance record is upserted (one row per student/batch/date). Marking someone **Absent** automatically issues a fine if the tenant has `autoFineEnabled` on (see [Payments & Fines](06-payments-fines.md)) — tiered by how many absences that student has already had this month.

**Common mistakes:** Forgetting that Absent auto-fines fire immediately — if you're backfilling a manually-excused absence, use the **Waive Fine** option in the same modal rather than fixing it after the fact in Fines.

---

## Workflow: AI group-photo attendance scan

**Purpose:** Upload one photo of an entire batch arriving, and have every recognized face checked in at once — the flagship "smart attendance" feature.

**Prerequisites:** A batch with enrolled students. Real face matching needs `student_face_samples` enrolled per student (via **Enroll Face**) and a working `face-api.js` model load in the browser.

**Steps:**
1. Open **Attendance → Mark Auto Attendance** (or navigate to the group-scan page directly).
2. Select the target batch and date.
   ![Group scan — simulator mode active](screenshots/05-attendance/19-group-scan-simulator-enabled.png)
3. Upload or capture a group photo, then click **Analyze Active Photo**.
4. Review the matched/unrecognized faces, then **Save Attendance Logs**.

**Expected result:** Every recognized student is checked in with a confidence score; unrecognized faces are flagged for manual assignment.

**Tips:** In this environment, `face-api.js`'s WebGL backend fails to initialize (no GPU in this headless/dev browser context) and the page automatically falls back to **AI Simulation Mode** — literally labeled "High-Fidelity Simulator Active" with a note: *"WebGL neural engine running mock landmarks and roster matching. Perfect for instant sandboxed trial verification!"* This is a deliberate, well-built escape hatch for demos/testing — not a bug. Toggle it manually via the **AI Simulation Mode** switch if you want to force it (e.g. to demo the flow without real enrolled face data).

---

## Workflow: Coach requests leave

**Purpose:** A coach files a leave request for admin approval.

**Prerequisites:** Signed in as a Coach.

**Steps:**
1. Open **Leaves** ("My Leaves").
2. Pick a Leave Type (Casual / Sick / Earned), Start/End Date, and a Reason.
   ![Leave request form filled](screenshots/05-attendance/05-coach-leave-request-filled.png)
3. Click **File Leave Request**.

**Expected result:** A `Pending` leave request, cancellable by the coach until an admin acts on it.

---

## Workflow: Admin approves/rejects a leave request

**Prerequisites:** Signed in as Admin or Super Admin.

**Steps:**
1. Open **Leave Approvals**.
   ![Leave approvals queue](screenshots/05-attendance/24-leave-approvals-queue.png)
2. Select a `Pending` request, optionally add a comment, then **Approve Request** or **Reject Request**.

**Expected result:** The request's status updates and the coach sees the decision (plus your comment, if any) on their own Leaves page.
