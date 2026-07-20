import type { i18n } from '@abhyas/kernel';
import { sendEmail } from './channels/email';
import { sendPush, type PushSubscriptionKeys } from './channels/push';
import { sendWhatsApp } from './channels/whatsapp';
import { sendSms } from './channels/sms';

// platform/notify — transport-only send() (Doc 14 §7, Doc 08 §13). Phase 1
// pre-declared this as `send(channel, templateKey, language, recipientUserId,
// variables)`, coupling template/recipient lookup (notification_templates,
// users, auth_methods, push_subscriptions — tables owned by other modules,
// per Doc 14 §2 "modules own their tables") into the platform layer. That
// design was never implemented (Phase 1's comment: "Full schema and dispatch
// pipeline land in Phase 10") — this phase replaces it with a plain
// discriminated-union transport call: the caller
// (@abhyas/module-notifications) resolves the template, renders the body,
// and looks up the recipient's contact info/subscription itself (same
// "read across module boundaries via direct SQL" precedent Attendance/
// Finance already set for scheduling's tables), then hands this layer
// only what it needs to actually attempt delivery.

export type NotificationChannel = 'whatsapp' | 'sms' | 'email' | 'push';
export type SupportedLanguage = i18n.SupportedLanguage;

export interface SendResult {
  status: 'sent' | 'failed' | 'not_configured';
  providerRef?: string;
  error?: string;
}

export type NotifyTarget =
  | { channel: 'email'; to: string; subject: string; body: string }
  | { channel: 'push'; subscription: PushSubscriptionKeys; title: string; body: string }
  | { channel: 'whatsapp'; to: string; templateKey: string; language: SupportedLanguage; variables: Record<string, unknown> }
  | { channel: 'sms'; to: string; body: string };

export async function send(target: NotifyTarget): Promise<SendResult> {
  switch (target.channel) {
    case 'email':
      return sendEmail(target);
    case 'push':
      return sendPush(target);
    case 'whatsapp':
      return sendWhatsApp();
    case 'sms':
      return sendSms();
  }
}
