import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASE_URL, loginViaMagicLink, shot, resetShotCounter } from './pw-helpers.mjs';

process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env.development.local'));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const RECEIPT_FILE = path.resolve('pw-fixtures-receipt.png');
const LOG = [];
async function step(name, fn) {
  console.log('\n>>>', name);
  try {
    await fn();
    LOG.push({ name, status: 'ok' });
    console.log('    OK');
  } catch (err) {
    LOG.push({ name, status: 'FAILED', error: String(err.message || err).slice(0, 300) });
    console.log('    FAILED:', err.message || err);
  }
}
async function logout(page) {
  try {
    const url = page.url();
    // clear supabase session by going to login after clearing storage
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await page.context().clearCookies();
  } catch {}
}

const browser = await chromium.launch();

async function newPage(category) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  resetShotCounter();
  return page;
}

// ════════════════════════════════════════════════════════════
// A. SUPERADMIN — platform administration
// ════════════════════════════════════════════════════════════
let newTenantId = null;
let newTenantSlug = 'rising-champions-multi-sport';
await step('A1. Superadmin login + academy dashboard (role=admin default)', async () => {
  const page = await newPage();
  globalThis.__page = page;
  await loginViaMagicLink(page, 'admin@abhyas.local', { capture: { category: '01-platform-admin', prefix: 'superadmin' } });
  await shot(page, '01-platform-admin', 'academy-dashboard-view');
});

