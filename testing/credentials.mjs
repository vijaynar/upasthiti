#!/usr/bin/env node
// Login-reference export (Requirement: "output a creds table... to login
// manually and check") — reads the `actors` list orchestrate.mjs records
// into the run's state file and prints/exports it as a filterable table.
//
// This app has NO passwords (Google OAuth + email magic-link only, a
// deliberate v1 scope decision — see repo root IMPLEMENTATION_STATUS.md).
// There is therefore nothing to export except identities: email, name,
// role, and org context. To actually log in as one: go to /auth/login,
// enter the email, then fetch the magic link from Mailpit
// (http://127.0.0.1:54324 locally, see README's "Auth bootstrap" section)
// and click it — identical to what a real user does.
//
// Usage:
//   node testing/credentials.mjs --dataset=small
//   node testing/credentials.mjs --dataset=small --role=coach --type=academy
//   node testing/credentials.mjs --dataset=small --org=some-academy-1234
//   node testing/credentials.mjs --dataset=small --format=csv --out=actors.csv
//   node testing/credentials.mjs --dataset=small --limit=20
//   node testing/credentials.mjs --dataset=small --live   # see "--live" below

import fs from 'node:fs';
import { resolveConfig } from './config/index.mjs';
import { createAuthProvider } from './lib/auth.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { log } from './lib/log.mjs';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    out[key] = rest.length ? rest.join('=') : true;
  }
  return out;
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(actors) {
  const header = 'email,name,role,type,orgSlug,organizationId';
  const rows = actors.map((a) =>
    [a.email, a.name, a.role, a.type, a.orgSlug ?? '', a.organizationId ?? ''].map(csvEscape).join(',')
  );
  return [header, ...rows].join('\n');
}

// Our own seed emails are always `firstname.lastname.<tag>@domain` (see
// lib/fakeData.mjs's emailFor) — reliable enough to recover a readable name
// when the real recorded displayName isn't available live (see "--live" below).
function deriveNameFromEmail(email) {
  const local = email.split('@')[0] ?? email;
  const [first, last] = local.split('.');
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  return first && last ? `${cap(first)} ${cap(last)}` : local;
}

