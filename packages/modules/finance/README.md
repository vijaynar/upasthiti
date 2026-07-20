# @abhyas/module-finance

**Target phase:** Phase 9 — Finance & Ledger
**Scope:** fee_policies, charges, payments, payment_allocations, ledger_accounts, ledger_entries, payouts, org_bank_accounts (Doc 07 §9, migration 0011)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.

`assessFine()` is the real consumer of `attendance.absence_confirmed`
(Doc 14 §2 rule 2) — apps/worker wires it via `ABSENCE_CONFIRMED_JOB_KIND`.
See migration 0011's header for the scope decisions this module assumes
(no automated recurring charge generation, `payments.method = 'gateway'`
schema-complete but not wired, ledger only books the settlement leg).
