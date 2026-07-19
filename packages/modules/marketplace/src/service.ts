// marketplace module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: listings, leads, reviews, taxonomy, geography, referrals (M9, Doc 07 §11)
// Target phase: Phase 11 — Marketplace (see the implementation roadmap).

export {};
