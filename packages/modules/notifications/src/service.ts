// notifications module — public API (Doc 14 §2). Surfaces and other modules call
// only the functions exported here, never this module's tables directly;
// cross-module effects go through @abhyas/platform's queue (event-driven)
// rather than a direct table write.
//
// Scope: notification_templates, notification_preferences, notification_deliveries; WhatsApp/SMS channels stubbed not_configured until a vendor is chosen (M8, Doc 07 §10)
// Target phase: Phase 10 — Notifications (see the implementation roadmap).

export {};
