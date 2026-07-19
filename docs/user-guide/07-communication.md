# Communication

The feature plan (`docs/feature_plan.md`) describes a rich multi-channel communication matrix — WhatsApp absence alerts, Expo push, Resend emails, monthly digests. **None of that is implemented** in this build; `docs/SETUP.md` explicitly lists Notifications as a deferred module. What exists today is a single, much smaller feature:

---

## Workflow: Coach announcements

**Purpose:** As implemented, this is a coach-side scratchpad for jotting notes to remember to tell a batch something — not a real communication channel.

**Steps:** Open **Announcements**, compose a message, select a batch.
![Announcements page](screenshots/07-communication/35-announcements-page.png)

**Expected result:** ⚠️ **This is not a real, multi-user feature.** Announcements are read from and written to `localStorage` in the coach's own browser only (`localStorage.getItem/setItem('coach_announcements')`) — there is no `announcements` database table, no API route, and no delivery to students/parents at all. Anything "posted" here is invisible to everyone else and disappears if the browser's local storage is cleared. The batch dropdown does pull real data (the coach's approved batch assignments), which makes the feature look more connected than it is.

**Recommendation:** Either build this out as a real feature (a table + API route + at minimum an in-app notification for students in the target batch) or relabel/remove it so it doesn't imply a working communication channel that doesn't exist. See [issues-and-recommendations.md](../issues-and-recommendations.md#missing-feature-announcements-is-a-non-functional-mock).
