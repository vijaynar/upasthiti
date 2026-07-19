// finance module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: fee_policies, charges, payments, payment_allocations, ledger_accounts, ledger_entries, payouts (M7, Doc 07 §9)
// Target phase: Phase 9 — Finance & Ledger (see the implementation roadmap).

export {};