await step('A2. Switch role to Super Admin + platform analytics + tenant registry', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle' });
  const switcher = page.locator('select.role-switcher-select, select:has(option:text-is("Super Admin"))').first();
  await switcher.selectOption({ label: 'Super Admin' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.goto(`${BASE_URL}/admin/superadmin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '01-platform-admin', 'superadmin-analytics-dashboard');
  // Tenant registry table lives in the Analytics tab already; scroll to it
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(500);
  await shot(page, '01-platform-admin', 'superadmin-academy-registry-table');
});

await step('A3. Superadmin onboards a brand-new academy (tenant provisioning)', async () => {
  const page = globalThis.__page;
  await page.getByRole('button', { name: /Onboard Academy/i }).click();
  await page.waitForTimeout(500);
  await shot(page, '01-platform-admin', 'onboard-academy-form-empty');

  await page.getByPlaceholder('e.g. Apex Martial Arts Club').fill('Rising Champions Multi-Sport Academy');
  const slugField = page.getByPlaceholder('e.g. apexmartial');
  await slugField.fill('rising-champions-multi-sport');
  const emailField = page.getByPlaceholder('e.g. business@apexmartial.com');
  if (await emailField.count()) await emailField.fill('business@risingchampions.demo');

  // admin owner fields — exact placeholders from the rendered form
  const tryFill = async (locator, value) => { if (await locator.count()) await locator.first().fill(value); };
  await tryFill(page.getByPlaceholder('e.g. Rajesh'), 'Anjali');
  await tryFill(page.getByPlaceholder('e.g. Patel'), 'Krishnan');
  await tryFill(page.locator('input[type="email"]').last(), 'anjali.krishnan@risingchampions.demo');
  await tryFill(page.getByPlaceholder('e.g. +919876543210'), '9812345670');
  await tryFill(page.getByPlaceholder('Minimum 6 characters'), 'DemoPass123!');

  await shot(page, '01-platform-admin', 'onboard-academy-form-filled');

  const submitBtn = page.getByRole('button', { name: /Onboard & Provision Academy Profile/i });
  await submitBtn.click();
  await page.waitForTimeout(2500);
  await shot(page, '01-platform-admin', 'onboard-academy-result');
});

await step('A4. Superadmin system governance tab', async () => {
  const page = globalThis.__page;
  const govTab = page.getByText('System Governance', { exact: false }).first();
  if (await govTab.count()) {
    await govTab.click();
    await page.waitForTimeout(800);
    await shot(page, '01-platform-admin', 'system-governance-tab');
  }
});

await step('A5. Look up newly provisioned tenant id for later steps', async () => {
  const { data, error } = await db.from('tenants').select('id, name').eq('slug', newTenantSlug).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`tenant with slug ${newTenantSlug} was not created — provisioning form submit likely failed`);
  newTenantId = data.id;
  console.log('    new tenant id:', newTenantId, data.name);
});

// ════════════════════════════════════════════════════════════
// B. ORGANIZATION SETUP — public self-registration flows
// ════════════════════════════════════════════════════════════
await step('B1. Academy self-registration (public, new independent tenant)', async () => {
  const page = await newPage();
  globalThis.__page = page;
  await page.goto(`${BASE_URL}/auth/register`, { waitUntil: 'networkidle' });
  await shot(page, '02-organization-setup', 'academy-register-empty');

  await page.getByPlaceholder('Elite Swimming Academy').first().fill('Sunrise Table Tennis Club');
  await page.getByPlaceholder('eliteswim').first().fill('sunrise-table-tennis');
  await page.getByPlaceholder('e.g. Plot No. 45, Jubilee Hills').first().fill('14 Racket Court Lane, Kondapur');
  await page.getByPlaceholder('Arjun', { exact: true }).fill('Vikram');
  await page.getByPlaceholder('Sharma', { exact: true }).fill('Rao');
  await page.getByPlaceholder('arjun@elite.com', { exact: true }).fill('vikram.rao@sunrisett.demo');
  await page.getByPlaceholder('+91 9876543210').first().fill('+91 9845123670');
  await page.getByPlaceholder('Minimum 6 characters').first().fill('DemoPass123!');
  await shot(page, '02-organization-setup', 'academy-register-filled');

  await page.getByRole('button', { name: /Onboard Academy & Log In/i }).first().click();
  await page.waitForTimeout(2500);
  // KNOWN BUG (see docs/issues-and-recommendations.md): this endpoint does a
  // plain .insert() into public.users, which collides with the
  // trg_sync_auth_user_profile trigger's own row and 500s with
  // "duplicate key value violates unique constraint users_pkey" on every
  // submission. Capture the failure state as evidence rather than assuming
  // success — steps B2/B3 below use an already-seeded, working tenant instead.
  await shot(page, '02-organization-setup', 'academy-register-result-KNOWN-BUG-500');
});

await step('B2. Admin adds a new student directly (using an existing working academy — academy self-registration above is currently broken, see bug report)', async () => {
  const page = globalThis.__page;
  await loginViaMagicLink(page, 'divya.pillai@rhythmdance.demo');
  await page.goto(`${BASE_URL}/admin/students`, { waitUntil: 'networkidle' });
  await shot(page, '02-organization-setup', 'new-academy-students-empty');
  await page.getByRole('button', { name: /Add Student Profile/i }).click();
  await page.waitForTimeout(400);
  // NOTE: getByPlaceholder() default-matches substrings, so a short name like
  // 'Arjun' also matches the email field's placeholder ('arjun@email.com') —
  // exact:true is required here or fills silently land in the wrong field
  // (this bit us once already: see docs/issues-and-recommendations.md).
  await page.getByPlaceholder('arjun@email.com', { exact: true }).fill('rahul.mehta.tt@students.demo.abhyas.local');
  await page.getByPlaceholder('Arjun', { exact: true }).fill('Rahul');
  await page.getByPlaceholder('Sharma', { exact: true }).fill('Mehta');
  await page.getByPlaceholder('9876543210', { exact: true }).fill('9900112233');
  const dobInputs = page.locator('input[type="date"]');
  await dobInputs.first().fill('2012-05-14');
  await page.getByPlaceholder('9876543211', { exact: true }).fill('9900112244');
  await page.getByPlaceholder('Block A, Sector 15, New Delhi', { exact: true }).fill('22 Racket Court Lane, Kondapur, Hyderabad');
  await shot(page, '02-organization-setup', 'new-academy-add-student-filled');
  await page.getByRole('button', { name: /Register Student Account/i }).click();
  await page.waitForTimeout(1500);
  // KNOWN BUG (see docs/issues-and-recommendations.md): POST /api/v1/students
  // also does a plain .insert() into public.users (and public.students),
  // colliding with the same auto-provisioning trigger as tenant creation —
  // this 500s every time on a fresh database. Captured as evidence.
  await shot(page, '02-organization-setup', 'new-academy-add-student-KNOWN-BUG-500');
});

await step('B3. Owner creates their first class & batch', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/batches`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Add New Class/i }).click();
  await page.waitForTimeout(400);
  await shot(page, '02-organization-setup', 'new-class-form');
  const classNameInput = page.locator('input[type="text"]').first();
  await classNameInput.fill('Table Tennis');
  const submitClass = page.getByRole('button', { name: /Save|Create|Add Class/i }).last();
  if (await submitClass.count()) await submitClass.click();
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: /Add New Batch/i }).click();
  await page.waitForTimeout(400);
  await shot(page, '02-organization-setup', 'new-batch-form-empty');
  const batchNameInput = page.getByPlaceholder(/Morning 06:00 AM Slot/i);
  if (await batchNameInput.count()) await batchNameInput.fill('Evening Table Tennis');
  const timeInputs = page.locator('input[type="time"]');
  if (await timeInputs.count() >= 2) {
    await timeInputs.nth(0).fill('17:00');
    await timeInputs.nth(1).fill('18:30');
  }
  for (const d of ['Mon', 'Wed', 'Fri']) {
    const dayBtn = page.getByRole('button', { name: new RegExp(`^${d}`, 'i') });
    if (await dayBtn.count()) await dayBtn.first().click();
  }
  await shot(page, '02-organization-setup', 'new-batch-form-filled');
  const submitBatch = page.getByRole('button', { name: /Schedule Batch/i });
  if (await submitBatch.count()) await submitBatch.click();
  await page.waitForTimeout(1200);
  await shot(page, '02-organization-setup', 'new-batch-created-list');
});

