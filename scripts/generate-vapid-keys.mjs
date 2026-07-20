#!/usr/bin/env node
// Generates a VAPID keypair for the web-push notification channel
// (packages/platform/src/notify/channels/push.ts — Phase 10 Notifications).
// No vendor account needed, unlike WhatsApp BSP/SMS DLT/FCM — the keypair
// alone authorizes this server to push to browsers that subscribed to it.
// Writes VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY into .env.development.local,
// same shape as scripts/generate-keys.mjs's JWT keypair.
//
// Usage: npm run keys:generate:vapid [-- --force]

import webpush from 'web-push';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILE = resolve(process.cwd(), '.env.development.local');
const FORCE = process.argv.includes('--force');

function main() {
  if (!existsSync(ENV_FILE)) {
    console.error(
      `[keys:generate:vapid] ${ENV_FILE} does not exist. Run \`cp .env.example .env.development.local\` first (Doc 17 step 2).`
    );
    process.exit(1);
  }

  let contents = readFileSync(ENV_FILE, 'utf8');

  if (!FORCE && /^VAPID_PUBLIC_KEY=.+$/m.test(contents)) {
    console.log('[keys:generate:vapid] VAPID_PUBLIC_KEY already set — skipping (pass --force to rotate, which invalidates all existing browser push subscriptions).');
    return;
  }

  const { publicKey, privateKey } = webpush.generateVAPIDKeys();

  contents = setEnvVar(contents, 'VAPID_PUBLIC_KEY', publicKey);
  contents = setEnvVar(contents, 'VAPID_PRIVATE_KEY', privateKey);
  contents = setEnvVar(contents, 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', publicKey);

  writeFileSync(ENV_FILE, contents);
  console.log(`[keys:generate:vapid] Wrote a new VAPID keypair into ${ENV_FILE}.`);
}

function setEnvVar(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(contents) ? contents.replace(pattern, line) : `${contents}\n${line}\n`;
}

main();
