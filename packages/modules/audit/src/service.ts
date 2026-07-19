// audit module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: audit_log; written by every privileged action across all modules, not a standalone feature (M15, Doc 07 §16)
// Target phase: Phase 4+ — cross-cutting (see the implementation roadmap).

export {};