await step('B4. Coach self-registration under the newly onboarded academy (invite-link flow)', async () => {
  const page = await newPage();
  globalThis.__page = page;
  // newTenantId is null because superadmin tenant-provisioning is currently
  // broken (same known bug as academy self-registration) — fall back to the
  // seeded VidyaSopan tenant so this step demonstrates a working invite link.
  const targetTenant = newTenantId || '022c1494-057e-4c80-80dd-88fa4b1287b5';
  await page.goto(`${BASE_URL}/auth/register?role=coach&tenantId=${targetTenant}&testmode=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '02-organization-setup', 'coach-register-step1-empty');

  const clickAutoFill = async () => {
    const btn = page.getByRole('button', { name: /Auto-fill Test Data/i });
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(700); }
  };
  const clickNext = async () => {
    const btn = page.getByRole('button', { name: /^Continue/i });
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(600); return true; }
    return false;
  };

  await clickAutoFill();
  await shot(page, '02-organization-setup', 'coach-register-step1-filled');
  await clickNext();

  await clickAutoFill();
  await shot(page, '02-organization-setup', 'coach-register-step2-professional');
  await clickNext();

  await clickAutoFill();
  await page.waitForTimeout(500);
  await shot(page, '02-organization-setup', 'coach-register-step3-documents');
  await clickNext();

  await clickAutoFill();
  await shot(page, '02-organization-setup', 'coach-register-step4-pricing');
  await clickNext();

  await clickAutoFill();
  await shot(page, '02-organization-setup', 'coach-register-step5-security');
  await clickNext();

  await page.waitForTimeout(500);
  await shot(page, '02-organization-setup', 'coach-register-step6-review');

  const submitBtn = page.getByRole('button', { name: /Complete Onboarding/i });
  if (await submitBtn.count()) {
    await submitBtn.click();
    await page.waitForTimeout(3000);
  }
  await shot(page, '02-organization-setup', 'coach-register-result');
});

// ════════════════════════════════════════════════════════════
// C. STUDENT SELF-SERVICE — payment proof submission (before admin
//    approves it in section D)
// ════════════════════════════════════════════════════════════
await step('C1. Student login + dashboard', async () => {
  const page = await newPage();
  globalThis.__page = page;
  await loginViaMagicLink(page, 'nisha.patil.2@students.demo.abhyas.local', { capture: { category: '06-payments-fines', prefix: 'student' } });
  await shot(page, '06-payments-fines', 'student-dashboard-with-fine');
});

await step('C2. Student submits payment proof for an unpaid fine', async () => {
  const page = globalThis.__page;
  const submitProofBtn = page.getByRole('button', { name: /Submit Proof/i }).first();
  await submitProofBtn.click();
  await page.waitForTimeout(500);
  await shot(page, '06-payments-fines', 'student-submit-proof-modal-empty');

  const txnInput = page.getByPlaceholder(/UPI TXN ID/i);
  await txnInput.fill('UPI TXN ID: 98327429871');
  const fileInput = page.locator('input[type="file"][required]');
  await fileInput.setInputFiles(RECEIPT_FILE);
  await page.waitForTimeout(400);
  await shot(page, '06-payments-fines', 'student-submit-proof-modal-filled');

  const submitReceiptBtn = page.getByRole('button', { name: /Submit Proof Receipt/i });
  await submitReceiptBtn.click();
  await page.waitForTimeout(1500);
  await shot(page, '06-payments-fines', 'student-fine-pending-verification');
});

await step('C3. Student reports page', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/student/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '06-payments-fines', 'student-reports-page');
});

// ════════════════════════════════════════════════════════════
// D. ESTABLISHED ACADEMY ADMIN (VidyaSopan) — the bulk of ops workflows
// ════════════════════════════════════════════════════════════
await step('D1. Admin login (VidyaSopan Sports School)', async () => {
  const page = await newPage();
  globalThis.__page = page;
  await loginViaMagicLink(page, 'meena.krishnan@vidyasopan.demo', { capture: { category: '03-user-management', prefix: 'admin' } });
});

await step('D2. Approve a pending coach application', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/coaches`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '03-user-management', 'coaches-list-mixed-statuses');
  // find the row with "Pending Verification" and open its quick actions
  const pendingRow = page.locator('text=Pending Verification').first();
  if (await pendingRow.count()) {
    await pendingRow.click();
    await page.waitForTimeout(500);
    await shot(page, '03-user-management', 'coach-pending-quickview');
    const approveBtn = page.getByRole('button', { name: /^Approve$/i });
    if (await approveBtn.count()) {
      await approveBtn.click();
      await page.waitForTimeout(1200);
      await shot(page, '03-user-management', 'coach-approved-result');
    }
  }
});

