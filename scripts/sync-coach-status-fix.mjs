// One-time fix: correct account_status for all non-active coaches based on documents.
// Removes the old "preserve Inactive" assumption — status is derived purely from docs & is_active.
// Run with: node scripts/sync-coach-status-fix.mjs

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Defaults to local Supabase. Pass --staging or --prod to target a hosted project.
const isProd = process.argv.includes('--prod');
const isStaging = process.argv.includes('--staging');
const envFile = isProd
  ? '../.env.production.local'
  : isStaging
    ? '../.env.staging.local'
    : '../.env.development.local';
process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), envFile));

if (isProd) {
  console.warn('⚠️  Running against PRODUCTION Supabase. Ctrl+C now to abort.\n');
} else if (isStaging) {
  console.warn('⚠️  Running against STAGING Supabase.\n');
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(`❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function run() {
  console.log('🔍 Fetching all coaches...');

  const { data: coachUsers, error: usersErr } = await db
    .from('users')
    .select('id, is_active, email, first_name, last_name, coach_profile:coaches(account_status)')
    .eq('role', 'coach');

  if (usersErr) { console.error('❌', usersErr.message); process.exit(1); }
  console.log(`   Found ${coachUsers.length} coaches.\n`);

  const coachIds = coachUsers.map((u) => u.id);
  const { data: allDocs, error: docsErr } = await db
    .from('coach_documents')
    .select('coach_id, document_type, verification_status')
    .in('coach_id', coachIds);

  if (docsErr) { console.error('❌', docsErr.message); process.exit(1); }

  const docsByCoach = {};
  for (const doc of allDocs ?? []) {
    if (!docsByCoach[doc.coach_id]) docsByCoach[doc.coach_id] = [];
    docsByCoach[doc.coach_id].push(doc);
  }

  let changed = 0, skipped = 0;

  for (const coachUser of coachUsers) {
    const coachProfile = Array.isArray(coachUser.coach_profile)
      ? coachUser.coach_profile[0]
      : coachUser.coach_profile;

    if (!coachProfile) {
      console.warn(`  ⚠️  No coaches row for ${coachUser.email} — skipping`);
      skipped++;
      continue;
    }

    const currentStatus = coachProfile.account_status ?? 'Onboarding';
    const docs = docsByCoach[coachUser.id] ?? [];
    const hasGovtId = docs.some((d) => d.document_type === 'Government ID');
    const hasCertification = docs.some((d) => d.document_type === 'Certification');

    let targetStatus;
    if (coachUser.is_active) {
      targetStatus = 'Active';
    } else if (hasGovtId && hasCertification) {
      targetStatus = 'Pending Verification';
    } else if (docs.length > 0) {
      targetStatus = 'Document Upload Pending';
    } else {
      targetStatus = 'Onboarding';
    }

    if (targetStatus === currentStatus) {
      console.log(`  ✓  ${coachUser.first_name} ${coachUser.last_name} — '${currentStatus}' (no change needed)`);
      skipped++;
      continue;
    }

    const { error: updateErr } = await db
      .from('coaches')
      .update({ account_status: targetStatus })
      .eq('id', coachUser.id);

    if (updateErr) {
      console.error(`  ❌ Failed to update ${coachUser.email}: ${updateErr.message}`);
    } else {
      console.log(`  ✅ ${coachUser.first_name} ${coachUser.last_name} — '${currentStatus}' → '${targetStatus}'`);
      changed++;
    }
  }

  console.log('\n── Summary ─────────────────────────────────────');
  console.log(`   Total    : ${coachUsers.length}`);
  console.log(`   Updated  : ${changed}`);
  console.log(`   Unchanged: ${skipped}`);
  console.log('─────────────────────────────────────────────────\n✅ Done.');
}

run();
