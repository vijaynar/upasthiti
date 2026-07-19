// identity-auth module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: users, auth_methods, sessions, otp_challenges (deferred), guardianships, consents (M1, Doc 05)
// Target phase: Phase 2 — Auth & Identity (see the implementation roadmap).

export {};
