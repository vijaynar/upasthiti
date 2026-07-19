// medical module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: medical_records, medical_access_grants; reserved directory, no module code beyond schema + KMS plumbing (M12, Doc 07 §14)
// Target phase: Phase 14 — schema-only (no UI/API in v1) (see the implementation roadmap).

export {};