// Reconstructs `state.actors` from the LIVE app (real API calls, real
// magic-link logins) for a state file that predates actor tracking, or that
// otherwise has gaps — then writes the result back to disk so future runs
// (with or without --live) see it. What's recoverable and what isn't:
//
//   - Org owners: email is embedded in the org's own state-file key
//     (`academy-<i>-<ownerEmail>`), no live call needed.
//   - Invited org members (coach/assistant_coach/org_admin/front_desk/
//     accountant/branch_admin/sub-coach): `GET /orgs/{id}/invitations`
//     never expires/disappears after acceptance, and is the ONLY place this
//     app exposes a member's email back to anyone but themselves — so this
//     is a real API call, not a workaround. Only ACCEPTED invitations are
//     used (an unaccepted one means nobody ever actually logged in).
//   - Platform staff + Super Admin: already fully known from disk
//     (`state.platformStaff`), no live call needed.
//   - Guardians and self-account students: NOT recoverable. No org-scoped
//     API exposes their email to anyone but themselves — this app
//     deliberately has no "list every user's email" endpoint (privacy/RLS).
//     Their rows stay missing until a fresh `--clean` seed run recreates
//     them with actor-tracking on.
//
// Exact original display names aren't recoverable from `--live` either (the
// invitation record only carries the target email) — names are derived from
// the email's own firstname.lastname shape instead, and clearly won't match
// a hand-typed real name if one was ever set after signup.
async function reconstructFromLive(config, state) {
  const orgEntries = Object.entries(state.organizations ?? {});
  if (orgEntries.length === 0) {
    console.error(`No organizations at all in the state file for run-tag "${config.runTag}" — nothing to reconstruct. Run the seed first.`);
    process.exit(1);
  }

  const authProvider = createAuthProvider(config);
  const byEmail = new Map((state.actors ?? []).map((a) => [a.email, a]));
  // Merges into one row per email (same logic as orchestrate.mjs's
  // recordActor) — an invitation's roleKeys can itself carry more than one
  // role, and a reconstructed identity might already have a disk-recorded
  // role too; either way the credentials table shows one comma-joined row.
  const mergeActor = ({ email, name, role, type, orgSlug, organizationId }) => {
    const existing = byEmail.get(email);
    if (existing) {
      const roles = new Set(existing.role.split(',').map((r) => r.trim()).filter(Boolean));
      for (const r of role.split(',')) roles.add(r.trim());
      existing.role = [...roles].join(',');
      return;
    }
    byEmail.set(email, { email, name, role, type, orgSlug: orgSlug ?? null, organizationId: organizationId ?? null });
  };

  const superAdminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@abhyas.local';
  mergeActor({ email: superAdminEmail, name: 'Super Admin (seed)', role: 'super_admin', type: 'platform', orgSlug: null, organizationId: null });
  for (const [key, info] of Object.entries(state.platformStaff ?? {})) {
    const email = info.email ?? key; // older state files keyed platformStaff by email directly
    mergeActor({ email, name: deriveNameFromEmail(email), role: info.roleKey, type: 'platform', orgSlug: null, organizationId: null });
  }

  log.step(`Reconstructing org membership from the live app for ${orgEntries.length} organizations (real magic-link logins — this can take a while)...`);
  let done = 0;
  for (const [orgKey, org] of orgEntries) {
    done += 1;
    const ownerEmail = orgKey.split('-').slice(2).join('-');
    if (!ownerEmail) {
      log.warn(`Could not recover an owner email from org key "${orgKey}" — skipping this org entirely.`);
      continue;
    }
    mergeActor({ email: ownerEmail, name: deriveNameFromEmail(ownerEmail), role: 'owner', type: org.orgType, orgSlug: org.slug, organizationId: org.organizationId });

    try {
      const owner = await authProvider.login(ownerEmail);
      const invitations = await owner.client.get(`/api/v1/orgs/${org.organizationId}/invitations`);
      for (const inv of Array.isArray(invitations) ? invitations : []) {
        if (!inv.email || !inv.acceptedAt) continue; // unaccepted/phone-only — no real login exists for it
        mergeActor({
          email: inv.email,
          name: deriveNameFromEmail(inv.email),
          role: inv.roleKeys?.length ? inv.roleKeys.join(',') : 'member',
          type: org.orgType,
          orgSlug: org.slug,
          organizationId: org.organizationId,
        });
      }
    } catch (err) {
      log.warn(`${orgKey}: ${err.message}`);
    }
    if (done % 10 === 0 || done === orgEntries.length) log.progress('orgs scanned', done, orgEntries.length);
  }

  state.actors = [...byEmail.values()];
  log.info(
    'Guardians and self-account students could NOT be reconstructed (no org-scoped API exposes their email) — ' +
    'only owners, invited staff, and platform staff are recoverable this way. A fresh --clean seed run is the ' +
    'only way to recover those too.'
  );
  return state;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = { ...resolveConfig(), clean: false }; // never wipe state for a read-only export
  const loaded = loadState(config);
  let state = loaded.data;

  if (args.live) {
    state = await reconstructFromLive(config, state);
    saveState(config, { file: loaded.file, data: state });
    log.info(`Wrote reconstructed actors back to ${loaded.file} — future runs (with or without --live) will see them.`);
  }

  let actors = state.actors ?? [];
  if (actors.length === 0) {
    console.error(
      `No actors recorded in the state file for run-tag "${config.runTag}". Either the seed hasn't run yet, or ` +
      `it predates actor tracking — pass --live to reconstruct what's recoverable from the running app (owners + ` +
      `invited staff; guardians/students need a fresh --clean seed).`
    );
    process.exit(1);
  }

  if (args.role) actors = actors.filter((a) => a.role === args.role);
  if (args.type) actors = actors.filter((a) => a.type === args.type);
  if (args.org) actors = actors.filter((a) => a.orgSlug === args.org);
  if (args.limit) actors = actors.slice(0, Number(args.limit));

  if (actors.length === 0) {
    console.error('No actors match that filter.');
    process.exit(1);
  }

  const format = args.format ?? 'table';
  if (format === 'csv') {
    const csv = toCsv(actors);
    if (args.out) {
      fs.writeFileSync(args.out, csv);
      console.log(`Wrote ${actors.length} rows to ${args.out}`);
    } else {
      console.log(csv);
    }
    return;
  }

  console.table(actors.map((a) => ({ email: a.email, name: a.name, role: a.role, type: a.type, org: a.orgSlug ?? '' })));
  console.log(`\n${actors.length} identities (of ${(state.actors ?? []).length} total this run) — filters: --role= --type= --org= --limit= --format=csv --out=<file> --live`);
  console.log('No passwords exist in this app — sign in at /auth/login with any email above, then fetch the magic link from Mailpit (http://127.0.0.1:54324 locally).');
}

main().catch((err) => {
  console.error('CREDENTIALS EXPORT FAILED:', err);
  process.exit(1);
});
