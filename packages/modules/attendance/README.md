# @abhyas/module-attendance

**Status:** ✅ Phase 8 done.
**Scope:** face_enrollments (128-dim, see migration 0010's header on the
future 512-dim path), attendance_events, attendance_review_queue,
staff_attendance_events (Doc 07 §8 + §21.2), face matching (`match_face()`,
session-org-scoped, fixes a real V1 gap — see migration 0010's header),
grace-period absence evaluation, and the consent-withdrawal embedding purge
job. See IMPLEMENTATION_STATUS.md's Phase 8 section for the full detail.

Owns its own tables (`supabase/migrations/0010_attendance.sql`, RLS in the
same file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.

Two background jobs registered in `apps/worker/src/registry.ts`:
`attendance.evaluate_absences` (5-min cadence) and
`attendance.purge_withdrawn_face_embeddings` (6h cadence). Both are
idempotently bootstrapped from `enrollFace`/`recordAttendance` rather than
needing another module to know about them.
