// Platform administration — Requirement #14. Super Admin bootstrap relies on
// the ONE pre-existing, project-sanctioned direct-DB script in this whole
// framework (scripts/bootstrap-superadmin.mjs) — not something this
// framework introduces. It exists because granting the very first platform
// role is a real chicken-and-egg problem (POST /platform/roles itself
// requires an existing platform.role.grant holder). Every platform action
// AFTER that first grant goes through the real API. See README's "Auth
// bootstrap" section for the equivalent, more-central exception (magic-link
// via Mailpit) and why direct DB writes for actual seed DATA are never used
// anywhere else in this framework.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { log, count } from '../lib/log.mjs';

export async function ensureSuperAdmin(config, authProvider, email) {
  const identity = await authProvider.login(email);
  const roles = await identity.client.get('/api/v1/me/platform-roles');
  if (roles.roles?.includes('super_admin')) {
    log.info(`Super Admin already granted to ${email}.`);
    return identity;
  }

  log.info(`Bootstrapping seed Super Admin for ${email} (one-time, scripts/bootstrap-superadmin.mjs)...`);
  const result = spawnSync(process.execPath, [path.join(config.repoRoot, 'scripts', 'bootstrap-superadmin.mjs'), email], {
    cwd: config.repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    // Most common cause: a DIFFERENT identity already holds the protected
    // seed super-admin row from a prior run. Re-check via the real API —
    // if some super admin already exists, grant this email the role for
    // real instead of failing the whole seed run.
    log.warn(`bootstrap-superadmin.mjs exited ${result.status}: ${(result.stderr || result.stdout || '').trim().split('\n').slice(-3).join(' | ')}`);
  }

  const rolesAfter = await identity.client.get('/api/v1/me/platform-roles');
  if (!rolesAfter.roles?.includes('super_admin')) {
    throw new Error(
      `Could not establish a Super Admin session for ${email}. If a seed super admin already exists under a ` +
      `different email, either grant ${email} a platform role via the real /platform console first, or set ` +
      `SEED_SUPERADMIN_EMAIL to that existing super admin's email.`
    );
  }
  count('platform.superadmin_bootstrapped');
  return identity;
}

export async function grantPlatformRole(superAdminClient, userId, roleKey) {
  const result = await superAdminClient.post('/api/v1/platform/roles', { userId, roleKey });
  count('platform.roles_granted');
  return result;
}

export async function decideOrgVerification(superAdminClient, organizationId, decision, note) {
  const result = await superAdminClient.post(`/api/v1/platform/organizations/${organizationId}/verify`, { decision, note });
  count(`platform.org_verification.${decision}`);
  return result;
}

export async function suspendOrg(superAdminClient, organizationId, action, reason) {
  return superAdminClient.post(`/api/v1/platform/organizations/${organizationId}/suspend`, { action, reason });
}

/** Enables the historical_backdating capability for one org (Owner/Org Admin can then pass createdAt/recordedAt overrides). */
export async function enableHistoricalBackdating(superAdminClient, organizationId) {
  return superAdminClient.post(`/api/v1/platform/organizations/${organizationId}/feature-flags`, {
    flagKey: 'historical_backdating',
    enabled: true,
  });
}

export async function requestSupportAccess(superAdminClient, organizationId, reason, durationHours) {
  const result = await superAdminClient.post('/api/v1/platform/support-access', { organizationId, reason, durationHours });
  count('platform.support_access_requested');
  return result;
}

export async function revokeSupportAccess(superAdminClient, grantId) {
  return superAdminClient.del(`/api/v1/platform/support-access/${grantId}`);
}

export async function createAnnouncement(superAdminClient, { audience, title, body }) {
  const result = await superAdminClient.post('/api/v1/platform/announcements', { audience, title, body });
  count('platform.announcements');
  return result;
}

export async function upsertFeatureFlag(superAdminClient, key, defaultOn, description) {
  return superAdminClient.post('/api/v1/platform/feature-flags', { key, defaultOn, description });
}
