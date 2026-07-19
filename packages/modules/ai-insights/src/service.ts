// ai-insights module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: monthly AI summaries, review-queue assistance; reserved empty directory (M13)
// Target phase: Future — product roadmap Phase 2 (post-v1) (see the implementation roadmap).

export {};
