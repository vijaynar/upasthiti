#!/usr/bin/env node
// Abhyas test-data seeding framework — main entrypoint.
// Usage: node testing/orchestrate.mjs --environment=local --dataset=small --seed=42
// See testing/README.md for the full option list and architecture notes.

import { resolveConfig } from './config/index.mjs';
import { createRng } from './lib/rng.mjs';
import { createAuthProvider } from './lib/auth.mjs';
import { createHttpClient } from './lib/apiClient.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { log, count, printSummary, getCounters } from './lib/log.mjs';
import { mapPool } from './lib/concurrency.mjs';
import { fetchTaxonomy, REQUESTED_CATEGORY_MAP, areasForCity } from './lib/taxonomy.mjs';
import * as fake from './lib/fakeData.mjs';
import { isoDate, daysAgo } from './lib/dates.mjs';

import * as identity from './entities/identity.mjs';
import * as platformAdmin from './entities/platformAdmin.mjs';
import * as orgs from './entities/organizations.mjs';
import * as coachEnt from './entities/coaches.mjs';
import * as scheduling from './entities/scheduling.mjs';
import * as studentEnt from './entities/students.mjs';
import * as attendanceEnt from './entities/attendance.mjs';
import * as financeEnt from './entities/finance.mjs';
import * as marketEnt from './entities/marketplace.mjs';

const SPECIALTY_TO_SUBCATEGORY_SLUG = {
  Badminton: 'badminton', Cricket: 'cricket', Football: 'football', Basketball: 'basketball',
  Tennis: 'tennis', Swimming: 'swimming', Karate: 'karate', Chess: 'chess',
  Yoga: 'hatha-yoga', Dance: 'bollywood', Music: 'guitar', Fitness: 'general-fitness',
  Coding: 'web-development', Robotics: 'robotics', 'Public Speaking': 'exam-strategy-time-management',
};
const SUBCATEGORY_TO_SPORT_KEY = {
  badminton: 'badminton', cricket: 'cricket', football: 'football', basketball: 'basketball',
  tennis: 'tennis', swimming: 'swimming', 'athletics-track': 'athletics', chess: 'chess',
  karate: 'martial_arts', taekwondo: 'martial_arts', 'kung-fu': 'martial_arts', boxing: 'martial_arts', kickboxing: 'martial_arts',
  'hatha-yoga': 'yoga', 'power-yoga': 'yoga',
  bollywood: 'dance', 'hip-hop': 'dance', contemporary: 'dance', bharatanatyam: 'dance', kathak: 'dance',
  guitar: 'music', 'piano-keyboard': 'music', 'vocal-classical': 'music', drums: 'music',
};
const BATCH_NAMES = ['Beginner', 'Intermediate', 'Advanced', 'Weekend', 'Summer Camp', 'Elite'];
const AMENITIES_LIST = ['Indoor Courts', 'Parking Available', 'First Aid Station', 'Drinking Water', 'Changing Rooms', 'CCTV Surveillance'];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function pickSpecialty(rng) {
  return rng.pick(Object.keys(SPECIALTY_TO_SUBCATEGORY_SLUG));
}

function resolveTaxonomyFor(taxonomy, specialty) {
  const subSlug = SPECIALTY_TO_SUBCATEGORY_SLUG[specialty];
  const sub = taxonomy.subcategories.find((s) => s.slug === subSlug);
  const sportKey = SUBCATEGORY_TO_SPORT_KEY[subSlug] ?? taxonomy.sports[0]?.key;
  return { sub, sportKey };
}