await step('D3. Approve the student payment proof submitted in step C2', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/fines`, { waitUntil: 'networkidle' });
  const queueTab = page.getByRole('button', { name: /Verification Queue/i });
  if (await queueTab.count()) await queueTab.click();
  await page.waitForTimeout(800);
  await shot(page, '06-payments-fines', 'admin-payment-verification-queue');

  const viewReceipt = page.getByRole('button', { name: /View Receipt/i }).first();
  if (await viewReceipt.count()) {
    await viewReceipt.click();
    await page.waitForTimeout(500);
    await shot(page, '06-payments-fines', 'admin-view-receipt');
    // close any lightbox before approving
    await page.keyboard.press('Escape').catch(() => {});
  }
  const approveBtn = page.getByRole('button', { name: /^Approve$/i }).first();
  if (await approveBtn.count()) {
    await approveBtn.click();
    await page.waitForTimeout(1200);
    await shot(page, '06-payments-fines', 'admin-payment-approved-result');
  }
});

await step('D4. Issue a manual fine', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/fines`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Issue Manual Fine/i }).click();
  await page.waitForTimeout(500);
  await shot(page, '06-payments-fines', 'issue-fine-form-empty');
  const studentSelect = page.getByText('Choose Student...').first();
  if (await studentSelect.count()) {
    await studentSelect.click();
    await page.waitForTimeout(300);
    const firstOption = page.locator('[role="option"], li').filter({ hasText: /./ }).first();
    if (await firstOption.count()) await firstOption.click({ force: true });
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('h2, h3').filter({ hasText: /Manually Issue Fine/i }).click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.getByPlaceholder('1000').fill('750', { force: true });
  await page.getByPlaceholder(/Failure to mark attendance/i).fill('Missed uniform inspection — equipment fee.', { force: true });
  await shot(page, '06-payments-fines', 'issue-fine-form-filled');
  await page.getByRole('button', { name: /Issue Fine Record/i }).click({ force: true });
  await page.waitForTimeout(1200);
  await shot(page, '06-payments-fines', 'fines-list-after-issue');
});

