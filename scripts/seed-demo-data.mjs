// Bulk demo-data seeder for the LOCAL dev environment only.
// Populates realistic organizations, coaches, students, batches, attendance
// history, fines, leaves, reviews, and governance data directly via the
// Supabase service-role client (bypassing UI/API for speed) so the app has
// months of "already in production" looking data to explore.
//
// Individual representative workflows (one academy registration, one coach
// onboarding, one attendance mark, etc.) are separately captured via the
// real UI with Playwright for documentation screenshots — this script only
// handles bulk volume.
//
// Run with: node scripts/seed-demo-data.mjs
// Refuses to run against anything but 127.0.0.1/localhost Supabase.

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env.development.local'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.development.local');
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(SUPABASE_URL)) {
  console.error(`Refusing to run: SUPABASE_URL "${SUPABASE_URL}" is not local. This script is for local dev demo data only.`);
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO_PASSWORD = 'DemoPass123!';
const today = new Date('2026-07-17'); // fixed "today" for deterministic historical data

// ────────────────────────────────────────────────────────────
// small utilities
// ────────────────────────────────────────────────────────────
const rand = (arr) => arr[Math.floor(seededRandom() * arr.length)];
const randInt = (min, max) => Math.floor(seededRandom() * (max - min + 1)) + min;
const randFloat = (min, max, dp = 2) => parseFloat((seededRandom() * (max - min) + min).toFixed(dp));
const pick = (arr, n) => {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(seededRandom() * copy.length), 1)[0]);
  }
  return out;
};
const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };

// deterministic PRNG (mulberry32) so re-runs are reproducible if ever needed
let seed = 42;
function seededRandom() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const FIRST_NAMES_M = ['Arjun', 'Rohan', 'Vikram', 'Aditya', 'Karthik', 'Sameer', 'Rahul', 'Kabir', 'Ishaan', 'Aarav', 'Vivaan', 'Krishna', 'Dev', 'Nikhil', 'Siddharth', 'Manoj', 'Suresh', 'Rajesh', 'Anand', 'Varun'];
const FIRST_NAMES_F = ['Priya', 'Ananya', 'Diya', 'Riya', 'Sneha', 'Kavya', 'Meera', 'Isha', 'Nisha', 'Divya', 'Pooja', 'Shreya', 'Anjali', 'Neha', 'Radhika', 'Swati', 'Lakshmi', 'Deepika', 'Aisha', 'Tanvi'];
const LAST_NAMES = ['Sharma', 'Reddy', 'Rao', 'Patil', 'Gupta', 'Verma', 'Kumar', 'Nair', 'Iyer', 'Menon', 'Das', 'Mehta', 'Joshi', 'Deshmukh', 'Naidu', 'Choudhary', 'Agarwal', 'Bhat', 'Krishnan', 'Pillai'];
const AREAS = ['Gachibowli', 'Kondapur', 'Madhapur', 'Jubilee Hills', 'Banjara Hills', 'Kukatpally', 'Miyapur', 'Hitech City', 'Manikonda', 'Secunderabad', 'Begumpet', 'Ameerpet', 'Nizampet', 'Kompally', 'Uppal'];

function randomName(gender) {
  const firstName = gender === 'F' ? rand(FIRST_NAMES_F) : rand(FIRST_NAMES_M);
  const lastName = rand(LAST_NAMES);
  return { firstName, lastName, gender: gender === 'F' ? 'Female' : 'Male' };
}
function randomPhone() { return '9' + Array.from({ length: 9 }, () => randInt(0, 9)).join(''); }
let emailCounter = 0;
function emailFor(first, last, domain = 'demo.abhyas.local') {
  emailCounter += 1;
  return `${first.toLowerCase()}.${last.toLowerCase()}.${emailCounter}@${domain}`;
}

const created = { tenants: [], admins: [], coaches: [], students: [], batches: [], fines: { total: 0 }, attendance: 0, leaves: 0, reviews: 0 };

// ────────────────────────────────────────────────────────────
// reference data lookups
// ────────────────────────────────────────────────────────────
let SYSTEM_ROLE_IDS = {};
async function loadReference() {
  const { data: categories } = await db.from('categories').select('id, slug, name');
  const { data: subcategories } = await db.from('subcategories').select('id, slug, name, category_id');
  const { data: areas } = await db.from('service_areas').select('id, slug, name');
  const { data: roles } = await db.from('roles').select('id, name').is('tenant_id', null);
  for (const r of roles) SYSTEM_ROLE_IDS[r.name] = r.id;
  return { categories, subcategories, areas };
}
// matches the role_id lookups every real API route performs (Admin/Coach/
// Student/Super Admin system roles) — without this, hasPermission() finds no
// role_permissions row and every governance/permission-gated action 403s.
function roleIdFor(role) {
  const map = { admin: 'Admin', coach: 'Coach', student: 'Student', superadmin: 'Super Admin' };
  return SYSTEM_ROLE_IDS[map[role]] ?? null;
}
function sub(subcats, slug) {
  const s = subcats.find((s) => s.slug === slug);
  if (!s) throw new Error(`subcategory not found: ${slug}`);
  return s;
}

// ────────────────────────────────────────────────────────────
// entity creators
// ────────────────────────────────────────────────────────────
async function createTenant({ name, slug, city, address, subscriptionStatus = 'active' }) {
  const { data, error } = await db
    .from('tenants')
    .insert({ name, slug, city, address, state: 'Telangana', country: 'India', subscription_status: subscriptionStatus, email: `contact@${slug}.demo` })
    .select()
    .single();
  if (error) throw new Error(`createTenant(${name}): ${error.message}`);
  created.tenants.push({ id: data.id, name });

  // sensible tenant_settings row per academy
  await db.from('tenant_settings').insert({
    tenant_id: data.id,
    absent_fine_rule_1: rand([500, 1000, 1500]),
    absent_fine_rule_1_days: 4,
    absent_fine_rule_2: rand([1500, 2000, 2500]),
    late_threshold_minutes: rand([5, 10, 15]),
    grace_period_minutes: rand([0, 5]),
    auto_fine_enabled: true,
  });

  return data.id;
}

