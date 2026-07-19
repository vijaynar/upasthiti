import type { SendResult } from '../index';

// Stub channel adapter — no WhatsApp BSP vendor configured yet
// (docsV2/14_cloud_architecture.md §15 open question). Wired to the same
// NotifyAdapter interface so enabling it later (platform settings, Doc 08
// `/platform/settings/messaging`) is a config change, not a code change.
export async function sendWhatsApp(): Promise<SendResult> {
  return { status: 'not_configured', error: 'WhatsApp BSP vendor not yet configured' };
}