await step('D5. Assign an approved coach to a batch', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/batches`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shot(page, '04-batch-management', 'batches-list');
  const manageBtn = page.getByRole('button', { name: /Manage Coaches/i }).first();
  await manageBtn.click();
  await page.waitForTimeout(500);
  await shot(page, '04-batch-management', 'manage-coaches-modal');
  const coachSelect = page.getByText('-- Choose a coach --');
  if (await coachSelect.count()) {
    await coachSelect.click();
    await page.waitForTimeout(300);
    const opt = page.locator('[role="option"], option').filter({ hasText: /./ }).first();
    if (await opt.count()) await opt.click({ force: true });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }
  for (const d of ['Mon', 'Wed', 'Fri']) {
    const dayBtn = page.getByRole('button', { name: new RegExp(`^${d}`, 'i') });
    if (await dayBtn.count()) await dayBtn.first().click({ force: true });
  }
  await shot(page, '04-batch-management', 'assign-coach-filled');
  const assignBtn = page.locator('button', { hasText: /Assign/i }).last();
  if (await assignBtn.count()) { await assignBtn.click({ force: true }); await page.waitForTimeout(1000); }
  await shot(page, '04-batch-management', 'assign-coach-result');
  await page.keyboard.press('Escape').catch(() => {});
});

await step('D6. Mark attendance manually (override)', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/attendance`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '05-attendance', 'attendance-page-default');
  const overrideBtn = page.getByRole('button', { name: /Override/i }).first();
  if (await overrideBtn.count()) {
    await overrideBtn.click();
    await page.waitForTimeout(500);
    await shot(page, '05-attendance', 'attendance-override-modal');
    const presentBtn = page.getByRole('button', { name: /^Present$/i });
    if (await presentBtn.count()) await presentBtn.click();
    const notesArea = page.locator('textarea').first();
    if (await notesArea.count()) await notesArea.fill('Arrived on time, confirmed manually by front desk.');
    await shot(page, '05-attendance', 'attendance-override-filled');
    const saveBtn = page.getByRole('button', { name: /Save Override Log/i });
    if (await saveBtn.count()) { await saveBtn.click(); await page.waitForTimeout(1000); }
    await shot(page, '05-attendance', 'attendance-override-result');
  }
});