async function createAuthUser({ email, firstName, lastName, role, tenantId, phone }) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    phone: undefined,
    app_metadata: { role, tenant_id: tenantId },
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  if (error) throw new Error(`createAuthUser(${email}): ${error.message}`);
  const userId = data.user.id;
  // trigger already inserted a bare public.users row — widen it.
  // tenant_id MUST be re-set explicitly here: GoTrue's admin.createUser()
  // applies app_metadata via a secondary update *after* the initial
  // auth.users insert, so the BEFORE-INSERT enrich trigger never sees our
  // real tenant_id and the AFTER-INSERT sync trigger bootstraps
  // public.users with the hardcoded default tenant instead. Every real API
  // route in this app (coaches/route.ts, superadmin/route.ts, etc.) already
  // works around this the same way; the seed script silently didn't, which
  // put all 82 seeded users under one tenant instead of their assigned one.
  // role_id must also be set to the matching system role (Admin/Coach/
  // Student) or every permission-gated route (hasPermission) 403s.
  const { error: upErr } = await db
    .from('users')
    .update({ role, tenant_id: tenantId, phone, is_active: true, available_roles: [role], role_id: roleIdFor(role) })
    .eq('id', userId);
  if (upErr) throw new Error(`update users(${email}): ${upErr.message}`);
  return userId;
}

async function createAdmin({ tenantId, firstName, lastName, email, phone, alsoCoach = false }) {
  const userId = await createAuthUser({ email, firstName, lastName, role: 'admin', tenantId, phone });
  if (alsoCoach) {
    await db.from('users').update({ available_roles: ['admin', 'coach'] }).eq('id', userId);
  }
  created.admins.push({ id: userId, email, name: `${firstName} ${lastName}`, tenantId });
  return userId;
}

