// platform/notify — send(channel, template, lang, vars) (Doc 14 §7, Doc 08 §13).
// Full schema (notification_templates/preferences/deliveries) and the
// dispatch pipeline land in Phase 10.
//
// Scope decision (2026-07-19): WhatsApp and SMS have no vendor configured
// yet. Their channel adapters are implemented against this same interface
// but return `{ status: 'not_configured' }` — callers and UI (template
// editor, preference toggles) must treat that status as "channel exists in
// the model, greyed out until platform settings supplies vendor
// credentials", not as an error. Email and push are the active channels
// for v1.

export type NotificationChannel = 'whatsapp' | 'sms' | 'email' | 'push';
export type SupportedLanguage = 'en' | 'hi' | 'te';

export interface SendResult {
  status: 'sent' | 'failed' | 'not_configured';
  providerRef?: string;
  error?: string;
}

export interface NotifyAdapter {
  send(
    channel: NotificationChannel,
    templateKey: string,
    language: SupportedLanguage,
    recipientUserId: string,
    variables: Record<string, unknown>
  ): Promise<SendResult>;
}
