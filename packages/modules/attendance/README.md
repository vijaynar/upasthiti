# @abhyas/module-attendance

**Target phase:** Phase 8 — Attendance
**Scope:** face_enrollments (128-dim, see schema comment on future 512-dim path), attendance_events, attendance_review_queue, staff_attendance_events (M6, Doc 07 §8)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
