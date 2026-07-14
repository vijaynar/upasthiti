// One-time script: sync all coaches' account_status based on lifecycle rules.
// Run with: node scripts/sync-coach-status.mjs

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

/**
 * Status lifecycle rules:
 *  is_active = true                                   → 'Active'
 *  is_active = false AND account_status = 'Inactive'  → keep 'Inactive'  (explicitly deactivated by admin)
 *  is_active = false AND has GovtId + Certification   → 'Pending Verification'
 *  is_active = false AND has some docs                → 'Document Upload Pending'
 *  is_active = false AND no docs at all               → 'Onboarding'
 *
 * Document type mapping (as stored in coach_documents.document_type):
 *   Government ID   ← Aadhaar Card, PAN Card
 *   Certification   ← Qualification Certificate, NIS Certification
 *   Resume          ← Experience Certificate
 */

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function run() {
  console.log('🔍 Fetching all coaches...');

  // 1. Fetch all users with role=coach + their coaches profile
  const { data: coachUsers, error: usersErr } = await db
    .from('users')
    .select('id, is_active, email, first_name, last_name, coach_profile:coaches(account_status)')
    .eq('role', 'coach');

  if (usersErr) {
    console.error('❌ Failed to fetch coaches:', usersErr.message);
    process.exit(1);
  }

  console.log(`   Found ${coachUsers.length} coaches.`);

  // 2. Fetch all coach_documents
  const coachIds = coachUsers.map((u) => u.id);
  const { data: allDocs, error: docsErr } = await db
    .from('coach_documents')
    .select('coach_id, document_type, document_name, verification_status')
    .in('coach_id', coachIds);

  if (docsErr) {
    console.error('❌ Failed to fetch documents:', docsErr.message);
    process.exit(1);
  }

  // Group docs by coach_id
  const docsByCoach = {};
  for (const doc of allDocs ?? []) {
    if (!docsByCoach[doc.coach_id]) docsByCoach[doc.coach_id] = [];
    docsByCoach[doc.coach_id].push(doc);
  }

  // 3. Determine and apply correct status for each coach
  let changed = 0;
  let skipped = 0;
  const changes = [];

  for (const coachUser of coachUsers) {
    const coachProfile = Array.isArray(coachUser.coach_profile)
      ? coachUser.coach_profile[0]
      : coachUser.coach_profile;

    if (!coachProfile) {
      console.warn(`  ⚠️  No coaches row for user ${coachUser.email} — skipping`);
      skipped++;
      continue;
    }

    const currentStatus = coachProfile.account_status ?? 'Onboarding';
    let targetStatus;

    if (coachUser.is_active) {
      targetStatus = 'Active';
    } else if (currentStatus === 'Inactive') {
      // Explicitly deactivated by admin — preserve
      targetStatus = 'Inactive';
    } else {
      const docs = docsByCoach[coachUser.id] ?? [];
      const hasGovtId = docs.some((d) => d.document_type === 'Government ID');
      const hasCertification = docs.some((d) => d.document_type === 'Certification');
      const hasDocs = docs.length > 0;

      if (hasGovtId && hasCertification) {
        targetStatus = 'Pending Verification';
      } else if (hasDocs) {
        targetStatus = 'Document Upload Pending';
      } else {
        targetStatus = 'Onboarding';
      }
    }

    if (targetStatus === currentStatus) {
      console.log(`  ✓  ${coachUser.first_name} ${coachUser.last_name} — already '${currentStatus}'`);
      skipped++;
      continue;
    }

    // Apply update
    const { error: updateErr } = await db
      .from('coaches')
      .update({ account_status: targetStatus })
      .eq('id', coachUser.id);

    if (updateErr) {
      console.error(`  ❌ Failed to update ${coachUser.email}: ${updateErr.message}`);
    } else {
      console.log(`  ✅ ${coachUser.first_name} ${coachUser.last_name} — '${currentStatus}' → '${targetStatus}'`);
      changes.push({ name: `${coachUser.first_name} ${coachUser.last_name}`, from: currentStatus, to: targetStatus });
      changed++;
    }
  }

  console.log('\n── Summary ─────────────────────────────────────');
  console.log(`   Total coaches : ${coachUsers.length}`);
  console.log(`   Updated       : ${changed}`);
  console.log(`   Unchanged     : ${skipped}`);
  if (changes.length > 0) {
    console.log('\n   Changes:');
    for (const c of changes) {
      console.log(`     ${c.name}: ${c.from} → ${c.to}`);
    }
  }
  console.log('─────────────────────────────────────────────────\n');
  console.log('✅ Done.');
}

run();
