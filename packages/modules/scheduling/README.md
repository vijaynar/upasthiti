# @abhyas/module-scheduling

**Phase 7 — Scheduling: ✅ DONE** (see IMPLEMENTATION_STATUS.md)
**Scope:** programs, batches, class_sessions, holidays (Doc 07 §7, migration
0009), plus `batch_enrollments` (Doc 07 §6) and `coach_assignments`' write
path (both deferred into this phase for lack of a `batches` table).

Owns its own tables (migration 0009, RLS in the same file). `src/service.ts`
is the only public surface — no other module or app imports anything else
from this package. `src/tz.ts` is an internal helper (zoned-time -> UTC
conversion for `materializeSessions`), not re-exported.
