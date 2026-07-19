# Batch Management

Classes (subjects/disciplines) and batches (scheduled time-slots within a class) are how students and coaches get organized.

---

## Workflow: Create a class and a batch

**Purpose:** Set up a new offering — e.g. "Table Tennis" as a class, with an "Evening Table Tennis" batch at a specific time/day/capacity.

**Prerequisites:** Signed in as Admin, Super Admin, or Coach (coaches can create batches too, but any batch they create starts as a `pending` self-assignment requiring admin approval).

**Steps:**
1. Open **Batches**. The page has two sections: **Class Streams** (top) and **Batch assignment** (bottom).
   ![Batch Management overview](screenshots/04-batch-management/10-batches-list.png)
2. Click **Add New Class**, name it (e.g. "Table Tennis").
   ![New class form](screenshots/02-organization-setup/07-new-class-form.png)
3. Click **Add New Batch**, choose the class, name the batch, set start/end time, max capacity, and scheduled days.
   ![New batch form filled](screenshots/02-organization-setup/09-new-batch-form-filled.png)
4. Click **Schedule Batch**.

**Expected result:** The class appears as a card with session-count/batch-count stats; the batch appears as a row in the Batch assignment table.

**Common mistakes:** End time must be after start time — the form validates this client-side. Days are toggled individually (Mon–Sun), not a range picker.

**Tips:** A class can have several batches (e.g. "Beginner Badminton" and "Advanced Badminton" both under a "Badminton" class) — this is how one sport supports multiple skill-level cohorts.

---

## Workflow: Assign a coach to a batch

**Purpose:** Link a specific coach to a batch so they can mark attendance and see the roster.

**Prerequisites:** The coach must be `Active` (not Onboarding/Pending Verification/etc.).

**Steps:**
1. From the batch row, click **Manage Coaches**.
2. Under **Assign Coach**, pick a coach from the dropdown, select which of the batch's scheduled days they cover, and click **Assign**.
   ![Assign coach — filled](screenshots/04-batch-management/12-assign-coach-filled.png)

**Expected result:** A "Coach assigned successfully" toast, and the coach should then appear under **Active Coaches** in this same modal, and in the batch table's Coaches column.

> ⚠️ **The write works; the read is broken.** The assignment is genuinely saved (confirmed via direct database check), and the success toast is real —
> ![Assign succeeds but the list doesn't reflect it](screenshots/04-batch-management/13-assign-coach-result.png)
> — but **"Active Coaches" still shows "No coaches assigned yet"**, and the main Batch Management table shows every batch as **UNASSIGNED / "No coaches"** even when a coach genuinely is assigned (all demo batches in this environment have a real, approved `coach_batch_assignments` row seeded directly in the database, and every single one still displays as unassigned here). Root cause: the same broken PostgREST embed pattern as the Coach Management list bug (`Could not find a relationship between 'coaches' and 'coaches'` — a self-referencing FK hint that doesn't exist) — see [issues-and-recommendations.md](../issues-and-recommendations.md#p1-batch--coach-assignment-list-never-reflects-reality) for the fix recommendation. **In practice, nobody using this screen can ever tell which coach is actually running a batch.**

**Common mistakes:** Given the bug above, don't trust the "UNASSIGNED" badge or "No coaches assigned yet" text as a signal that a batch genuinely has no coach — verify in Reports (which queries differently) or the database directly if it matters.

**Tips:** When a **coach** (not an admin) creates their own batch or self-requests an assignment, it lands in **Pending Requests** in this same modal, awaiting admin approval/rejection.

---

## Workflow: Enroll students into a batch

**Purpose:** Get students onto a batch roster so attendance can be tracked for them.

**Two ways this happens:**
1. **Admin sets it directly** when creating the student (see [User Management → Add a student directly](03-user-management.md)) — immediate, no approval needed.
2. **Student self-service join request** — a student browses available batches and requests to join; an admin approves or rejects the request (surfaced in the Admin Dashboard's Action Center as "Student Join Requests").

**Expected result:** Once enrolled, the student appears in the batch's roster count and becomes eligible for attendance marking.

**Tips:** A student has exactly **one** `batch_id` in this schema — there's no way for a student to be enrolled in multiple batches simultaneously (e.g. Cricket *and* Swimming) in the current data model. If your organization needs that, it's a schema change, not a UI limitation — see [issues-and-recommendations.md](../issues-and-recommendations.md#missing-feature-a-student-cannot-belong-to-more-than-one-batch).
