# @abhyas/module-progress

**Target phase:** Phase 13 — Progress & Performance
**Scope:** metric_definitions, progress_entries (M11, Doc 07 §13)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
