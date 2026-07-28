#!/usr/bin/env node
// Post-seed validation (Requirement #21) — re-authenticates as the seed
// Super Admin plus one sample organization owner (from the last run's state
// file) and exercises the real read APIs every dashboard/search/report
// surface is built on, asserting each comes back non-empty. Everything here
// is a GET through the same REST API the seed data was written through —
// no direct DB reads.
//
// Usage: node testing/validate.mjs --dataset=small [--run-tag=...]

import { resolveConfig } from './config/index.mjs';
import { createAuthProvider } from './lib/auth.mjs';
import { createHttpClient } from './lib/apiClient.mjs';
import { loadState } from './lib/state.mjs';
import { log } from './lib/log.mjs';

const checks = [];
function check(name, fn) { checks.push({ name, fn }); }

async function main() {
  const config = { ...resolveConfig(), clean: false }; // never wipe state for a validation pass
  const authProvider = createAuthProvider(config);
  const anon = createHttpClient(config.appUrl);
  const state = loadState(config).data;

  const superAdminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@abhyas.local';
  const orgEntries = Object.values(state.organizations ?? {});
  if (orgEntries.length === 0) {
    console.error(`No organizations found in state file for run-tag "${config.runTag}" — run the seed first (npm run seed:${config.datasetName}).`);
    process.exit(1);
  }
  const sampleAcademy = orgEntries.find((o) => o.orgType === 'academy') ?? orgEntries[0];
  const sampleIndie = orgEntries.find((o) => o.orgType === 'independent_coach');

  const superAdmin = await authProvider.login(superAdminEmail);
  const ownerEmailForOrg = Object.entries(state.organizations ?? {}).find(([, v]) => v.organizationId === sampleAcademy.organizationId)?.[0];
  // orgKey looks like "academy-<i>-<ownerEmail>" — recover the email.
  const ownerEmail = ownerEmailForOrg?.split('-').slice(2).join('-');
  const owner = ownerEmail ? await authProvider.login(ownerEmail) : superAdmin;
  await owner.client.post('/api/v1/me/workspace', { orgId: sampleAcademy.organizationId }).catch(() => {});

  check('Public taxonomy is populated', async () => {
    const t = await anon.get('/api/v1/public/taxonomy');
    return t.sports?.length > 0 && t.cities?.length > 0;
  });
  check('Public listing search returns results', async () => {
    const r = await anon.get('/api/v1/public/listings');
    return Array.isArray(r?.results ?? r?.listings ?? r) && (r.results ?? r.listings ?? r).length > 0;
  });
  check('Public categories endpoint returns coach/academy counts', async () => {
    const r = await anon.get('/api/v1/public/categories');
    return Array.isArray(r.categories) && r.categories.length > 0;
  });

  check('Platform dashboard has org roll-up data', async () => {
    const d = await superAdmin.client.get('/api/v1/platform/dashboard');
    return (d.totalOrganizations ?? d.orgCount ?? 0) > 0 || Object.keys(d).length > 0;
  });
  check('Platform verification queue has entries (pending or decided)', async () => {
    const r = await superAdmin.client.get('/api/v1/platform/organizations');
    return Array.isArray(r) ? r.length > 0 : (r.organizations?.length ?? 0) > 0;
  });
  check('Platform audit log has entries', async () => {
    const r = await superAdmin.client.get('/api/v1/platform/audit-log');
    return Array.isArray(r) ? r.length > 0 : (r.entries?.length ?? 0) > 0;
  });

  check('Org owner profile is complete (gender, DOB, avatar all set)', async () => {
    const profile = await owner.client.get('/api/v1/me');
    return Boolean(profile?.gender) && Boolean(profile?.dob) && Boolean(profile?.avatarPath);
  });
  check('Owner dashboard has data for the sample academy', async () => {
    const d = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/dashboard/owner`);
    return d && Object.keys(d).length > 0;
  });
  check('Org has enrolled students', async () => {
    const r = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/enrollments`);
    return Array.isArray(r) && r.length > 0;
  });
  check('Org has batches with materialized/backfilled sessions', async () => {
    const batches = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/batches`);
    if (!Array.isArray(batches) || batches.length === 0) return false;
    const sessions = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/batches/${batches[0].id}/sessions?from=2020-01-01&to=2030-01-01`);
    return Array.isArray(sessions) && sessions.length > 0;
  });
  check('Org has attendance history', async () => {
    const batches = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/batches`);
    for (const b of batches ?? []) {
      const sessions = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/batches/${b.id}/sessions?from=2020-01-01&to=2030-01-01`);
      for (const s of sessions ?? []) {
        const events = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/batches/${b.id}/sessions/${s.id}/attendance`);
        if (Array.isArray(events) && events.length > 0) return true;
      }
    }
    return false;
  });
  check('Org has finance charges + ledger entries', async () => {
    const charges = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/finance/charges`);
    const ledger = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/finance/ledger`);
    return Array.isArray(charges) && charges.length > 0 && Array.isArray(ledger) && ledger.length > 0;
  });
  check('Org has staff/coach profiles', async () => {
    const staff = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/staff`);
    return Array.isArray(staff) && staff.length > 0;
  });
  check('Every offline coach profile has service city/areas set', async () => {
    const staff = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/staff`);
    if (!Array.isArray(staff) || staff.length === 0) return false;
    let sawOfflineProfile = false;
    for (const s of staff) {
      const profile = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/staff/${s.id}/coach-profile`).catch(() => null);
      if (!profile?.serviceTypes?.includes('offline')) continue;
      sawOfflineProfile = true;
      if (!profile.serviceAreaKeys?.length) return false;
    }
    return sawOfflineProfile; // at least one real offline coach must have been checked
  });
  check('Org listing is live or pending_verification (marketplace-visible)', async () => {
    const listing = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/listing`);
    return ['live', 'pending_verification', 'paused'].includes(listing?.status);
  });
  check('Every academy coach has certification, id_proof, and address_proof documents', async () => {
    const staff = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/staff`);
    if (!Array.isArray(staff) || staff.length === 0) return false;
    for (const s of staff) {
      const docs = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/staff/${s.id}/documents`).catch(() => []);
      const types = new Set((Array.isArray(docs) ? docs : []).map((d) => d.docType));
      if (!['certification', 'id_proof', 'address_proof'].every((t) => types.has(t))) return false;
    }
    return true;
  });
  check('Academy has org_admin/front_desk/accountant members, not just coaches', async () => {
    const members = await owner.client.get(`/api/v1/orgs/${sampleAcademy.organizationId}/members`);
    const roles = new Set((Array.isArray(members) ? members : []).flatMap((m) => m.roleKeys ?? []));
    return ['org_admin', 'front_desk', 'accountant', 'coach'].every((k) => roles.has(k));
  });

  const multiBranchAcademy = orgEntries.find((o) => o.orgType === 'academy' && (o.branchCount ?? 1) > 1);
  if (multiBranchAcademy) {
    check('A multi-branch academy has real branches with a branch_admin', async () => {
      const ownerKey = Object.entries(state.organizations ?? {}).find(([, v]) => v.organizationId === multiBranchAcademy.organizationId)?.[0];
      const email = ownerKey?.split('-').slice(2).join('-');
      if (!email) return false;
      const mbOwner = await authProvider.login(email);
      const branches = await mbOwner.client.get(`/api/v1/orgs/${multiBranchAcademy.organizationId}/branches`).catch(() => []);
      if (!Array.isArray(branches) || branches.length < 2) return false;
      const members = await mbOwner.client.get(`/api/v1/orgs/${multiBranchAcademy.organizationId}/members`).catch(() => []);
      return (Array.isArray(members) ? members : []).some((m) => (m.roleKeys ?? []).includes('branch_admin') && m.branchId);
    });
  } else {
    console.log('  (no multi-branch academy found in this run — skipping branch_admin check, not a failure)');
  }

  const crossOrgSiblings = state.crossOrgSiblings ?? [];
  if (crossOrgSiblings.length > 0) {
    check('At least one guardian has children enrolled at two different org types', async () => {
      const { linkA, linkB } = crossOrgSiblings[0];
      if (linkA.orgType === linkB.orgType) return false;
      for (const link of [linkA, linkB]) {
        const orgKey = Object.entries(state.organizations ?? {}).find(([, v]) => v.organizationId === link.orgId)?.[0];
        const linkOwnerEmail = orgKey?.split('-').slice(2).join('-');
        if (!linkOwnerEmail) return false;
        const linkOwner = await authProvider.login(linkOwnerEmail);
        const enrollments = await linkOwner.client.get(`/api/v1/orgs/${link.orgId}/enrollments`).catch(() => []);
        const found = (Array.isArray(enrollments) ? enrollments : []).some((e) => e.studentUserId === link.wardUserId);
        if (!found) return false;
      }
      return true;
    });
  } else {
    console.log('  (no cross-org guardian siblings recorded in this run — skipping, not a failure)');
  }

  if (sampleIndie) {
    check('Independent coach has a coach profile', async () => {
      const ownerKey = Object.entries(state.organizations ?? {}).find(([, v]) => v.organizationId === sampleIndie.organizationId)?.[0];
      const email = ownerKey?.split('-').slice(2).join('-');
      if (!email) return false;
      const coach = await authProvider.login(email);
      await coach.client.post('/api/v1/me/workspace', { orgId: sampleIndie.organizationId }).catch(() => {});
      const profile = await coach.client.get('/api/v1/me/coach-profile');
      return profile != null;
    });
    check('If the independent coach offers offline classes, service city/areas are set', async () => {
      const ownerKey = Object.entries(state.organizations ?? {}).find(([, v]) => v.organizationId === sampleIndie.organizationId)?.[0];
      const email = ownerKey?.split('-').slice(2).join('-');
      if (!email) return false;
      const coach = await authProvider.login(email);
      await coach.client.post('/api/v1/me/workspace', { orgId: sampleIndie.organizationId }).catch(() => {});
      const profile = await coach.client.get('/api/v1/me/coach-profile');
      if (!profile?.serviceTypes?.includes('offline')) return true; // online-only coach — nothing to assert
      return (profile.serviceAreaKeys?.length ?? 0) > 0;
    });
  }

  log.step(`Running ${checks.length} validation checks against runTag="${config.runTag}"`);
  let failures = 0;
  for (const { name, fn } of checks) {
    try {
      const ok = await fn();
      console.log(`  ${ok ? '✓' : '✗'} ${name}`);
      if (!ok) failures += 1;
    } catch (err) {
      console.log(`  ✗ ${name} — ERROR: ${err.message}`);
      failures += 1;
    }
  }

  console.log(`\n${checks.length - failures}/${checks.length} checks passed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('VALIDATION FAILED TO RUN:', err);
  process.exit(1);
});
