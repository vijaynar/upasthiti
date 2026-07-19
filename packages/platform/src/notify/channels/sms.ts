import type { SendResult } from '../index';

// Stub channel adapter — no SMS/DLT vendor configured yet
// (docsV2/14_cloud_architecture.md §15 open question). Wired to the same
// NotifyAdapter interface so enabling it later is a config change.
export async function sendSms(): Promise<SendResult> {
  return { status: 'not_configured', error: 'SMS vendor not yet configured' };
}
