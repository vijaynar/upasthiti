# @abhyas/module-audit

**Target phase:** Phase 4+ — cross-cutting
**Scope:** audit_log; written by every privileged action across all modules, not a standalone feature (M15, Doc 07 §16)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
