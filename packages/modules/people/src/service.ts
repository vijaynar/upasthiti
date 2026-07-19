// people module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: enrollments, batch_enrollments, join-request approval workflows (M4, Doc 07 §6)
// Target phase: Phase 6 — People & Enrollment (see the implementation roadmap).

export {};