let coachSeq = 0;
async function createCoach({
  tenantId, tenantSlug, firstName, lastName, gender, email, phone, experienceYears,
  city, area, subcategorySlug, subcategories, secondarySubSlugs = [], tagSlugs = [],
  serviceAreaIds = [], accountStatus = 'Active', asDualRole = false, existingUserId = null,
}) {
  coachSeq += 1;
  let userId = existingUserId;
  if (!userId) {
    userId = await createAuthUser({ email, firstName, lastName, role: 'coach', tenantId, phone });
  } else if (asDualRole) {
    await db.from('users').update({ available_roles: ['admin', 'coach'] }).eq('id', userId);
  }

  const primary = sub(subcategories, subcategorySlug);
  const slug = `${firstName}-${lastName}-${tenantSlug}-${coachSeq}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

  const { error: coachErr } = await db.from('coaches').insert({
    id: userId,
    tenant_id: tenantId,
    experience_years: experienceYears,
    service_types: rand([['Offline'], ['Online', 'Offline'], ['Offline']]),
    class_types: rand([['Group Classes'], ['Group Classes', 'One-to-One'], ['One-to-One']]),
    languages_known: rand([['English', 'Hindi'], ['English', 'Telugu'], ['English', 'Hindi', 'Telugu']]),
    qualification: rand(['Certified Level 2 Coach', 'National Institute of Sports Diploma', 'B.P.Ed, M.P.Ed', 'International Certification', 'State-level player, certified coach']),
    certifications_summary: rand(['First Aid & CPR certified', 'National-level certification, 3x state champion coach', 'Certified by national sports federation', null]),
    joining_date: isoDate(addDays(today, -randInt(30, 900))),
    bio: `${firstName} is a dedicated coach with ${experienceYears} years of experience, passionate about helping students of all levels improve their skills and confidence.`,
    age_groups: rand([['Kids'], ['Kids', 'Teens'], ['Teens', 'Adults'], ['Kids', 'Teens', 'Adults']]),
    skill_levels: rand([['Beginner'], ['Beginner', 'Intermediate'], ['Intermediate', 'Advanced'], ['Beginner', 'Intermediate', 'Advanced']]),
    country: 'India', state: 'Telangana', city, area,
    designation: rand(['Head Coach', 'Senior Coach', 'Coach', 'Assistant Coach']),
    department: 'Coaching',
    employee_type: rand(['Full-time', 'Part-time', 'Contract']),
    gender,
    date_of_birth: isoDate(addDays(today, -365 * randInt(24, 48))),
    address: `${randInt(1, 999)}, ${area}, ${city}`,
    emergency_contact_name: randomName(gender === 'Male' ? 'F' : 'M').firstName + ' ' + rand(LAST_NAMES),
    emergency_contact_relationship: rand(['Spouse', 'Parent', 'Sibling']),
    emergency_contact_phone: randomPhone(),
    account_status: accountStatus,
    public_profile_slug: accountStatus === 'Active' ? slug : null,
    achievements: rand([[], ['State-level champion 2022'], ['National medalist', 'Best Coach Award 2023'], ['5+ students placed in district teams']]),
    avg_rating: accountStatus === 'Active' ? randFloat(3.8, 5.0) : 0,
    retention_rate: randFloat(70, 98, 1),
    conversion_rate: randFloat(40, 85, 1),
    satisfaction_score: randFloat(75, 99, 1),
  });
  if (coachErr) throw new Error(`createCoach(${email}): ${coachErr.message}`);

  // taxonomy: primary + optional secondaries
  await db.from('coach_categories').insert({ coach_id: userId, subcategory_id: primary.id, is_primary: true });
  for (const s of secondarySubSlugs) {
    await db.from('coach_categories').insert({ coach_id: userId, subcategory_id: sub(subcategories, s).id, is_primary: false });
  }

  // service areas
  for (const areaId of serviceAreaIds) {
    await db.from('coach_service_areas').insert({ coach_id: userId, area_id: areaId });
  }

  // financial settings (academy pays coach)
  await db.from('coach_financial_settings').insert({
    coach_id: userId, tenant_id: tenantId,
    salary_type: rand(['Fixed Monthly', 'Per Class', 'Revenue Share']),
    fixed_salary: randInt(15000, 45000),
    per_class_rate: randInt(300, 800),
    revenue_share_pct: randInt(20, 40),
    bank_account_holder_name: `${firstName} ${lastName}`,
    upi_id: `${firstName.toLowerCase()}${lastName.toLowerCase()}@okhdfcbank`,
    pan_number: `ABCDE${randInt(1000, 9999)}F`,
  });

  // pricing policy — student-facing (at least one, default monthly)
  const { data: policy } = await db.from('coach_pricing_policies').insert({
    tenant_id: tenantId, coach_id: userId, policy_type: 'monthly_subscription', enabled: true, is_default: true,
  }).select().single();
  await db.from('coach_pricing_rules').insert({
    policy_id: policy.id, amount: randInt(1500, 4000), currency: 'INR', billing_cycle: 'Monthly', auto_renew: true,
    late_fee_amount: 100, late_fee_grace_days: 5,
  });
  await db.from('coach_pricing_settings').insert({ coach_id: userId, tenant_id: tenantId, default_policy_type: 'monthly_subscription', allow_student_overrides: true });

  // a placeholder verified Government ID doc so the coach can pass admin approval gates
  await db.from('coach_documents').insert({
    coach_id: userId, tenant_id: tenantId, document_type: 'Government ID', document_name: 'Aadhaar Card.pdf',
    file_url: 'https://placehold.co/demo/aadhaar.pdf', verification_status: 'Verified', verified_at: new Date().toISOString(),
  });

  created.coaches.push({ id: userId, email, name: `${firstName} ${lastName}`, tenantId, status: accountStatus });
  return userId;
}

let studentSeq = 0;
async function createStudent({ tenantId, tenantPrefix, firstName, lastName, gender, batchId, ageYears }) {
  studentSeq += 1;
  const email = emailFor(firstName, lastName, 'students.demo.abhyas.local');
  const userId = await createAuthUser({ email, firstName, lastName, role: 'student', tenantId, phone: randomPhone() });

  const customId = `${tenantPrefix}${String(studentSeq).padStart(4, '0')}`;
  const dob = isoDate(addDays(today, -365 * ageYears - randInt(0, 300)));
  const joining = isoDate(addDays(today, -randInt(30, 700)));

  // tenant_id must be re-set explicitly for the same reason as in
  // createAuthUser (see its comment) — the trigger-created students row also
  // bootstraps off the pre-app_metadata default tenant.
  const { error } = await db.from('students').update({
    tenant_id: tenantId,
    student_custom_id: customId,
    date_of_birth: dob,
    joining_date: joining,
    address: `${randInt(1, 999)}, ${rand(AREAS)}, Hyderabad`,
    emergency_contact: randomPhone(),
    batch_id: batchId ?? null,
    status: 'active',
  }).eq('id', userId);
  if (error) throw new Error(`updateStudent(${email}): ${error.message}`);

  created.students.push({ id: userId, email, name: `${firstName} ${lastName}`, tenantId, batchId, joining, dob });
  return { id: userId, joining };
}

async function createClass({ tenantId, name, description }) {
  const { data, error } = await db.from('classes').insert({ tenant_id: tenantId, name, description }).select().single();
  if (error) throw new Error(`createClass(${name}): ${error.message}`);
  return data.id;
}

async function createBatch({ tenantId, classId, name, startTime, endTime, daysOfWeek, maxCapacity = 30 }) {
  const { data, error } = await db.from('batches').insert({
    tenant_id: tenantId, class_id: classId, name, start_time: startTime, end_time: endTime,
    days_of_week: daysOfWeek, max_capacity: maxCapacity,
  }).select().single();
  if (error) throw new Error(`createBatch(${name}): ${error.message}`);
  created.batches.push({ id: data.id, name, tenantId, daysOfWeek });
  return data.id;
}

async function assignCoachToBatch({ tenantId, coachId, batchId, assignedDays }) {
  const { error } = await db.from('coach_batch_assignments').insert({
    tenant_id: tenantId, coach_id: coachId, batch_id: batchId, status: 'approved', assigned_days: assignedDays, approved_by: coachId,
  });
  if (error) throw new Error(`assignCoachToBatch: ${error.message}`);
}

// generate attendance for one student across a batch's days_of_week, from
// `joiningIso` (or 8 weeks back, whichever is later) through today, and
// auto-generate matching fines for absences the same way the app's API does.
async function generateAttendanceAndFines({ tenantId, studentId, batchId, daysOfWeek, joiningIso, fineRule1, fineRule1Days, fineRule2 }) {
  const start = new Date(Math.max(new Date(joiningIso).getTime(), addDays(today, -56).getTime()));
  const rows = [];
  let monthlyAbsences = {};

  for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
    const isoWeekday = d.getDay() === 0 ? 7 : d.getDay(); // JS: 0=Sun -> ISO 7
    if (!daysOfWeek.includes(isoWeekday)) continue;
    if (d > today) break;

    const roll = seededRandom();
    let status;
    if (roll < 0.80) status = 'present';
    else if (roll < 0.90) status = 'late';
    else status = 'absent';

    const dateStr = isoDate(d);
    rows.push({
      tenant_id: tenantId, student_id: studentId, batch_id: batchId, date: dateStr,
      status, verification_mode: 'manual',
      check_in: status === 'absent' ? null : `${dateStr}T${status === 'late' ? '09:12:00' : '08:58:00'}Z`,
      confidence_score: status === 'absent' ? null : randFloat(85, 99.5, 1),
    });

    if (status === 'absent') {
      const monthKey = dateStr.slice(0, 7);
      monthlyAbsences[monthKey] = (monthlyAbsences[monthKey] || 0) + 1;
    }
  }

  if (rows.length) {
    const { error } = await db.from('attendance_logs').insert(rows);
    if (error) throw new Error(`attendance insert: ${error.message}`);
    created.attendance += rows.length;
  }

  // fines: one per absence, tiered by that month's running absence count
  let running = {};
  const fineRows = [];
  for (const r of rows.filter((r) => r.status === 'absent')) {
    const monthKey = r.date.slice(0, 7);
    running[monthKey] = (running[monthKey] || 0) + 1;
    const amount = running[monthKey] <= fineRule1Days ? fineRule1 : fineRule2;
    const statusRoll = seededRandom();
    const fineStatus = statusRoll < 0.45 ? 'paid' : statusRoll < 0.7 ? 'unpaid' : statusRoll < 0.9 ? 'pending_verification' : 'waived';
    fineRows.push({
      tenant_id: tenantId, student_id: studentId, amount, reason: `Absent — ${r.date}`,
      status: fineStatus, issued_date: r.date,
      paid_date: fineStatus === 'paid' ? new Date(new Date(r.date).getTime() + 3 * 86400000).toISOString() : null,
      payment_method: fineStatus === 'paid' || fineStatus === 'pending_verification' ? rand(['upi', 'bank_transfer', 'cash']) : null,
      transaction_id: fineStatus === 'paid' || fineStatus === 'pending_verification' ? `TXN${randInt(100000, 999999)}` : null,
      waive_reason: fineStatus === 'waived' ? rand(['Medical leave — doctor note provided', 'Family emergency, waived by admin']) : null,
    });
  }
  if (fineRows.length) {
    const { error } = await db.from('fines').insert(fineRows);
    if (error) throw new Error(`fines insert: ${error.message}`);
    created.fines.total += fineRows.length;
  }
}

async function createLeave({ tenantId, coachId }) {
  const startOffset = -randInt(5, 90);
  const start = addDays(today, startOffset);
  const end = addDays(start, randInt(0, 3));
  const status = rand(['Approved', 'Approved', 'Pending', 'Rejected']);
  const { error } = await db.from('coach_leaves').insert({
    tenant_id: tenantId, coach_id: coachId,
    leave_type: rand(['Casual Leave', 'Sick Leave', 'Earned Leave']),
    start_date: isoDate(start), end_date: isoDate(end),
    reason: rand(['Family function', 'Not feeling well', 'Personal work', 'Festival travel', 'Medical appointment']),
    status,
    admin_comment: status === 'Rejected' ? 'Please plan leaves with more advance notice.' : (status === 'Approved' ? 'Approved, enjoy your time off.' : null),
  });
  if (error) throw new Error(`createLeave: ${error.message}`);
  created.leaves += 1;
}

async function createReview({ tenantId, coachId, studentUserId }) {
  const scores = { discipline: randInt(3, 5), communication: randInt(3, 5), student_feedback: randInt(3, 5), attendance: randInt(3, 5), teaching_quality: randInt(3, 5), professionalism: randInt(3, 5) };
  const overall = parseFloat((Object.values(scores).reduce((a, b) => a + b, 0) / 6).toFixed(2));
  const { error } = await db.from('coach_reviews').insert({
    tenant_id: tenantId, coach_id: coachId, rated_by: studentUserId, ...scores, overall_rating: overall,
    review_period: rand(['Q1 2026', 'Q2 2026', 'Monthly - June 2026']),
    comments: rand(['Great coach, very patient with beginners!', 'Really helped improve my technique.', 'Punctual and well organized sessions.', 'Would recommend to anyone starting out.']),
  });
  if (error) throw new Error(`createReview: ${error.message}`);
  created.reviews += 1;
}

async function createGovernanceRole({ tenantId, name, moduleActions }) {
  const { data: role, error } = await db.from('roles').insert({ tenant_id: tenantId, name, is_system: false }).select().single();
  if (error) throw new Error(`createGovernanceRole(${name}): ${error.message}`);
  const { data: perms } = await db.from('permissions').select('id, module, action');
  const matched = perms.filter((p) => moduleActions.some(([m, a]) => m === p.module && a === p.action));
  if (matched.length) {
    await db.from('role_permissions').insert(matched.map((p) => ({ role_id: role.id, permission_id: p.id })));
  }
  return role.id;
}

async function logAudit({ tenantId, userId, action, description }) {
  await db.from('audit_logs').insert({ tenant_id: tenantId, user_id: userId, action, description, ip_address: '127.0.0.1' });
}

// ────────────────────────────────────────────────────────────
// main orchestration
// ────────────────────────────────────────────────────────────
async function main() {
  console.log('Loading reference taxonomy...');
  const ref = await loadReference();
  const areaByName = (name) => ref.areas.find((a) => a.name === name)?.id;

  // ── 1. VidyaSopan Sports School (existing default tenant, multi-sport) ──
  console.log('\n=== VidyaSopan Sports School (multi-sport academy) ===');
  const vidyasopan = '022c1494-057e-4c80-80dd-88fa4b1287b5';
  created.tenants.push({ id: vidyasopan, name: 'VidyaSopan Sports School' });
  await db.from('tenant_settings').upsert({
    tenant_id: vidyasopan, absent_fine_rule_1: 1000, absent_fine_rule_1_days: 4, absent_fine_rule_2: 2000,
    late_threshold_minutes: 5, grace_period_minutes: 5, auto_fine_enabled: true,
  }, { onConflict: 'tenant_id' });

  await createAdmin({ tenantId: vidyasopan, firstName: 'Meena', lastName: 'Krishnan', email: 'meena.krishnan@vidyasopan.demo', phone: randomPhone() });

  const vsCoach1 = await createCoach({
    tenantId: vidyasopan, tenantSlug: 'vidyasopan', ...randomName('M'), phone: randomPhone(),
    email: 'coach1@vidyasopan.demo', experienceYears: 9, city: 'Hyderabad', area: 'Gachibowli',
    subcategorySlug: 'swimming', subcategories: ref.subcategories, secondarySubSlugs: ['athletics-track'],
    serviceAreaIds: [areaByName('Gachibowli'), areaByName('Kondapur')],
  });
  const vsCoach2 = await createCoach({
    tenantId: vidyasopan, tenantSlug: 'vidyasopan', ...randomName('F'), phone: randomPhone(),
    email: 'coach2@vidyasopan.demo', experienceYears: 6, city: 'Hyderabad', area: 'Madhapur',
    subcategorySlug: 'karate', subcategories: ref.subcategories,
    serviceAreaIds: [areaByName('Madhapur')],
  });
  const vsCoach3 = await createCoach({
    tenantId: vidyasopan, tenantSlug: 'vidyasopan', ...randomName('M'), phone: randomPhone(),
    email: 'coach3@vidyasopan.demo', experienceYears: 4, city: 'Hyderabad', area: 'Kondapur',
    subcategorySlug: 'cricket', subcategories: ref.subcategories,
    serviceAreaIds: [areaByName('Kondapur')], accountStatus: 'Pending Verification',
  });

  const vsSwimClass = await createClass({ tenantId: vidyasopan, name: 'Swimming', description: 'Competitive & recreational swimming coaching' });
  const vsKarateClass = await createClass({ tenantId: vidyasopan, name: 'Karate', description: 'Traditional Shotokan karate' });
  const vsCricketClass = await createClass({ tenantId: vidyasopan, name: 'Cricket', description: 'Age-group cricket coaching' });

  const vsBatchSwim = await createBatch({ tenantId: vidyasopan, classId: vsSwimClass, name: 'Junior Swimming (6-12 yrs)', startTime: '07:00', endTime: '08:00', daysOfWeek: [1, 3, 5] });
  const vsBatchKarate = await createBatch({ tenantId: vidyasopan, classId: vsKarateClass, name: 'Advanced Karate', startTime: '17:00', endTime: '18:30', daysOfWeek: [2, 4, 6] });
  const vsBatchCricket = await createBatch({ tenantId: vidyasopan, classId: vsCricketClass, name: 'Under 14 Cricket', startTime: '16:00', endTime: '18:00', daysOfWeek: [1, 2, 4, 6] });

  await assignCoachToBatch({ tenantId: vidyasopan, coachId: vsCoach1, batchId: vsBatchSwim, assignedDays: [1, 3, 5] });
  await assignCoachToBatch({ tenantId: vidyasopan, coachId: vsCoach2, batchId: vsBatchKarate, assignedDays: [2, 4, 6] });

  const vsStudents = [];
  for (let i = 0; i < 15; i++) {
    const gender = i % 2 === 0 ? 'M' : 'F';
    const nm = randomName(gender);
    const batchId = rand([vsBatchSwim, vsBatchKarate, vsBatchCricket]);
    const s = await createStudent({ tenantId: vidyasopan, tenantPrefix: 'VS', firstName: nm.firstName, lastName: nm.lastName, gender: nm.gender, batchId, ageYears: randInt(7, 16) });
    vsStudents.push({ ...s, batchId });
  }
  for (const s of vsStudents) {
    const batch = created.batches.find((b) => b.id === s.batchId);
    await generateAttendanceAndFines({ tenantId: vidyasopan, studentId: s.id, batchId: s.batchId, daysOfWeek: batch.daysOfWeek, joiningIso: s.joining, fineRule1: 1000, fineRule1Days: 4, fineRule2: 2000 });
  }
  await createLeave({ tenantId: vidyasopan, coachId: vsCoach1 });
  await createLeave({ tenantId: vidyasopan, coachId: vsCoach2 });
  await createReview({ tenantId: vidyasopan, coachId: vsCoach1, studentUserId: vsStudents[0].id });
  await createReview({ tenantId: vidyasopan, coachId: vsCoach2, studentUserId: vsStudents[1].id });
  const frontDeskRole = await createGovernanceRole({ tenantId: vidyasopan, name: 'Front Desk', moduleActions: [['students', 'view'], ['attendance', 'view'], ['attendance', 'mark'], ['batches', 'view']] });
  await createAuthUser({ email: 'frontdesk@vidyasopan.demo', firstName: 'Lakshmi', lastName: 'Bhat', role: 'admin', tenantId: vidyasopan, phone: randomPhone() });
  await logAudit({ tenantId: vidyasopan, userId: null, action: 'coaches.approve', description: 'Approved coach onboarding for new swim coach' });
  await logAudit({ tenantId: vidyasopan, userId: null, action: 'settings.manage', description: 'Updated absent fine rule to ₹1000/₹2000' });

  // ── 2. Elite Football Academy ──
  console.log('=== Elite Football Academy ===');
  const football = await createTenant({ name: 'Elite Football Academy', slug: 'elite-football-academy', city: 'Hyderabad', address: 'Plot 12, Necklace Road, Secunderabad' });
  await createAdmin({ tenantId: football, firstName: 'Ravi', lastName: 'Naidu', email: 'ravi.naidu@elitefootball.demo', phone: randomPhone() });
  const flCoach1 = await createCoach({ tenantId: football, tenantSlug: 'football', ...randomName('M'), phone: randomPhone(), email: 'coach1@elitefootball.demo', experienceYears: 12, city: 'Hyderabad', area: 'Secunderabad', subcategorySlug: 'football', subcategories: ref.subcategories, serviceAreaIds: [areaByName('Secunderabad')] });
  const flCoach2 = await createCoach({ tenantId: football, tenantSlug: 'football', ...randomName('M'), phone: randomPhone(), email: 'coach2@elitefootball.demo', experienceYears: 5, city: 'Hyderabad', area: 'Begumpet', subcategorySlug: 'football', subcategories: ref.subcategories, serviceAreaIds: [areaByName('Begumpet')] });
  const flClass = await createClass({ tenantId: football, name: 'Football', description: 'Youth & adult football training' });
  const flBatch1 = await createBatch({ tenantId: football, classId: flClass, name: 'Under 10 Football', startTime: '16:30', endTime: '17:30', daysOfWeek: [1, 3, 5] });
  const flBatch2 = await createBatch({ tenantId: football, classId: flClass, name: 'Evening Football (Adults)', startTime: '18:30', endTime: '20:00', daysOfWeek: [2, 4, 6, 7] });
  await assignCoachToBatch({ tenantId: football, coachId: flCoach1, batchId: flBatch1, assignedDays: [1, 3, 5] });
  await assignCoachToBatch({ tenantId: football, coachId: flCoach2, batchId: flBatch2, assignedDays: [2, 4, 6, 7] });
  const flStudents = [];
  for (let i = 0; i < 8; i++) {
    const nm = randomName(i % 3 === 0 ? 'F' : 'M');
    const batchId = rand([flBatch1, flBatch2]);
    const s = await createStudent({ tenantId: football, tenantPrefix: 'EF', firstName: nm.firstName, lastName: nm.lastName, gender: nm.gender, batchId, ageYears: randInt(9, 30) });
    flStudents.push({ ...s, batchId });
  }
  for (const s of flStudents) {
    const batch = created.batches.find((b) => b.id === s.batchId);
    await generateAttendanceAndFines({ tenantId: football, studentId: s.id, batchId: s.batchId, daysOfWeek: batch.daysOfWeek, joiningIso: s.joining, fineRule1: 500, fineRule1Days: 4, fineRule2: 1500 });
  }
  await createLeave({ tenantId: football, coachId: flCoach1 });
  await createReview({ tenantId: football, coachId: flCoach1, studentUserId: flStudents[0].id });

  // ── 3. Champions Cricket Academy ──
  console.log('=== Champions Cricket Academy ===');
  const cricket = await createTenant({ name: 'Champions Cricket Academy', slug: 'champions-cricket-academy', city: 'Hyderabad', address: '45 Uppal Stadium Road, Uppal' });
  await createAdmin({ tenantId: cricket, firstName: 'Suresh', lastName: 'Iyer', email: 'suresh.iyer@championscricket.demo', phone: randomPhone() });
  const crCoach1 = await createCoach({ tenantId: cricket, tenantSlug: 'cricket', ...randomName('M'), phone: randomPhone(), email: 'coach1@championscricket.demo', experienceYears: 15, city: 'Hyderabad', area: 'Uppal', subcategorySlug: 'cricket', subcategories: ref.subcategories, serviceAreaIds: [areaByName('Uppal')] });
  const crCoach2 = await createCoach({ tenantId: cricket, tenantSlug: 'cricket', ...randomName('M'), phone: randomPhone(), email: 'coach2@championscricket.demo', experienceYears: 7, city: 'Hyderabad', area: 'LB Nagar', subcategorySlug: 'cricket', subcategories: ref.subcategories, serviceAreaIds: [areaByName('LB Nagar')] });
  const crClass = await createClass({ tenantId: cricket, name: 'Cricket', description: 'Age-group and tournament cricket coaching' });
  const crBatch1 = await createBatch({ tenantId: cricket, classId: crClass, name: 'Under 10 Cricket', startTime: '16:00', endTime: '17:30', daysOfWeek: [1, 3, 5] });
  const crBatch2 = await createBatch({ tenantId: cricket, classId: crClass, name: 'Under 14 Cricket', startTime: '17:30', endTime: '19:30', daysOfWeek: [2, 4, 6] });
  await assignCoachToBatch({ tenantId: cricket, coachId: crCoach1, batchId: crBatch1, assignedDays: [1, 3, 5] });
  await assignCoachToBatch({ tenantId: cricket, coachId: crCoach2, batchId: crBatch2, assignedDays: [2, 4, 6] });
  const crStudents = [];
  for (let i = 0; i < 8; i++) {
    const nm = randomName(i % 4 === 0 ? 'F' : 'M');
    const batchId = rand([crBatch1, crBatch2]);
    const s = await createStudent({ tenantId: cricket, tenantPrefix: 'CC', firstName: nm.firstName, lastName: nm.lastName, gender: nm.gender, batchId, ageYears: randInt(8, 15) });
    crStudents.push({ ...s, batchId });
  }
  for (const s of crStudents) {
    const batch = created.batches.find((b) => b.id === s.batchId);
    await generateAttendanceAndFines({ tenantId: cricket, studentId: s.id, batchId: s.batchId, daysOfWeek: batch.daysOfWeek, joiningIso: s.joining, fineRule1: 1000, fineRule1Days: 4, fineRule2: 2000 });
  }
  await createLeave({ tenantId: cricket, coachId: crCoach2 });
  await createReview({ tenantId: cricket, coachId: crCoach1, studentUserId: crStudents[0].id });

  // ── 4. Ace Badminton Academy ──
  console.log('=== Ace Badminton Academy ===');
  const badminton = await createTenant({ name: 'Ace Badminton Academy', slug: 'ace-badminton-academy', city: 'Hyderabad', address: '9 Sports Complex, Kukatpally' });
  await createAdmin({ tenantId: badminton, firstName: 'Kiran', lastName: 'Deshmukh', email: 'kiran.deshmukh@acebadminton.demo', phone: randomPhone() });
  const bdCoach1 = await createCoach({ tenantId: badminton, tenantSlug: 'badminton', ...randomName('F'), phone: randomPhone(), email: 'coach1@acebadminton.demo', experienceYears: 10, city: 'Hyderabad', area: 'Kukatpally', subcategorySlug: 'badminton', subcategories: ref.subcategories, serviceAreaIds: [areaByName('Kukatpally')] });
  const bdCoach2 = await createCoach({ tenantId: badminton, tenantSlug: 'badminton', ...randomName('M'), phone: randomPhone(), email: 'coach2@acebadminton.demo', experienceYears: 3, city: 'Hyderabad', area: 'Nizampet', subcategorySlug: 'badminton', subcategories: ref.subcategories, serviceAreaIds: [areaByName('Nizampet')] });
  const bdClass = await createClass({ tenantId: badminton, name: 'Badminton', description: 'Singles & doubles badminton coaching' });
  const bdBatch1 = await createBatch({ tenantId: badminton, classId: bdClass, name: 'Advanced Badminton', startTime: '06:30', endTime: '08:00', daysOfWeek: [1, 2, 3, 4, 5] });
  const bdBatch2 = await createBatch({ tenantId: badminton, classId: bdClass, name: 'Beginner Badminton', startTime: '18:00', endTime: '19:00', daysOfWeek: [2, 4, 6] });
  await assignCoachToBatch({ tenantId: badminton, coachId: bdCoach1, batchId: bdBatch1, assignedDays: [1, 2, 3, 4, 5] });
  await assignCoachToBatch({ tenantId: badminton, coachId: bdCoach2, batchId: bdBatch2, assignedDays: [2, 4, 6] });
  const bdStudents = [];
  for (let i = 0; i < 6; i++) {
    const nm = randomName(i % 2 === 0 ? 'M' : 'F');
    const batchId = rand([bdBatch1, bdBatch2]);
    const s = await createStudent({ tenantId: badminton, tenantPrefix: 'AB', firstName: nm.firstName, lastName: nm.lastName, gender: nm.gender, batchId, ageYears: randInt(10, 35) });
    bdStudents.push({ ...s, batchId });
  }
  for (const s of bdStudents) {
    const batch = created.batches.find((b) => b.id === s.batchId);
    await generateAttendanceAndFines({ tenantId: badminton, studentId: s.id, batchId: s.batchId, daysOfWeek: batch.daysOfWeek, joiningIso: s.joining, fineRule1: 500, fineRule1Days: 4, fineRule2: 1000 });
  }
  await createReview({ tenantId: badminton, coachId: bdCoach1, studentUserId: bdStudents[0].id });

  // ── 5. AquaPro Swimming Academy ──
  console.log('=== AquaPro Swimming Academy ===');
  const swim = await createTenant({ name: 'AquaPro Swimming Academy', slug: 'aquapro-swimming-academy', city: 'Hyderabad', address: 'Lake View Pool Complex, Kondapur' });
  await createAdmin({ tenantId: swim, firstName: 'Anitha', lastName: 'Rao', email: 'anitha.rao@aquapro.demo', phone: randomPhone() });
  const swCoach1 = await createCoach({ tenantId: swim, tenantSlug: 'aquapro', ...randomName('M'), phone: randomPhone(), email: 'coach1@aquapro.demo', experienceYears: 8, city: 'Hyderabad', area: 'Kondapur', subcategorySlug: 'swimming', subcategories: ref.subcategories, serviceAreaIds: [areaByName('Kondapur')] });
  const swCoach2 = await createCoach({ tenantId: swim, tenantSlug: 'aquapro', ...randomName('F'), phone: randomPhone(), email: 'coach2@aquapro.demo', experienceYears: 5, city: 'Hyderabad', area: 'Gachibowli', subcategorySlug: 'swimming', subcategories: ref.subcategories, serviceAreaIds: [areaByName('Gachibowli')] });
  const swClass = await createClass({ tenantId: swim, name: 'Swimming', description: 'All-level swimming coaching' });
  const swBatch1 = await createBatch({ tenantId: swim, classId: swClass, name: 'Kids Swimming', startTime: '07:00', endTime: '08:00', daysOfWeek: [1, 3, 5] });
  const swBatch2 = await createBatch({ tenantId: swim, classId: swClass, name: 'Adult Swimming', startTime: '19:00', endTime: '20:00', daysOfWeek: [2, 4, 6] });
  await assignCoachToBatch({ tenantId: swim, coachId: swCoach1, batchId: swBatch1, assignedDays: [1, 3, 5] });
  await assignCoachToBatch({ tenantId: swim, coachId: swCoach2, batchId: swBatch2, assignedDays: [2, 4, 6] });
  const swStudents = [];
  for (let i = 0; i < 6; i++) {
    const nm = randomName(i % 2 === 0 ? 'F' : 'M');
    const batchId = rand([swBatch1, swBatch2]);
    const s = await createStudent({ tenantId: swim, tenantPrefix: 'AQ', firstName: nm.firstName, lastName: nm.lastName, gender: nm.gender, batchId, ageYears: randInt(6, 40) });
    swStudents.push({ ...s, batchId });
  }
  for (const s of swStudents) {
    const batch = created.batches.find((b) => b.id === s.batchId);
    await generateAttendanceAndFines({ tenantId: swim, studentId: s.id, batchId: s.batchId, daysOfWeek: batch.daysOfWeek, joiningIso: s.joining, fineRule1: 800, fineRule1Days: 4, fineRule2: 1600 });
  }

  // ── 6. Serenity Yoga & Wellness Center ──
  console.log('=== Serenity Yoga & Wellness Center ===');
  const yoga = await createTenant({ name: 'Serenity Yoga & Wellness Center', slug: 'serenity-yoga-wellness', city: 'Hyderabad', address: '22 Wellness Lane, Jubilee Hills' });
  await createAdmin({ tenantId: yoga, firstName: 'Radhika', lastName: 'Menon', email: 'radhika.menon@serenityyoga.demo', phone: randomPhone() });
  const ygCoach1 = await createCoach({ tenantId: yoga, tenantSlug: 'serenity', ...randomName('F'), phone: randomPhone(), email: 'coach1@serenityyoga.demo', experienceYears: 11, city: 'Hyderabad', area: 'Jubilee Hills', subcategorySlug: 'hatha-yoga', subcategories: ref.subcategories, secondarySubSlugs: ['meditation-mindfulness'], serviceAreaIds: [areaByName('Jubilee Hills')] });
  const ygCoach2 = await createCoach({ tenantId: yoga, tenantSlug: 'serenity', ...randomName('F'), phone: randomPhone(), email: 'coach2@serenityyoga.demo', experienceYears: 4, city: 'Hyderabad', area: 'Banjara Hills', subcategorySlug: 'power-yoga', subcategories: ref.subcategories, serviceAreaIds: [areaByName('Banjara Hills')] });
  const ygClass = await createClass({ tenantId: yoga, name: 'Yoga', description: 'Hatha, power yoga and meditation sessions' });
  const ygBatch1 = await createBatch({ tenantId: yoga, classId: ygClass, name: 'Weekend Yoga', startTime: '07:00', endTime: '08:15', daysOfWeek: [6, 7] });
  const ygBatch2 = await createBatch({ tenantId: yoga, classId: ygClass, name: 'Morning Yoga', startTime: '06:00', endTime: '07:00', daysOfWeek: [1, 2, 3, 4, 5] });
  await assignCoachToBatch({ tenantId: yoga, coachId: ygCoach1, batchId: ygBatch2, assignedDays: [1, 2, 3, 4, 5] });
  await assignCoachToBatch({ tenantId: yoga, coachId: ygCoach2, batchId: ygBatch1, assignedDays: [6, 7] });
  const ygStudents = [];
  for (let i = 0; i < 5; i++) {
    const nm = randomName(i % 3 === 0 ? 'M' : 'F');
    const batchId = rand([ygBatch1, ygBatch2]);
    const s = await createStudent({ tenantId: yoga, tenantPrefix: 'SY', firstName: nm.firstName, lastName: nm.lastName, gender: nm.gender, batchId, ageYears: randInt(20, 55) });
    ygStudents.push({ ...s, batchId });
  }
  for (const s of ygStudents) {
    const batch = created.batches.find((b) => b.id === s.batchId);
    await generateAttendanceAndFines({ tenantId: yoga, studentId: s.id, batchId: s.batchId, daysOfWeek: batch.daysOfWeek, joiningIso: s.joining, fineRule1: 300, fineRule1Days: 4, fineRule2: 600 });
  }
  await createReview({ tenantId: yoga, coachId: ygCoach1, studentUserId: ygStudents[0].id });

  // ── 7. Rhythm Dance Academy ──
  console.log('=== Rhythm Dance Academy ===');
  const dance = await createTenant({ name: 'Rhythm Dance Academy', slug: 'rhythm-dance-academy', city: 'Hyderabad', address: '3rd Floor, Studio Block, Ameerpet' });
  await createAdmin({ tenantId: dance, firstName: 'Divya', lastName: 'Pillai', email: 'divya.pillai@rhythmdance.demo', phone: randomPhone() });
  const dnCoach1 = await createCoach({ tenantId: dance, tenantSlug: 'rhythm', ...randomName('F'), phone: randomPhone(), email: 'coach1@rhythmdance.demo', experienceYears: 9, city: 'Hyderabad', area: 'Ameerpet', subcategorySlug: 'bollywood', subcategories: ref.subcategories, serviceAreaIds: [areaByName('Ameerpet')] });
  const dnCoach2 = await createCoach({ tenantId: dance, tenantSlug: 'rhythm', ...randomName('M'), phone: randomPhone(), email: 'coach2@rhythmdance.demo', experienceYears: 6, city: 'Hyderabad', area: 'SR Nagar', subcategorySlug: 'hip-hop', subcategories: ref.subcategories, serviceAreaIds: [areaByName('SR Nagar')] });
  const dnClass = await createClass({ tenantId: dance, name: 'Dance', description: 'Bollywood, hip-hop and contemporary dance' });
  const dnBatch1 = await createBatch({ tenantId: dance, classId: dnClass, name: 'Bollywood Dance (Kids)', startTime: '16:00', endTime: '17:00', daysOfWeek: [1, 3, 5] });
  const dnBatch2 = await createBatch({ tenantId: dance, classId: dnClass, name: 'Hip-Hop (Teens)', startTime: '18:00', endTime: '19:00', daysOfWeek: [2, 4, 6] });
  await assignCoachToBatch({ tenantId: dance, coachId: dnCoach1, batchId: dnBatch1, assignedDays: [1, 3, 5] });
  await assignCoachToBatch({ tenantId: dance, coachId: dnCoach2, batchId: dnBatch2, assignedDays: [2, 4, 6] });
  const dnStudents = [];
  for (let i = 0; i < 5; i++) {
    const nm = randomName(i % 2 === 0 ? 'F' : 'M');
    const batchId = rand([dnBatch1, dnBatch2]);
    const s = await createStudent({ tenantId: dance, tenantPrefix: 'RD', firstName: nm.firstName, lastName: nm.lastName, gender: nm.gender, batchId, ageYears: randInt(8, 22) });
    dnStudents.push({ ...s, batchId });
  }
  for (const s of dnStudents) {
    const batch = created.batches.find((b) => b.id === s.batchId);
    await generateAttendanceAndFines({ tenantId: dance, studentId: s.id, batchId: s.batchId, daysOfWeek: batch.daysOfWeek, joiningIso: s.joining, fineRule1: 400, fineRule1Days: 4, fineRule2: 800 });
  }

  // ── 8. Priya Sharma Fitness Studio (independent coach — admin+coach dual role) ──
  console.log('=== Priya Sharma Fitness Studio (independent coach) ===');
  const indie = await createTenant({ name: 'Priya Sharma Fitness Studio', slug: 'priya-sharma-fitness', city: 'Hyderabad', address: 'Home Studio, Kokapet', subscriptionStatus: 'trial' });
  const priyaId = await createAdmin({ tenantId: indie, firstName: 'Priya', lastName: 'Sharma', email: 'priya.sharma@independent.demo', phone: randomPhone(), alsoCoach: true });
  await createCoach({
    tenantId: indie, tenantSlug: 'indie', firstName: 'Priya', lastName: 'Sharma', gender: 'Female', existingUserId: priyaId, asDualRole: true,
    experienceYears: 7, city: 'Hyderabad', area: 'Kokapet', subcategorySlug: 'personal-training', subcategories: ref.subcategories,
    secondarySubSlugs: ['general-fitness'], serviceAreaIds: [areaByName('Kokapet'), areaByName('Narsingi')],
  });
  const indieClass = await createClass({ tenantId: indie, name: 'Personal Training', description: 'One-on-one and small group fitness coaching' });
  const indieBatch = await createBatch({ tenantId: indie, classId: indieClass, name: 'Personal Training Batch', startTime: '06:00', endTime: '07:00', daysOfWeek: [1, 2, 3, 4, 5], maxCapacity: 8 });
  await assignCoachToBatch({ tenantId: indie, coachId: priyaId, batchId: indieBatch, assignedDays: [1, 2, 3, 4, 5] });
  const indieStudents = [];
  for (let i = 0; i < 3; i++) {
    const nm = randomName(i % 2 === 0 ? 'M' : 'F');
    const s = await createStudent({ tenantId: indie, tenantPrefix: 'PS', firstName: nm.firstName, lastName: nm.lastName, gender: nm.gender, batchId: indieBatch, ageYears: randInt(25, 45) });
    indieStudents.push({ ...s, batchId: indieBatch });
  }
  for (const s of indieStudents) {
    await generateAttendanceAndFines({ tenantId: indie, studentId: s.id, batchId: indieBatch, daysOfWeek: [1, 2, 3, 4, 5], joiningIso: s.joining, fineRule1: 200, fineRule1Days: 4, fineRule2: 400 });
  }
  await createReview({ tenantId: indie, coachId: priyaId, studentUserId: indieStudents[0].id });

  // ── cleanup: orphan students rows ──
  // trg_sync_auth_user_profile fires on the *initial* auth.users insert,
  // before GoTrue's admin.createUser() applies our app_metadata via its
  // secondary update — so raw_app_meta_data.role reads as the trigger's
  // 'student' default at insert time for EVERY user (admins/coaches
  // included), and the trigger auto-creates a spurious public.students row
  // for each of them before our follow-up .update() corrects public.users.role.
  // Same root cause as the tenant_id issue fixed above in createAuthUser/
  // createStudent; sweep up the leftover phantom rows here.
  const { data: nonStudentUsers } = await db.from('users').select('id').neq('role', 'student');
  const { error: cleanupErr, count } = await db.from('students').delete({ count: 'exact' }).in('id', nonStudentUsers.map((u) => u.id));
  if (cleanupErr) throw new Error(`cleanup orphan students: ${cleanupErr.message}`);
  console.log(`\nCleaned up ${count ?? 0} orphan students rows (spurious auto-created for admin/coach accounts by the auth trigger).`);

  // ── summary ──
  console.log('\n\n================ SEED SUMMARY ================');
  console.log(`Tenants:  ${created.tenants.length}`);
  console.log(`Admins:   ${created.admins.length}`);
  console.log(`Coaches:  ${created.coaches.length} (${created.coaches.filter(c => c.status === 'Active').length} Active / marketplace-visible)`);
  console.log(`Students: ${created.students.length}`);
  console.log(`Batches:  ${created.batches.length}`);
  console.log(`Attendance rows: ${created.attendance}`);
  console.log(`Fines: ${created.fines.total}`);
  console.log(`Coach leaves: ${created.leaves}`);
  console.log(`Coach reviews: ${created.reviews}`);
  console.log(`\nAll demo accounts use password: ${DEMO_PASSWORD}`);
  console.log('(App login UI only supports magic-link/Google OAuth — use Mailpit at http://127.0.0.1:54324 to fetch sign-in links, or use these passwords for scripted/API access.)');
  console.log('\nKey accounts for the documentation walkthrough:');
  console.log(`  Superadmin:  admin@abhyas.local (password: admin123, magic link via Mailpit)`);
  for (const a of created.admins) console.log(`  Admin (${created.tenants.find(t=>t.id===a.tenantId)?.name}): ${a.email}`);
  console.log('================================================\n');
}

main().catch((err) => {
  console.error('\nSEED FAILED:', err);
  process.exit(1);
});
