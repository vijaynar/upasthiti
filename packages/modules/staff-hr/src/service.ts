// staff-hr module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: staff_profiles, staff_documents, staff_availability, leave_requests, payout_settings, coach onboarding paths (M10, Doc 07 §12)
// Target phase: Phase 12 — Coach & Staff HR (see the implementation roadmap).

export {};
