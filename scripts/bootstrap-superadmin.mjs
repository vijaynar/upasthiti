#!/usr/bin/env node
// Grants the seed Super Admin platform role (Doc 02 §9, Doc 07 §5) to an
// already-existing V2 identity. Deliberately NOT a user-creation script —
// V2 has no admin-create-user path (unlike V1's old Supabase Admin API
// flow this file used to run): identities are only ever created by
// resolveOrCreateIdentity as a side effect of a real magic-link/OAuth login
// (packages/modules/identity-auth/src/service.ts). Sign in once with the
// target email through the normal /auth/login flow FIRST, then run this.
//
// The seed row (platform_role_assignments.seed = true) is protected by
// migration 0006's triggers — it can never be revoked or have its user
// deleted through the app. Refuses to run if a seed super admin already
// exists (bootstrap is a one-time action; use the platform console's role
// grant/revoke, once you're signed in as super admin, for everything after).
//
// Usage: node scripts/bootstrap-superadmin.mjs <email> [--env=.env.development.local]

import pg from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
const envArg = args.find((a) => a.startsWith('--env='));
const envFile = envArg ? envArg.slice('--env='.length) : '.env.development.local';

if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/bootstrap-superadmin.mjs <email> [--env=.env.development.local]');
  process.exit(1);
}

process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', envFile));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(`[bootstrap-superadmin] Missing DATABASE_URL in ${envFile}.`);
  process.exit(1);
}

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const existingSeed = await client.query(`select user_id from platform_role_assignments where seed = true limit 1`);
    if (existingSeed.rows.length > 0) {
      console.error(
        `[bootstrap-superadmin] A seed super admin already exists (user ${existingSeed.rows[0].user_id}). ` +
          'Grant/revoke further platform roles from the platform console (or grantPlatformRole) instead of re-running this script.'
      );
      process.exit(1);
    }

    const user = await client.query(
      `select distinct u.id, u.display_name
       from users u
       join auth_methods am on am.user_id = u.id
       where lower(am.verified_identifier) = $1 and am.verified_at is not null and u.deleted_at is null`,
      [email]
    );
    if (user.rows.length === 0) {
      console.error(
        `[bootstrap-superadmin] No verified V2 identity found for ${email}. ` +
          'Sign in once with this email via the normal magic-link/Google login flow first, then re-run this script.'
      );
      process.exit(1);
    }
    const userId = user.rows[0].id;

    const role = await client.query(`select id from roles where key = 'super_admin' and scope = 'platform'`);
    if (role.rows.length === 0) {
      console.error('[bootstrap-superadmin] super_admin platform role not found — is migration 0006 applied?');
      process.exit(1);
    }

    await client.query(
      `insert into platform_role_assignments (user_id, role_id, granted_by, seed) values ($1, $2, $1, true)`,
      [userId, role.rows[0].id]
    );

    console.log(`[bootstrap-superadmin] ${email} (user ${userId}) is now the seed Super Admin.`);
    console.log('  Sign in as usual — the platform console becomes available with this role.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[bootstrap-superadmin] Failed:', err.message);
  process.exit(1);
});
