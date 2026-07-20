# @abhyas/module-people

**Target phase:** Phase 6 — People & Enrollment
**Scope:** enrollments (Doc 07 §6, migration 0008). `batch_enrollments` is
deferred to Scheduling (Phase 7) — it FKs into `batches`, which doesn't
exist yet (see migration 0008's header). Guardianship/consent
(`addWard`/`listWards`/`captureConsent`) live in `@abhyas/module-identity-auth`,
which already owns `users`/`guardianships`/`consents` since migration 0003.

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
