// scheduling module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: programs, batches, class_sessions, holidays (M5, Doc 07 §7)
// Target phase: Phase 7 — Scheduling & Batches (see the implementation roadmap).

export {};
