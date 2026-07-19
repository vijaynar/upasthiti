# @abhyas/module-medical

**Target phase:** Phase 14 — schema-only (no UI/API in v1)
**Scope:** medical_records, medical_access_grants; reserved directory, no module code beyond schema + KMS plumbing (M12, Doc 07 §14)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
