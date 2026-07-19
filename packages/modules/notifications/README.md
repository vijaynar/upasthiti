# @abhyas/module-notifications

**Target phase:** Phase 10 — Notifications
**Scope:** notification_templates, notification_preferences, notification_deliveries; WhatsApp/SMS channels stubbed not_configured until a vendor is chosen (M8, Doc 07 §10)

Owns its own tables (created in this phase's migrations, RLS in the same
file per Doc 07 §19). `src/service.ts` is the only public surface — no
other module or app imports anything else from this package.
