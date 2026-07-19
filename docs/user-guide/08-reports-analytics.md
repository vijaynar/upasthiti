# Reports & Analytics

A tabbed, read-only reporting surface: Batch Attendance, Coach Performance, Student Progress, Fine Collection.

---

## Workflow: View academy reports

**Purpose:** Month-by-month attendance, fine, and progress insights, exportable to CSV/print.

**Prerequisites:** Signed in as Admin, Super Admin, or Coach.

**Steps:**
1. Open **Reports**, pick a month/year.
2. Switch between **Batch Attendance**, **Coach Performance**, **Student Progress**, and **Fine Collection** tabs.
   ![Batch Attendance report](screenshots/08-reports-analytics/21-reports-batch-tab.png)
3. Use **Export CSV** or **Print Report** on the tab you're viewing.

**Expected result:** Filtered, exportable tables/summaries scoped to your academy.

> ⚠️ **Cross-tenant data leak in the Batch filter (Medium-High severity).** The Batch Attendance tab's batch dropdown is populated by a plain `supabase.from('batches').select(...)` with **no `tenant_id` filter**, relying entirely on RLS to scope it. In this environment, it doesn't: an Admin signed into **VidyaSopan Sports School** sees and can select batches belonging to **other academies** (e.g. "Adult Swimming" from AquaPro Swimming Academy, confirmed by direct database lookup during this walkthrough — screenshot above shows exactly this, auto-selected by default). Selecting a foreign batch does correctly return "No Enrolled Students" rather than leaking another tenant's real roster/attendance data — so this appears to be a **metadata leak** (other academies' batch and class *names* become visible) rather than a full student-data breach, but it's still a real multi-tenant isolation defect worth fixing before this code sees any shared/hosted environment. See [issues-and-recommendations.md](../issues-and-recommendations.md#p1-cross-tenant-batch-name-leak-in-reports) for the fix recommendation (add `.eq('tenant_id', ctx.tenantId)`, or better, an RLS policy on `batches` that makes the missing filter harmless everywhere it's forgotten).

**Tips:** Given the above, treat any dropdown/list on this page that shows unfamiliar batch/class names as a signal, not a real option to select for your own reporting.
