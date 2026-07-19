// progress module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: metric_definitions, progress_entries (M11, Doc 07 §13)
// Target phase: Phase 13 — Progress & Performance (see the implementation roadmap).

export {};
