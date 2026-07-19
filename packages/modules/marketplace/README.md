# @abhyas/module-marketplace

**Target phase:** Phase 11 — Marketplace
**Scope:** listings, leads, reviews, taxonomy, geography, referrals (M9, Doc 07 §11)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
