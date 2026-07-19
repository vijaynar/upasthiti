# @abhyas/module-people

**Target phase:** Phase 6 — People & Enrollment
**Scope:** enrollments, batch_enrollments, join-request approval workflows (M4, Doc 07 §6)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
