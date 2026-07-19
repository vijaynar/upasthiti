// platform-admin module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: org lifecycle, feature flags, announcements, plans, subscriptions (M14, Doc 07 §15)
// Target phase: Phase 5 — Platform Administration (see the implementation roadmap).

export {};
