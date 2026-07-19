# @abhyas/module-identity-auth

**Target phase:** Phase 2 — Auth & Identity
**Scope:** users, auth_methods, sessions, otp_challenges (deferred), guardianships, consents (M1, Doc 05)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
