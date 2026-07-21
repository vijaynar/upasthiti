# @abhyas/module-dashboard

Read-only aggregation for the role-specific home/summary screens (Doc 01 PRD
role dashboards, Doc 05 §7 post-login landing). This module owns **no tables** —
it composes counts and small recent-activity lists over other modules' tables,
always under `db.withRequestContext` so RLS is the real scope gate:

- `getMyOrgRoles(session, orgId)` — the caller's own active org role keys, used
  by `/dashboard` to pick which dashboard to render (owner vs coach).
- `getOwnerDashboard(session, orgId)` — org-wide KPIs (members, students,
  batches, today's sessions, outstanding fees, collected this month, pending
  join requests / payment proofs / leads) + recent enrollments + today's
  sessions. Every figure is naturally scoped to what the caller can read; an
  Owner/Org Admin reads the whole org, a Branch Admin only their branch.
- `getCoachDashboard(session, orgId)` — coach-focused KPIs over `my_batch_ids()`
  (assigned batches, today's sessions, roster size, pending attendance reviews,
  progress entries logged this month) + per-batch today schedule.

Cross-org / platform aggregation for the Super Admin dashboard lives in
`@abhyas/module-platform-admin` (`getPlatformDashboard`) — it needs the
service-role + `assertPlatformPerm` pattern that whole file already owns, so it
stays there rather than being duplicated here.

SQL is built into module-level string constants (Doc 13 §9 A03 lint rule) — every
`${}` is a static column list, never a value; values flow through the params array.