await step('D7. Group-photo attendance scan — Simulator Mode', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/attendance/group-scan`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '05-attendance', 'group-scan-page-default');
  // toggle simulator mode on if not already
  const simToggle = page.locator('button').filter({ hasText: '' }).first();
  // Try to find any element referencing simulation
  const simLabel = page.getByText('AI Simulation Mode');
  if (await simLabel.count()) {
    const toggleBtn = simLabel.locator('xpath=following::button[1]');
    if (await toggleBtn.count()) await toggleBtn.first().click().catch(() => {});
  }
  await page.waitForTimeout(500);
  await shot(page, '05-attendance', 'group-scan-simulator-enabled');

  const selectBatch = page.locator('select').first();
  if (await selectBatch.count()) {
    const options = await selectBatch.locator('option').allTextContents();
    if (options.length > 1) await selectBatch.selectOption({ index: 1 });
  }
  const selectFilesBtn = page.getByRole('button', { name: /Select Image Files/i });
  if (await selectFilesBtn.count()) {
    const fileChooserPromise = page.waitForEvent('filechooser').catch(() => null);
    await selectFilesBtn.click();
    const chooser = await fileChooserPromise;
    if (chooser) await chooser.setFiles(RECEIPT_FILE);
    await page.waitForTimeout(500);
  }
  await shot(page, '05-attendance', 'group-scan-photo-loaded');

  const analyzeBtn = page.getByRole('button', { name: /Analyze Active Photo/i });
  if (await analyzeBtn.count()) {
    await analyzeBtn.click();
    await page.waitForTimeout(2500);
    await shot(page, '05-attendance', 'group-scan-analysis-result');
    const saveBtn = page.getByRole('button', { name: /Save Attendance Logs/i });
    if (await saveBtn.count()) { await saveBtn.click(); await page.waitForTimeout(1200); }
    await shot(page, '05-attendance', 'group-scan-saved');
  }
});

await step('D8. Reports & analytics tabs', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '08-reports-analytics', 'reports-batch-tab');
  for (const tabName of ['Coach', 'Student', 'Collection']) {
    const tab = page.getByRole('button', { name: new RegExp(`^${tabName}`, 'i') }).first();
    if (await tab.count()) {
      await tab.click();
      await page.waitForTimeout(900);
      await shot(page, '08-reports-analytics', `reports-${tabName.toLowerCase()}-tab`);
    }
  }
});

await step('D9. Coach leave approvals', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/leaves/approvals`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '05-attendance', 'leave-approvals-queue');
  const pendingRow = page.locator('text=Pending').first();
  if (await pendingRow.count()) {
    await pendingRow.click();
    await page.waitForTimeout(500);
    const approveBtn = page.getByRole('button', { name: /Approve Request/i });
    if (await approveBtn.count()) {
      await approveBtn.click();
      await page.waitForTimeout(1000);
      await shot(page, '05-attendance', 'leave-approved-result');
    }
  }
});

await step('D10. Governance — add a new admin user', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/governance/users`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shot(page, '03-user-management', 'governance-users-list');
  await page.getByRole('button', { name: /Add New User/i }).click();
  await page.waitForTimeout(400);
  await shot(page, '03-user-management', 'governance-add-user-empty');
  const tryFill = async (locator, value) => { if (await locator.count()) await locator.first().fill(value); };
  // FIRST NAME / LAST NAME are plain labelled inputs with no placeholder
  // text, so getByPlaceholder() never matches them, and an unscoped
  // input[type="text"] locator picks up the page's own search box behind
  // the modal too — anchor to inputs that appear after the modal heading.
  const modalTextInputs = page.locator('h2, h3').filter({ hasText: 'Add New User' }).locator('xpath=following::input[@type="text"]');
  await tryFill(modalTextInputs.nth(0), 'Sanjay');
  await tryFill(modalTextInputs.nth(1), 'Kulkarni');
  await tryFill(page.locator('input[type="email"]'), 'sanjay.kulkarni@vidyasopan.demo');
  await tryFill(page.locator('input[type="password"]'), 'DemoPass123!');
  await shot(page, '03-user-management', 'governance-add-user-filled');
  const submitBtn = page.getByRole('button', { name: /^Add User$/i });
  if (await submitBtn.count()) { await submitBtn.click(); await page.waitForTimeout(1200); }
  await shot(page, '03-user-management', 'governance-users-result');
});

await step('D11. Governance — create a custom role', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/governance/roles`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shot(page, '03-user-management', 'governance-roles-list');
  await page.getByRole('button', { name: /Create Role/i }).click();
  await page.waitForTimeout(400);
  const nameInput = page.locator('input[type="text"]').first();
  if (await nameInput.count()) await nameInput.fill('Billing Clerk');
  await shot(page, '03-user-management', 'governance-create-role-form');
  const createBtn = page.getByRole('button', { name: /^Create$|Create Role/i }).last();
  if (await createBtn.count()) { await createBtn.click(); await page.waitForTimeout(1000); }
  await shot(page, '03-user-management', 'governance-roles-result');
});

