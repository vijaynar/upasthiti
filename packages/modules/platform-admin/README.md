# @abhyas/module-platform-admin

**Target phase:** Phase 5 — Platform Administration
**Scope:** org lifecycle, feature flags, announcements, plans, subscriptions (M14, Doc 07 §15)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
