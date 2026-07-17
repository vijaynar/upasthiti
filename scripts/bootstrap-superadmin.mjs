// One-time bootstrap: create the first real superadmin account on a NEW
// staging/production Supabase project. Uses the Admin API (not raw SQL) so
// email confirmation and identity provisioning are handled correctly by
// GoTrue itself. No password is set — the app only supports magic-link
// and Google OAuth login, so the account signs in the same way any user
// does: request a magic link for this email.
//
// Run with: node scripts/bootstrap-superadmin.mjs --staging   (or --prod)
// Prompts interactively, or set ADMIN_EMAIL (and optionally ADMIN_FIRST_NAME/
// ADMIN_LAST_NAME) env vars to skip the prompts for scripted runs.

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';

const DEFAULT_TENANT_ID = '022c1494-057e-4c80-80dd-88fa4b1287b5'; // VidyaSopan Sports school

const isProd = process.argv.includes('--prod');
const isStaging = process.argv.includes('--staging');

if (!isProd && !isStaging) {
  console.error('❌ Refusing to run without an explicit target. Pass --staging or --prod.');
  console.error('   (This script creates real login credentials — never run it against local Supabase.)');
  process.exit(1);
}

const envFile = isProd ? '../.env.production.local' : '../.env.staging.local';
process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), envFile));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(`❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
  process.exit(1);
}

console.warn(`⚠️  Bootstrapping a superadmin on ${isProd ? 'PRODUCTION' : 'STAGING'} (${SUPABASE_URL}).\n`);

let email = process.env.ADMIN_EMAIL?.trim();
let firstName = process.env.ADMIN_FIRST_NAME?.trim();
let lastName = process.env.ADMIN_LAST_NAME?.trim();

if (!email) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  email = (await rl.question('Admin email: ')).trim();
  firstName = (await rl.question('First name: ')).trim();
  lastName = (await rl.question('Last name: ')).trim();
  rl.close();
}
firstName ||= 'Admin';
lastName ||= '';

if (!email.includes('@')) {
  console.error('❌ Invalid email.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: created, error: createErr } = await db.auth.admin.createUser({
  email,
  email_confirm: true,
  app_metadata: { role: 'superadmin', tenant_id: DEFAULT_TENANT_ID },
  user_metadata: { first_name: firstName, last_name: lastName },
});

if (createErr) {
  console.error('❌ Failed to create user:', createErr.message);
  process.exit(1);
}

const userId = created.user.id;
console.log(`✅ Auth user created: ${userId}`);

// trg_sync_auth_user_profile (0004) auto-creates the public.users row on
// insert. Widen it to the same active-role/available-roles pattern used
// for the existing production admin account.
const { error: updateErr } = await db
  .from('users')
  .update({ role: 'admin', available_roles: ['superadmin', 'admin'] })
  .eq('id', userId);

if (updateErr) {
  console.error('❌ User created, but failed to set admin role:', updateErr.message);
  process.exit(1);
}

console.log(`✅ ${email} is now superadmin/admin for tenant ${DEFAULT_TENANT_ID}.`);
console.log('   Sign in at /auth/login with this email — it uses the same magic-link flow as any other account.');