async function main() {
  const config = resolveConfig();
  const rng = createRng(config.seed);
  const authProvider = createAuthProvider(config);
  const anon = createHttpClient(config.appUrl);
  const today = isoDate(new Date());

  log.step(`Abhyas seed — dataset=${config.datasetName} (${config.dataset.label}) environment=${config.environment} runTag=${config.runTag}`);
  if (config.clean) log.info('--clean: starting a fresh state file.');

  const state = loadState(config);
  const persist = () => saveState(config, state);

  // Login-reference index (Requirement: "output a creds table to login
  // manually and check") — every real identity this run creates, so
  // `testing/credentials.mjs` can export/filter it afterward. No passwords
  // exist in this app (magic-link/OAuth only, see README's "Auth bootstrap"
  // section) — this is a find-the-actor-you-want index, not a secret store,
  // so it's safe to persist to the (gitignored) state file as plain JSON.
  state.data.actors = state.data.actors ?? [];
  const actorsByEmail = new Map(state.data.actors.map((a) => [a.email, a]));
  // Merges into one row per email — a real identity CAN hold more than one
  // role (e.g. a single membership with multiple membership_roles), and the
  // credentials table should show "coach,org_admin" on one row rather than
  // two separate rows for the same login.
  function recordActor({ email, name, role, type, orgSlug, organizationId }) {
    const existing = actorsByEmail.get(email);
    if (existing) {
      const roles = new Set(existing.role.split(',').map((r) => r.trim()).filter(Boolean));
      roles.add(role);
      existing.role = [...roles].join(',');
      return;
    }
    const actor = { email, name, role, type, orgSlug: orgSlug ?? null, organizationId: organizationId ?? null };
    state.data.actors.push(actor);
    actorsByEmail.set(email, actor);
  }

  log.step('Fetching real platform taxonomy (categories, sports, cities)');
  const taxonomy = state.data.categories ?? (await fetchTaxonomy(anon));
  state.data.categories = taxonomy;
  persist();
  log.info(`${taxonomy.categories.length} categories, ${taxonomy.sports.length} sports, ${taxonomy.cities.length} launched cities.`);

  log.step('Bootstrapping platform administration (Requirement #14)');
  const superAdminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@abhyas.local';
  const superAdmin = await platformAdmin.ensureSuperAdmin(config, authProvider, superAdminEmail);
  recordActor({ email: superAdminEmail, name: 'Super Admin (seed)', role: 'super_admin', type: 'platform' });

  const PLATFORM_STAFF_ROLES = ['verification_ops', 'support', 'platform_finance', 'marketplace_partner'];
  for (const roleKey of PLATFORM_STAFF_ROLES) {
    // Keyed by roleKey, not email — email now embeds a per-run counter (see
    // fakeData.mjs's emailFor), so it's no longer stable enough to double as
    // a resume-idempotency key the way the old `roleKey@platform.demo...`
    // literal email was.
    if (state.data.platformStaff[roleKey]) continue;
    const pr = rng.child(`platformstaff-${roleKey}`);
    const person = fake.randomName(pr, pr.bool() ? 'F' : 'M');
    const email = fake.emailFor(person.firstName, person.lastName, `platform.${roleKey}`, config.runTag);
    const staffIdentity = await identity.loginIdentity(authProvider, email);
    const staffAgeYears = pr.int(28, 55);
    await identity.updateProfile(staffIdentity.client, {
      displayName: person.fullName, gender: person.gender, phone: fake.randomPhone(pr),
      dob: daysAgo(today, staffAgeYears * 365), avatarPath: fake.avatarFor(pr, person.firstName, person.lastName),
    });
    try {
      await platformAdmin.grantPlatformRole(superAdmin.client, staffIdentity.userId, roleKey);
    } catch (err) {
      log.warn(`grantPlatformRole(${roleKey}) for ${email}: ${err.message}`);
    }
    state.data.platformStaff[roleKey] = { userId: staffIdentity.userId, roleKey, email };
    recordActor({ email, name: person.fullName, role: roleKey, type: 'platform' });
  }
  await platformAdmin.createAnnouncement(superAdmin.client, {
    audience: 'all', title: 'Welcome to Abhyas', body: 'Platform seeded with demo data for development.',
  }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
  persist();

  const states = config.states ?? fake.STATE_NAMES;
  const totalOrgs = config.dataset.academies + config.dataset.independentCoaches;
  const batchesPerOrg = Math.max(1, Math.round(config.dataset.batchesTarget / totalOrgs));
  const studentsPerOrg = Math.max(2, Math.round(config.dataset.studentsTarget / totalOrgs));
  const reviewShare = Math.min(1, config.dataset.reviewsTarget / (config.dataset.studentsTarget || 1));

  // ── Guardian pool (shared across siblings, ~1.4 kids/guardian) ──────
  const guardianEmails = [];
  // guardianEmail -> [{orgType, orgId, wardUserId}, ...] for every ward the
  // BULK-enroll path (buildBatchesAndStudents' main loop) creates — lets the
  // "cross-org guardian siblings" pass below pick a guardian who's only ever
  // had kids at ONE org type and deliberately give them a second child at
  // the OTHER type, with concrete (orgId, wardUserId) evidence validate.mjs
  // can check, instead of relying on the 35% guardian-reuse chance to
  // produce this by luck (it often does, but never guaranteed, especially
  // at --dataset=smoke scale).
  const guardianLinks = new Map();

  async function getGuardian(r) {
    const reuse = guardianEmails.length > 0 && r.bool(0.35);
    if (reuse) {
      const email = r.pick(guardianEmails);
      return identity.loginIdentity(authProvider, email);
    }
    const person = fake.randomName(r, r.bool() ? 'F' : 'M');
    const email = fake.emailFor(person.firstName, person.lastName, 'guardian', config.runTag);
    const g = await identity.loginIdentity(authProvider, email);
    const guardianAgeYears = r.int(28, 55);
    await identity.updateProfile(g.client, {
      displayName: person.fullName, gender: person.gender, phone: fake.randomPhone(r),
      dob: daysAgo(today, guardianAgeYears * 365), avatarPath: fake.avatarFor(r, person.firstName, person.lastName),
    }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
    guardianEmails.push(email);
    recordActor({ email, name: person.fullName, role: 'guardian', type: 'parent' });
    return g;
  }

  // ── Shared org pipeline (used by both academies and independent coaches) ──
  async function setupOrgCore(r, { orgType, name, ownerEmail, ownerPerson, state: stateName, specialty }) {
    const slug = `${slugify(name)}-${r.int(1000, 9999)}`;
    const owner = await identity.loginIdentity(authProvider, ownerEmail);
    const addr = fake.randomAddress(r, stateName);
    const ownerAgeYears = r.int(30, 60);
    await identity.updateProfile(owner.client, {
      displayName: ownerPerson.fullName, gender: ownerPerson.gender, phone: fake.randomPhone(r),
      dob: daysAgo(today, ownerAgeYears * 365), avatarPath: fake.avatarFor(r, ownerPerson.firstName, ownerPerson.lastName),
      state: addr.state, city: addr.city, area: addr.area, addressLine: addr.addressLine,
    }).catch((err) => log.warn(`[soft-fail] ${err.message}`));

    const created = await orgs.createOrganization(owner.client, { orgType, name, slug });
    await orgs.activateWorkspace(owner.client, created.organizationId);
    await orgs.updateBranding(owner.client, created.organizationId, {
      displayName: name, colors: { primary: r.pick(['#4f46e5', '#0ea5e9', '#f97316', '#16a34a', '#db2777']) },
    }).catch((err) => log.warn(`[soft-fail] ${err.message}`));

    const { sub, sportKey } = resolveTaxonomyFor(taxonomy, specialty);
    const cityRow = r.pick(taxonomy.cities);
    await orgs.updateListing(owner.client, created.organizationId, {
      slug, headline: `${specialty} training for all levels`, description:
        `${name} offers structured ${specialty.toLowerCase()} coaching with experienced trainers and a track record of developing confident, skilled students.`,
      sportKeys: [sportKey].filter(Boolean),
      cityKey: cityRow.key,
      categoryId: sub?.categoryId,
      subcategoryIds: sub ? [sub.id] : [],
      primarySubcategoryId: sub?.id,
      ageGroups: ['8-14', '15-18'],
      skillLevels: ['Beginner', 'Intermediate'],
    }).catch((err) => log.warn(`listing update failed for ${slug}: ${err.message}`));

    // Verification-queue variety (Requirement #14 "Academy Approvals"):
    // ~75% approved (listing goes live), ~15% left pending, ~10% rejected.
    const verificationOutcome = r.weighted([{ value: 'approved', weight: 75 }, { value: 'pending', weight: 15 }, { value: 'rejected', weight: 10 }]);
    if (verificationOutcome !== 'pending') {
      await platformAdmin.decideOrgVerification(superAdmin.client, created.organizationId, verificationOutcome, 'Seed data verification pass.').catch((err) => log.warn(`verify ${slug}: ${err.message}`));
    }
    await orgs.publishListing(owner.client, created.organizationId).catch((err) => log.warn(`publish ${slug}: ${err.message}`));
    await platformAdmin.enableHistoricalBackdating(superAdmin.client, created.organizationId).catch((err) => log.warn(`flag ${slug}: ${err.message}`));

    recordActor({ email: ownerEmail, name: ownerPerson.fullName, role: 'owner', type: orgType, orgSlug: slug, organizationId: created.organizationId });
    return { ...created, slug, owner, specialty, sub, sportKey, cityKey: cityRow.key, verificationOutcome };
  }

  // Aadhaar-equivalent + address-proof documents (Requirement: "mandatory
  // fields... Aadhar, Address proof") — this app has no dedicated Aadhaar-
  // number field anywhere (confirmed against every migration); the closest
  // real mechanism is `staff_documents.doc_type IN ('id_proof','address_proof',
  // 'certification', ...)`, a generic file-reference row (storage_path only,
  // same as the existing certification doc below — no real upload pipeline
  // built yet, see coaches.mjs's own comment). Every coach-like identity
  // that gets a staff_profile (academy coaches, sub-coaches, self-onboarded
  // independent coaches) gets all three document types.
  async function addCoachDocuments(client, orgId, staffId, fullName) {
    for (const [docType, folder, suffix] of [
      ['certification', 'certifications', 'cert'],
      ['id_proof', 'id-proof', 'aadhaar'],
      ['address_proof', 'address-proof', 'address'],
    ]) {
      await coachEnt.addStaffDocument(client, orgId, staffId, {
        docType, storagePath: `/documents/${folder}/${slugify(fullName)}-${suffix}.pdf`,
      }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
    }
  }

  async function buildBatchesAndStudents(r, { orgId, branches, owner, coachMemberships, sub, targetStudents, targetBatches, feePolicyId, listingId, orgSlug, orgType }) {
    const program = await scheduling.createProgram(owner.client, orgId, {
      name: sub?.name ?? 'General Training', sportKey: undefined, description: `${sub?.name ?? 'General'} program`,
    }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });

    const batchStart = daysAgo(today, config.attendanceDays);
    const batches = [];
    for (let i = 0; i < targetBatches; i++) {
      const days = r.sample([1, 2, 3, 4, 5, 6, 7], r.int(2, 4)).sort();
      const hour = r.int(6, 19);
      // Multi-branch academies: spread batches across every real branch
      // (not just the default one) so each branch gets its own sessions/
      // attendance/roster, exercising branch-scoped RLS end to end.
      const batchBranch = r.pick(branches);
      const batch = await scheduling.createBatch(owner.client, orgId, {
        branchId: batchBranch.id, name: `${r.pick(BATCH_NAMES)} Batch ${i + 1}`, mode: 'in_person', programId: program?.id,
        capacity: r.int(10, 30),
        schedule: { days, startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 1).padStart(2, '0')}:00`, startDate: batchStart, endDate: null },
        graceMinutes: 15,
      }).catch((err) => { log.warn(`batch create failed: ${err.message}`); return null; });
      if (!batch) continue;
      batches.push(batch);

      // Prefer coaches whose own membership is scoped to this batch's branch
      // (or org-wide); fall back to any coach if none match (small academies
      // with few coaches spread across branches).
      const branchCoaches = coachMemberships.filter((cm) => cm.branchId == null || cm.branchId === batchBranch.id);
      const assignPool = branchCoaches.length ? branchCoaches : coachMemberships;
      for (const cm of assignPool.slice(0, r.int(1, Math.min(2, assignPool.length || 1)))) {
        await scheduling.assignCoach(owner.client, orgId, batch.id, { membershipId: cm.membershipId, role: 'primary', days }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      }

      // Real materialization only ever covers today..+29 days forward (see
      // scheduling's materializeOneBatch) — ANY historical depth needs the
      // backfill endpoint, not just long attendanceDays windows.
      await scheduling.backfillBatchSessions(owner.client, orgId, batch.id, batchStart, daysAgo(today, 1)).catch((err) => log.warn(`backfill ${orgSlug}/${batch.id}: ${err.message}`));
    }
    if (batches.length === 0) return { studentsEnrolled: 0 };

    let studentsEnrolled = 0;
    let reviewsWritten = 0;
    for (let i = 0; i < targetStudents; i++) {
      const sr = r.child(`student-${orgSlug}-${i}`);
      const gender = sr.bool() ? 'F' : 'M';
      const person = fake.randomName(sr, gender);
      const ageYears = sr.int(7, 45);
      const batch = sr.pick(batches);
      const enrolledFrom = daysAgo(today, sr.int(0, config.attendanceDays));
      const isSelfAccount = sr.bool(0.2);
      const attendanceProfile = attendanceEnt.pickAttendanceProfile(sr);

      let studentUserId;
      let guardianEmail = null;
      if (isSelfAccount) {
        const email = fake.emailFor(person.firstName, person.lastName, 'student', config.runTag);
        const acct = await identity.loginIdentity(authProvider, email);
        await identity.updateProfile(acct.client, {
          displayName: person.fullName, gender: person.gender, phone: fake.randomPhone(sr),
          dob: daysAgo(today, ageYears * 365), avatarPath: fake.avatarFor(sr, person.firstName, person.lastName),
        }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
        studentUserId = acct.userId;
        recordActor({ email, name: person.fullName, role: 'student', type: orgType, orgSlug, organizationId: orgId });
      } else {
        const guardian = await getGuardian(sr);
        const ward = await identity.createWard(guardian.client, {
          displayName: person.fullName, relationship: sr.pick(['father', 'mother', 'guardian']),
          dob: daysAgo(today, ageYears * 365), consentAuthority: true,
        }).catch((err) => { log.warn(`createWard failed: ${err.message}`); return null; });
        if (!ward) continue;
        studentUserId = ward.wardUserId;
        guardianEmail = guardian.email;
      }

      const enrollment = await studentEnt.enrollDirect(owner.client, orgId, {
        branchId: batch.branchId, studentUserId, rollNumber: `${orgSlug.slice(0, 4).toUpperCase()}-${String(i + 1).padStart(4, '0')}`, startedOn: enrolledFrom,
      }).catch((err) => { log.warn(`enroll failed: ${err.message}`); return null; });
      if (!enrollment) continue;
      studentsEnrolled += 1;
      if (guardianEmail) {
        const links = guardianLinks.get(guardianEmail) ?? [];
        links.push({ orgType, orgId, wardUserId: studentUserId });
        guardianLinks.set(guardianEmail, links);
      }

      await scheduling.addToRoster(owner.client, orgId, batch.id, enrollment.id).catch((err) => log.warn(`[soft-fail] ${err.message}`));

      const sessions = await scheduling.listSessions(owner.client, orgId, batch.id, batchStart, daysAgo(today, -29)).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return []; });
      const sessionList = Array.isArray(sessions) ? sessions : [];
      await attendanceEnt.generateAttendanceForStudent(owner.client, orgId, batch.id, sr, {
        enrollmentId: enrollment.id, sessions: sessionList, enrolledFrom, today, profile: attendanceProfile,
      }).catch((err) => log.warn(`attendance gen failed: ${err.message}`));

      if (feePolicyId) {
        const chargeCount = sr.int(1, 3);
        for (let c = 0; c < chargeCount; c++) {
          const dueOn = daysAgo(today, sr.int(0, config.attendanceDays));
          const charge = await financeEnt.createCharge(owner.client, orgId, {
            branchId: batch.branchId, enrollmentId: enrollment.id, kind: 'fee', description: 'Monthly tuition fee',
            amountMinor: sr.int(1500, 4000) * 100, dueOn, feePolicyId,
          }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
          if (!charge) continue;
          const outcome = sr.weighted([{ value: 'paid', weight: 55 }, { value: 'open', weight: 25 }, { value: 'waived', weight: 10 }, { value: 'cancelled', weight: 10 }]);
          if (outcome === 'paid') {
            await financeEnt.recordPayment(owner.client, orgId, {
              payerUserId: studentUserId, method: sr.pick(['cash', 'waiver']), amountMinor: charge.amountMinor,
              chargeIds: [charge.id], createdAt: dueOn,
            }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
          } else if (outcome === 'waived') {
            await financeEnt.waiveCharge(owner.client, orgId, charge.id).catch((err) => log.warn(`[soft-fail] ${err.message}`));
          } else if (outcome === 'cancelled') {
            await financeEnt.cancelCharge(owner.client, orgId, charge.id).catch((err) => log.warn(`[soft-fail] ${err.message}`));
          }
        }
      }

      // No review attempt here: reviews_insert_self's RLS requires
      // organization_id = current_org() (the org must be the reviewer's
      // ACTIVE workspace), which in turn requires a real memberships row —
      // and direct staff enrollment (enrollDirect, above) deliberately never
      // creates one (confirmed by reading tenancy-rbac's decideJoinRequest
      // vs. people's enrollStudent — only the JOIN-REQUEST approval path
      // inserts into `memberships`). Reviews are written from the
      // join-request loop below instead, for exactly the self-account
      // students who went through that path and therefore have one.
    }

    // A handful of real join-requests (Requirement #14's "Student Requests"
    // approval queue) — a separate, deliberately smaller path from the bulk
    // direct-enroll loop above: approving one auto-creates the enrollment
    // (confirmed against the real route), so this alone is enough to
    // exercise the pending/approved/rejected mix without duplicating the
    // roster/attendance/finance depth the bulk path already covers.
    const joinRequestCount = Math.max(1, Math.round(targetStudents * 0.15));
    for (let j = 0; j < joinRequestCount; j++) {
      const jr = r.child(`joinreq-${orgSlug}-${j}`);
      const person = fake.randomName(jr, jr.bool() ? 'F' : 'M');
      const asSelf = jr.bool(0.3);
      let actorClient;
      let subjectUserId;
      if (asSelf) {
        const email = fake.emailFor(person.firstName, person.lastName, 'student', config.runTag);
        const acct = await identity.loginIdentity(authProvider, email).catch(() => null);
        if (!acct) continue;
        actorClient = acct.client;
        const selfAgeYears = jr.int(7, 45);
        await identity.updateProfile(acct.client, {
          displayName: person.fullName, gender: person.gender, phone: fake.randomPhone(jr),
          dob: daysAgo(today, selfAgeYears * 365), avatarPath: fake.avatarFor(jr, person.firstName, person.lastName),
        }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
        recordActor({ email, name: person.fullName, role: 'student', type: orgType, orgSlug, organizationId: orgId });
      } else {
        const guardian = await getGuardian(jr);
        const ward = await identity.createWard(guardian.client, {
          displayName: person.fullName, relationship: jr.pick(['father', 'mother', 'guardian']), dob: daysAgo(today, jr.int(7, 16) * 365),
        }).catch(() => null);
        if (!ward) continue;
        actorClient = guardian.client;
        subjectUserId = ward.wardUserId;
      }
      const joinReq = await orgs.createJoinRequest(actorClient, orgId, { requestedRole: 'student', branchId: jr.pick(branches).id, subjectUserId }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
      if (!joinReq) continue;
      const decision = jr.weighted([{ value: 'approved', weight: 60 }, { value: 'rejected', weight: 15 }, { value: null, weight: 25 }]);
      if (!decision) continue;
      await orgs.decideJoinRequest(owner.client, orgId, joinReq.joinRequestId, decision, 'Reviewed during seeding.').catch((err) => log.warn(`[soft-fail] ${err.message}`));

      // Approving a student join-request DOES insert a real memberships row
      // (unlike the bulk enrollDirect path above) — so, unlike a bulk
      // direct-enrolled student, this actor CAN activate the org as their
      // workspace and satisfies reviews_insert_self's RLS. Only the asSelf
      // case has a session capable of authoring a review at all (a ward
      // still has none, even with a membership).
      if (decision === 'approved' && asSelf && listingId && reviewsWritten < Math.ceil(targetStudents * reviewShare)) {
        await orgs.activateWorkspace(actorClient, orgId).catch((err) => log.warn(`[soft-fail] ${err.message}`));
        const myEnrollments = await actorClient.get('/api/v1/me/enrollments').catch((err) => { log.warn(`[soft-fail] ${err.message}`); return []; });
        const myEnrollment = (Array.isArray(myEnrollments) ? myEnrollments : []).find((e) => e.organizationId === orgId);
        if (myEnrollment) {
          await marketEnt.createReview(actorClient, orgId, {
            listingId, enrollmentId: myEnrollment.id, rating: jr.int(3, 5), body: fake.reviewComment(jr), createdAt: myEnrollment.startedOn,
          }).catch((err) => log.warn(`review failed: ${err.message}`));
          reviewsWritten += 1;
        }
      }
    }

    return { studentsEnrolled, reviewsWritten };
  }

  // ── Academies (Requirements #6, #7) ─────────────────────────────────
  log.step(`Building ${config.dataset.academies} academies`);
  const academyResults = await mapPool(Array.from({ length: config.dataset.academies }, (_, i) => i), config.writeConcurrency, async (i) => {
    const r = rng.child(`academy-${i}`);
    const specialty = pickSpecialty(r);
    const stateName = r.pick(states);
    const name = fake.academyName(r, specialty);
    const contact = fake.randomName(r, r.bool() ? 'F' : 'M');
    const ownerEmail = fake.emailFor(contact.firstName, contact.lastName, 'owner', config.runTag);
    const orgKey = `academy-${i}-${ownerEmail}`;
    if (state.data.organizations[orgKey]) { log.progress('academies', i + 1, config.dataset.academies); return; }

    const org = await setupOrgCore(r, { orgType: 'academy', name, ownerEmail, ownerPerson: contact, state: stateName, specialty }).catch((err) => {
      log.warn(`academy ${i} setup failed: ${err.message}`); return null;
    });
    if (!org) return;

    const feePolicy = await financeEnt.createFeePolicy(org.owner.client, org.organizationId, {
      name: 'Monthly Tuition', kind: 'recurring_monthly', amountMinor: r.int(1500, 4000) * 100,
      finePolicy: { lateFee: { graceDays: 5, flatMinor: 10000 }, absenceFine: { amountMinor: 50000 } },
    }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
    await financeEnt.createBankAccount(org.owner.client, org.organizationId, {
      accountHolderName: name, bankName: r.pick(['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank']), accountLast4: String(r.int(1000, 9999)),
    }).catch((err) => log.warn(`[soft-fail] ${err.message}`));

    // Branches (academies with multiple physical locations) — most stay
    // single-branch (55%), the rest get a real 2nd/3rd branch via
    // POST /branches, each with its own batches/coaches/branch_admin below.
    // `branches[0]` is always the default branch createOrganization already made.
    const branchCount = r.weighted([{ value: 1, weight: 55 }, { value: 2, weight: 30 }, { value: 3, weight: 15 }]);
    const branches = [{ id: org.branchId, name: 'Main Branch' }];
    for (let b = 1; b < branchCount; b++) {
      const branchName = ['North Branch', 'South Branch', 'East Branch', 'West Branch'][b - 1] ?? `Branch ${b + 1}`;
      const created = await orgs.createBranch(org.owner.client, org.organizationId, branchName).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
      if (created?.branchId) branches.push({ id: created.branchId, name: branchName });
    }

    // Org-level roles beyond coach/assistant_coach (Requirement: "different
    // roles people in academy") — one org_admin, one front_desk, one
    // accountant per academy, org-wide (no branchId), real invite->accept->
    // active-role flow. These are pure RBAC roles, not HR-tracked staff, so
    // no staff_profile/coach_profile is created for them (only real coaches
    // go through that onboarding path).
    for (const roleKey of ['org_admin', 'front_desk', 'accountant']) {
      const pr = r.child(`orgrole-${roleKey}`);
      const person = fake.randomName(pr, pr.bool() ? 'F' : 'M');
      const email = fake.emailFor(person.firstName, person.lastName, roleKey, config.runTag);
      const invite = await orgs.inviteMember(org.owner.client, org.organizationId, { email, roleKeys: [roleKey] }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
      if (!invite) continue;
      const roleIdentity = await identity.loginIdentity(authProvider, email);
      await orgs.acceptInvitation(roleIdentity.client, invite.token).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      const orgRoleAgeYears = pr.int(25, 55);
      await identity.updateProfile(roleIdentity.client, {
        displayName: person.fullName, gender: person.gender, phone: fake.randomPhone(pr),
        dob: daysAgo(today, orgRoleAgeYears * 365), avatarPath: fake.avatarFor(pr, person.firstName, person.lastName),
      }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      await orgs.activateWorkspace(roleIdentity.client, org.organizationId).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      await orgs.setActiveRole(roleIdentity.client, org.organizationId, roleKey).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      count(`organizations.org_role_${roleKey}_added`);
      recordActor({ email, name: person.fullName, role: roleKey, type: 'academy', orgSlug: org.slug, organizationId: org.organizationId });
    }

    // Branch admins — one per branch BEYOND the default one (a single-branch
    // academy relies on the owner; only extra branches need their own admin).
    for (let b = 1; b < branches.length; b++) {
      const br = r.child(`branchadmin-${b}`);
      const person = fake.randomName(br, br.bool() ? 'F' : 'M');
      const email = fake.emailFor(person.firstName, person.lastName, 'branch_admin', config.runTag);
      const invite = await orgs.inviteMember(org.owner.client, org.organizationId, { email, roleKeys: ['branch_admin'], branchId: branches[b].id }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
      if (!invite) continue;
      const baIdentity = await identity.loginIdentity(authProvider, email);
      await orgs.acceptInvitation(baIdentity.client, invite.token).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      const branchAdminAgeYears = br.int(25, 55);
      await identity.updateProfile(baIdentity.client, {
        displayName: person.fullName, gender: person.gender, phone: fake.randomPhone(br),
        dob: daysAgo(today, branchAdminAgeYears * 365), avatarPath: fake.avatarFor(br, person.firstName, person.lastName),
      }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      await orgs.activateWorkspace(baIdentity.client, org.organizationId).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      await orgs.setActiveRole(baIdentity.client, org.organizationId, 'branch_admin').catch((err) => log.warn(`[soft-fail] ${err.message}`));
      count('organizations.branch_admins_added');
      recordActor({ email, name: person.fullName, role: 'branch_admin', type: 'academy', orgSlug: org.slug, organizationId: org.organizationId });
    }

    // Academy Coaches (Requirement #7): head coach + N additional coaches with real invite/accept flow.
    const coachCount = Math.max(1, Math.round(config.dataset.academyCoachesTarget / config.dataset.academies) + r.int(-1, 1));
    const coachMemberships = [];
    for (let c = 0; c < coachCount; c++) {
      const cr = r.child(`coach-${c}`);
      const person = fake.randomName(cr, cr.bool() ? 'F' : 'M');
      const roleKey = c === 0 ? 'coach' : cr.pick(['coach', 'coach', 'assistant_coach']);
      const email = fake.emailFor(person.firstName, person.lastName, roleKey, config.runTag);
      const coachBranch = cr.pick(branches);
      const invite = await orgs.inviteMember(org.owner.client, org.organizationId, { email, roleKeys: [roleKey], branchId: coachBranch.id }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
      if (!invite) continue;
      const coachIdentity = await identity.loginIdentity(authProvider, email);
      await orgs.acceptInvitation(coachIdentity.client, invite.token).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      const coachAgeYears = cr.int(23, 55);
      await identity.updateProfile(coachIdentity.client, {
        displayName: person.fullName, gender: person.gender, phone: fake.randomPhone(cr),
        dob: daysAgo(today, coachAgeYears * 365), avatarPath: fake.avatarFor(cr, person.firstName, person.lastName),
      }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      await orgs.activateWorkspace(coachIdentity.client, org.organizationId).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      await orgs.setActiveRole(coachIdentity.client, org.organizationId, roleKey).catch((err) => log.warn(`[soft-fail] ${err.message}`));

      const onboardable = await orgs.listOnboardableMembers(org.owner.client, org.organizationId).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return []; });
      const membership = (Array.isArray(onboardable) ? onboardable : []).find((m) => m.userId === coachIdentity.userId || m.email === email);
      if (!membership) continue;
      const staffProfile = await coachEnt.onboardStaff(org.owner.client, org.organizationId, {
        membershipId: membership.membershipId, designation: c === 0 ? 'Head Coach' : cr.pick(['Senior Coach', 'Coach', 'Assistant Coach']),
        employmentType: cr.pick(['full_time', 'part_time', 'contract']),
      }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
      if (!staffProfile) continue;
      coachMemberships.push({ membershipId: membership.membershipId, branchId: coachBranch.id });
      recordActor({ email, name: person.fullName, role: roleKey, type: 'academy', orgSlug: org.slug, organizationId: org.organizationId });

      if (roleKey === 'coach') {
        // serviceTypes is always ['offline'] here, so service areas must be
        // populated (mirrors CoachProfileWizard's own city/areas fields) —
        // seeded from the org's own launched city, same one its listing uses.
        const coachAreas = areasForCity(taxonomy, org.cityKey);
        // categoryId is mandatory (API rejects profiles without one). Fall back
        // to the org's sub's parent category, or the first taxonomy category if
        // the subcategory lookup failed — a coach must always have a category.
        const staffCategoryId = org.sub?.categoryId ?? taxonomy.categories[0]?.id;
        if (!staffCategoryId) { log.warn(`no category available for academy coach in ${org.slug}; skipping coach profile`); }
        else await coachEnt.setStaffCoachProfile(org.owner.client, org.organizationId, staffProfile.id, {
          bio: fake.coachBio(cr, person.firstName, cr.int(2, 15), org.specialty), experienceYears: cr.int(2, 15),
          qualification: fake.randomQualification(cr), languagesKnown: cr.sample(fake.LANGUAGES, cr.int(1, 3)),
          ageGroups: ['Kids', 'Teens'], skillLevels: ['Beginner', 'Intermediate'],
          serviceTypes: ['offline'], classTypes: ['group'], allowStudentOverrides: false,
          serviceAreaKeys: coachAreas.length ? cr.sample(coachAreas, cr.int(1, Math.min(3, coachAreas.length))).map((a) => a.key) : [],
          categoryId: staffCategoryId, subcategoryIds: org.sub ? [org.sub.id] : [], primarySubcategoryId: org.sub?.id,
        }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
      }
      await addCoachDocuments(org.owner.client, org.organizationId, staffProfile.id, person.fullName);

      // Leave requests (approval-queue variety).
      if (cr.bool(0.4)) {
        const leave = await coachEnt.requestLeave(coachIdentity.client, {
          kind: cr.pick(['sick', 'casual', 'earned']), startsOn: daysAgo(today, cr.int(1, 30)), endsOn: daysAgo(today, cr.int(0, 1)), reason: 'Personal',
        }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
        if (leave) {
          const decision = cr.weighted([{ value: 'approved', weight: 60 }, { value: 'rejected', weight: 15 }, { value: null, weight: 25 }]);
          if (decision) await coachEnt.decideLeave(org.owner.client, org.organizationId, leave.id, decision, 'Reviewed.').catch((err) => log.warn(`[soft-fail] ${err.message}`));
        }
      }
    }

    const targetBatches = Math.max(1, Math.round(config.dataset.batchesTarget / totalOrgs));
    const listing = await org.owner.client.get(`/api/v1/orgs/${org.organizationId}/listing`).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
    const { studentsEnrolled } = await buildBatchesAndStudents(r, {
      orgId: org.organizationId, branches, owner: org.owner, coachMemberships, sub: org.sub,
      targetStudents: studentsPerOrg, targetBatches, feePolicyId: feePolicy?.id, listingId: listing?.id, orgSlug: org.slug, orgType: 'academy',
    });

    state.data.organizations[orgKey] = { organizationId: org.organizationId, branchId: org.branchId, orgType: 'academy', slug: org.slug, branchCount: branches.length };
    count('organizations.academies_complete');
    log.progress('academies', i + 1, config.dataset.academies);
    if (i % 5 === 0) persist();
  });
  for (const r of academyResults) if (!r.ok) log.error(`academy pipeline error: ${r.error?.stack ?? r.error}`);
  persist();

  // ── Independent coaches + sub-coaches (Requirements #2, #3) ─────────
  log.step(`Building ${config.dataset.independentCoaches} independent coaches`);
  let subCoachBudget = config.dataset.subCoachesTarget;
  const indieResults = await mapPool(Array.from({ length: config.dataset.independentCoaches }, (_, i) => i), config.writeConcurrency, async (i) => {
    const r = rng.child(`indie-${i}`);
    const specialty = pickSpecialty(r);
    const gender = r.bool() ? 'F' : 'M';
    const person = fake.randomName(r, gender);
    const stateName = r.pick(states);
    const email = fake.emailFor(person.firstName, person.lastName, 'owner', config.runTag);
    const orgKey = `indie-${i}-${email}`;
    if (state.data.organizations[orgKey]) { log.progress('independent coaches', i + 1, config.dataset.independentCoaches); return; }

    const name = `${person.fullName} ${specialty} Coaching`;
    const org = await setupOrgCore(r, { orgType: 'independent_coach', name, ownerEmail: email, ownerPerson: person, state: stateName, specialty }).catch((err) => {
      log.warn(`independent coach ${i} setup failed: ${err.message}`); return null;
    });
    if (!org) return;

    const experienceYears = r.int(2, 20);
    const serviceTypes = r.sample(['offline', 'online'], r.int(1, 2));
    // Only offline coaches need service areas (CoachProfileWizard shows the
    // field regardless, but a purely-online coach has no real reason to set
    // one) — seeded from the org's own launched city, same one its listing uses.
    const indieAreas = serviceTypes.includes('offline') ? areasForCity(taxonomy, org.cityKey) : [];
    // categoryId is mandatory (API rejects profiles without one). Fall back
    // to the org's sub's parent category, or the first taxonomy category if
    // the subcategory lookup failed — a coach must always have a category.
    const indieCategoryId = org.sub?.categoryId ?? taxonomy.categories[0]?.id;
    if (!indieCategoryId) log.warn(`no category available for indie coach ${person.fullName}; onboardSelfCoach will fail`);
    const selfCoachProfile = await coachEnt.onboardSelfCoach(org.owner.client, {
      bio: fake.coachBio(r, person.firstName, experienceYears, specialty), experienceYears,
      qualification: fake.randomQualification(r), languagesKnown: r.sample(fake.LANGUAGES, r.int(1, 3)),
      ageGroups: ['Kids', 'Teens', 'Adults'], skillLevels: ['Beginner', 'Intermediate', 'Advanced'],
      serviceTypes, classTypes: r.sample(['group', 'one_to_one'], r.int(1, 2)),
      serviceAreaKeys: indieAreas.length ? r.sample(indieAreas, r.int(1, Math.min(3, indieAreas.length))).map((a) => a.key) : [],
      allowStudentOverrides: r.bool(0.3), categoryId: indieCategoryId, subcategoryIds: org.sub ? [org.sub.id] : [], primarySubcategoryId: org.sub?.id,
    }).catch((err) => { log.warn(`onboardSelfCoach failed: ${err.message}`); return null; });
    // selfOnboardAsCoach creates the caller's own staff_profiles row under
    // the hood (see onboard-coach route's own comment) — same document set
    // real academy coaches get.
    if (selfCoachProfile?.staffProfileId) {
      await addCoachDocuments(org.owner.client, org.organizationId, selfCoachProfile.staffProfileId, person.fullName);
    }
    await coachEnt.setSelfPricing(org.owner.client, [
      { policyType: 'monthly_subscription', enabled: true, isDefault: true, rules: [{ amount: r.int(1500, 4000), currency: 'INR', billingCycle: 'Monthly', autoRenew: true }] },
    ]).catch((err) => log.warn(`[soft-fail] ${err.message}`));

    const feePolicy = await financeEnt.createFeePolicy(org.owner.client, org.organizationId, {
      name: 'Monthly Fee', kind: 'recurring_monthly', amountMinor: r.int(1500, 4000) * 100,
    }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });

    // Independent coaches are single-location by nature — no branches API
    // call needed, just the default branch createOrganization already made.
    const branches = [{ id: org.branchId, name: 'Main Branch' }];

    // Sub-coaches reporting to this independent coach (Requirement #3) —
    // only a subset of independent coaches get one, until the budget runs out.
    const coachMemberships = [];
    if (subCoachBudget > 0 && r.bool(0.3)) {
      const cr = r.child('subcoach');
      const scPerson = fake.randomName(cr, cr.bool() ? 'F' : 'M');
      const scEmail = fake.emailFor(scPerson.firstName, scPerson.lastName, 'assistant_coach', config.runTag);
      const invite = await orgs.inviteMember(org.owner.client, org.organizationId, { email: scEmail, roleKeys: ['assistant_coach'] }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
      if (invite) {
        const scIdentity = await identity.loginIdentity(authProvider, scEmail);
        await orgs.acceptInvitation(scIdentity.client, invite.token).catch((err) => log.warn(`[soft-fail] ${err.message}`));
        const subCoachAgeYears = cr.int(22, 45);
        await identity.updateProfile(scIdentity.client, {
          displayName: scPerson.fullName, gender: scPerson.gender, phone: fake.randomPhone(cr),
          dob: daysAgo(today, subCoachAgeYears * 365), avatarPath: fake.avatarFor(cr, scPerson.firstName, scPerson.lastName),
        }).catch((err) => log.warn(`[soft-fail] ${err.message}`));
        await orgs.activateWorkspace(scIdentity.client, org.organizationId).catch((err) => log.warn(`[soft-fail] ${err.message}`));
        await orgs.setActiveRole(scIdentity.client, org.organizationId, 'assistant_coach').catch((err) => log.warn(`[soft-fail] ${err.message}`));
        const onboardable = await orgs.listOnboardableMembers(org.owner.client, org.organizationId).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return []; });
        const membership = (Array.isArray(onboardable) ? onboardable : []).find((m) => m.userId === scIdentity.userId);
        if (membership) {
          const staffProfile = await coachEnt.onboardStaff(org.owner.client, org.organizationId, {
            membershipId: membership.membershipId, designation: 'Assistant Coach', employmentType: cr.pick(['part_time', 'full_time']),
          }).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
          if (staffProfile) {
            coachMemberships.push({ membershipId: membership.membershipId, branchId: org.branchId });
            count('subCoaches.onboarded');
            subCoachBudget -= 1;
            recordActor({ email: scEmail, name: scPerson.fullName, role: 'assistant_coach', type: 'independent_coach', orgSlug: org.slug, organizationId: org.organizationId });
            await addCoachDocuments(org.owner.client, org.organizationId, staffProfile.id, scPerson.fullName);
          }
        }
      }
    }

    const targetBatches = Math.max(1, Math.round(config.dataset.batchesTarget / totalOrgs));
    const listing = await org.owner.client.get(`/api/v1/orgs/${org.organizationId}/listing`).catch((err) => { log.warn(`[soft-fail] ${err.message}`); return null; });
    await buildBatchesAndStudents(r, {
      orgId: org.organizationId, branches, owner: org.owner, coachMemberships, sub: org.sub,
      targetStudents: Math.max(1, Math.round(studentsPerOrg * 0.6)), targetBatches, feePolicyId: feePolicy?.id, listingId: listing?.id, orgSlug: org.slug, orgType: 'independent_coach',
    });

    state.data.organizations[orgKey] = { organizationId: org.organizationId, branchId: org.branchId, orgType: 'independent_coach', slug: org.slug };
    count('organizations.independent_coaches_complete');
    log.progress('independent coaches', i + 1, config.dataset.independentCoaches);
    if (i % 5 === 0) persist();
  });
  for (const r of indieResults) if (!r.ok) log.error(`independent coach pipeline error: ${r.error?.stack ?? r.error}`);
  persist();

  // ── Cross-org guardian siblings (explicit, guaranteed scenario) ─────
  // A parent with one child at an academy AND another at an independent
  // coach already happens incidentally (getGuardian's 35% reuse chance
  // draws from ONE pool shared across both loops above) — but that's luck,
  // not a guarantee, and easy to miss entirely at --dataset=smoke scale.
  // Force a deterministic handful here, with concrete (orgId, wardUserId)
  // evidence recorded to state.crossOrgSiblings so validate.mjs can assert
  // it really happened, not just hope for it.
  log.step('Adding cross-org guardian siblings (parent with kids at two different orgs)');
  const crossOrgCandidates = [...guardianLinks.entries()].filter(([, links]) => new Set(links.map((l) => l.orgType)).size === 1);
  const crossOrgTarget = Math.min(crossOrgCandidates.length, Math.max(1, Math.round((config.dataset.academies + config.dataset.independentCoaches) * 0.03)));
  if (crossOrgCandidates.length < crossOrgTarget) {
    log.warn(`Only ${crossOrgCandidates.length} single-org-type guardians available (wanted ${crossOrgTarget}) — dataset may be too small for full cross-org coverage.`);
  }
  const orgsByType = {
    academy: Object.entries(state.data.organizations).filter(([, o]) => o.orgType === 'academy'),
    independent_coach: Object.entries(state.data.organizations).filter(([, o]) => o.orgType === 'independent_coach'),
  };
  state.data.crossOrgSiblings = state.data.crossOrgSiblings ?? [];
  for (let i = 0; i < crossOrgTarget; i++) {
    const [guardianEmail, links] = crossOrgCandidates[i];
    const existingLink = links[0];
    const targetType = existingLink.orgType === 'academy' ? 'independent_coach' : 'academy';
    const pool = orgsByType[targetType];
    if (pool.length === 0) continue;
    const cr = rng.child(`cross-org-sibling-${i}`);
    const [targetOrgKey, targetOrg] = cr.pick(pool);
    const targetOwnerEmail = targetOrgKey.split('-').slice(2).join('-');
    if (!targetOwnerEmail) continue;

    const targetOwner = await identity.loginIdentity(authProvider, targetOwnerEmail);
    const batches = await targetOwner.client.get(`/api/v1/orgs/${targetOrg.organizationId}/batches`).catch(() => []);
    if (!Array.isArray(batches) || batches.length === 0) continue;
    const batch = cr.pick(batches);

    const guardian = await identity.loginIdentity(authProvider, guardianEmail);
    const person = fake.randomName(cr, cr.bool() ? 'F' : 'M');
    const ward = await identity.createWard(guardian.client, {
      displayName: person.fullName, relationship: cr.pick(['father', 'mother', 'guardian']),
      dob: daysAgo(today, cr.int(7, 16) * 365), consentAuthority: true,
    }).catch((err) => { log.warn(`cross-org sibling ward failed: ${err.message}`); return null; });
    if (!ward) continue;

    const enrollment = await studentEnt.enrollDirect(targetOwner.client, targetOrg.organizationId, {
      branchId: batch.branchId, studentUserId: ward.wardUserId, rollNumber: `SIB-${String(i + 1).padStart(4, '0')}`, startedOn: daysAgo(today, cr.int(0, 30)),
    }).catch((err) => { log.warn(`cross-org sibling enroll failed: ${err.message}`); return null; });
    if (!enrollment) continue;
    await scheduling.addToRoster(targetOwner.client, targetOrg.organizationId, batch.id, enrollment.id).catch((err) => log.warn(`[soft-fail] ${err.message}`));

    state.data.crossOrgSiblings.push({
      guardianEmail,
      linkA: { orgType: existingLink.orgType, orgId: existingLink.orgId, wardUserId: existingLink.wardUserId },
      linkB: { orgType: targetType, orgId: targetOrg.organizationId, wardUserId: ward.wardUserId },
    });
    count('students.cross_org_siblings');
  }
  persist();

  printSummary();
  log.info(`State file: ${state.file}`);
  log.info(`${state.data.actors.length} login-able identities recorded — run "node testing/credentials.mjs --run-tag=${config.runTag}" for a filterable email/role/type table (no passwords exist; sign in via magic link, see README's "Auth bootstrap").`);
  return getCounters();
}

main().catch((err) => {
  console.error('\nSEED FAILED:', err);
  process.exitCode = 1;
});
