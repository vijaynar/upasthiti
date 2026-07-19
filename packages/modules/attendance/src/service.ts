// attendance module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: face_enrollments (128-dim, see schema comment on future 512-dim path), attendance_events, attendance_review_queue, staff_attendance_events (M6, Doc 07 §8)
// Target phase: Phase 8 — Attendance (see the implementation roadmap).

export {};