await step('D12. Governance — audit logs', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/governance/audit-logs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '03-user-management', 'governance-audit-logs');
});

await step('D13. Tenant settings — attendance & fine rules', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '02-organization-setup', 'tenant-settings-page');
});

await step('D14. Announcements page (local-only mock feature)', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/announcements`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '07-communication', 'announcements-page');
});

// ════════════════════════════════════════════════════════════
// E. COACH SELF-SERVICE
// ════════════════════════════════════════════════════════════
await step('E1. Coach login + dashboard', async () => {
  const page = await newPage();
  globalThis.__page = page;
  await loginViaMagicLink(page, 'coach1@vidyasopan.demo', { capture: { category: '05-attendance', prefix: 'coach' } });
  await shot(page, '05-attendance', 'coach-dashboard-view');
});

await step('E2. Coach files a leave request', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/admin/leaves`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shot(page, '05-attendance', 'coach-my-leaves-page');
  const typeSelect = page.locator('select').first();
  if (await typeSelect.count()) await typeSelect.selectOption({ index: 1 });
  const dateInputs = page.locator('input[type="date"]');
  if (await dateInputs.count() >= 2) {
    await dateInputs.nth(0).fill('2026-08-10');
    await dateInputs.nth(1).fill('2026-08-10');
  }
  const reasonArea = page.locator('textarea').first();
  if (await reasonArea.count()) await reasonArea.fill('Attending a coaching certification workshop.');
  await shot(page, '05-attendance', 'coach-leave-request-filled');
  const fileBtn = page.getByRole('button', { name: /File Leave Request/i });
  if (await fileBtn.count()) { await fileBtn.click(); await page.waitForTimeout(1200); }
  await shot(page, '05-attendance', 'coach-leave-request-result');
});

// ════════════════════════════════════════════════════════════
// F. PUBLIC MARKETPLACE (logged out)
// ════════════════════════════════════════════════════════════
await step('F1. Marketplace — coach search with filters', async () => {
  const page = await newPage();
  globalThis.__page = page;
  await page.goto(`${BASE_URL}/explore/coaches`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '09-marketplace', 'explore-coaches-default');

  const { data: sportsCategory } = await db.from('categories').select('id').eq('slug', 'sports').single();
  await page.goto(`${BASE_URL}/explore/coaches?city=Hyderabad&categoryId=${sportsCategory.id}&minRating=4.0`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '09-marketplace', 'explore-coaches-filtered-sports-hyderabad');
});

await step('F2. Public coach profile page', async () => {
  const page = globalThis.__page;
  const { data: coach } = await db.from('coaches').select('public_profile_slug').eq('account_status', 'Active').not('public_profile_slug', 'is', null).limit(1).single();
  await page.goto(`${BASE_URL}/coaches/${coach.public_profile_slug}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '09-marketplace', 'public-coach-profile');
});

await step('F3. Marketplace — explore academies (placeholder)', async () => {
  const page = globalThis.__page;
  await page.goto(`${BASE_URL}/explore/academies`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shot(page, '09-marketplace', 'explore-academies-placeholder');
});

await browser.close();

console.log('\n\n================ CAPTURE LOG ================');
for (const l of LOG) {
  console.log(`[${l.status}] ${l.name}${l.error ? ' — ' + l.error : ''}`);
}
fs.writeFileSync(path.resolve('../../docs/screenshots/capture-log.json'), JSON.stringify(LOG, null, 2));
console.log('\nFailed steps:', LOG.filter((l) => l.status === 'FAILED').length, '/', LOG.length);
