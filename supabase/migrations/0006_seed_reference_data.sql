-- Abhyas V2 — Seed reference data: permission catalogue, system roles,
-- role_permissions access matrix, and platform reference data (taxonomy,
-- geography, category/subcategory/tag taxonomy, progress metric library,
-- notification template library).
--
-- This is versioned-by-migration reference data (Doc 04 §4), NOT
-- supabase/seed.sql, which is local-fixture-only and never applied to
-- hosted projects. Idempotent throughout (on conflict do nothing) so it's
-- safe to re-run.
--
-- The permission catalogue below is the FINAL key list — it folds in every
-- key added after the original Doc 04 §4 catalogue across later phases
-- (finance.payout.manage, hr.staff.read, hr.payout_settings.read,
-- progress.metric.manage, platform.referral.manage) rather than a separate
-- "addendum" insert per phase.

-- ── Permission catalogue (Doc 04 §4, platform reference data) ────

insert into permissions (key) values
  ('org.settings.read'), ('org.settings.update'), ('org.branding.update'),
  ('org.branch.create'), ('org.branch.update'), ('org.branch.archive'),
  ('org.billing.read'), ('org.billing.manage'), ('org.delete.request'),
  ('people.member.invite'), ('people.member.read'), ('people.member.update'), ('people.member.suspend'),
  ('people.role.grant'), ('people.role.revoke'),
  ('people.join_request.read'), ('people.join_request.approve'),
  ('people.student.read'), ('people.student.update'), ('people.consent.capture'),
  ('schedule.batch.create'), ('schedule.batch.update'), ('schedule.batch.archive'),
  ('schedule.calendar.read'), ('schedule.calendar.manage'), ('schedule.holiday.manage'),
  ('attendance.record'), ('attendance.read'), ('attendance.override'),
  ('attendance.review_queue.resolve'), ('attendance.face.enroll'), ('attendance.self_record'),
  ('finance.policy.manage'), ('finance.charge.create'), ('finance.charge.read'), ('finance.charge.waive'),
  ('finance.fine.manage'), ('finance.payment.record'), ('finance.proof.submit'), ('finance.proof.approve'),
  ('finance.refund.issue'), ('finance.payout.read'), ('finance.payout.manage'), ('finance.ledger.read'),
  ('progress.metric.log'), ('progress.read'), ('progress.report.generate'), ('progress.metric.manage'),
  ('notify.template.manage'), ('notify.send.manual'), ('notify.log.read'), ('notify.fee_reminder.send'),
  ('hr.staff.onboard'), ('hr.staff.read'), ('hr.leave.approve'),
  ('hr.payout_settings.manage'), ('hr.payout_settings.read'),
  ('market.listing.manage'), ('market.lead.read'), ('market.lead.assign'), ('market.review.respond'),
  ('medical.grant.request'), ('medical.record.read'),
  ('platform.org.lifecycle'), ('platform.verification.review'), ('platform.support.request_access'),
  ('platform.subscription.manage'), ('platform.flag.manage'), ('platform.role.grant'), ('platform.announce'),
  ('platform.referral.manage'),
  ('audit.log.read'), ('platform.audit.read')
on conflict (key) do nothing;

-- ── System roles (Doc 04 §3) ─────────────────────────────────────
-- Org role keys match join_requests.requested_role / invitation role_keys.

insert into roles (key, scope) values
  ('owner','org'), ('org_admin','org'), ('branch_admin','org'), ('coach','org'),
  ('assistant_coach','org'), ('front_desk','org'), ('accountant','org'), ('student','org'),
  ('super_admin','platform'), ('verification_ops','platform'), ('support','platform'),
  ('platform_finance','platform'), ('marketplace_partner','platform')
on conflict (organization_id, key) do nothing;

-- ── role_permissions (Doc 04 §5 access matrix, translated — several
-- interpretive judgment calls where the matrix's ✅/🔷/👁 markers don't map
-- 1:1 onto permission-key granularity; re-derive from this file, not memory,
-- if the matrix is ever revised) ──────────────────────────────────

insert into role_permissions (role_id, permission_key)
select r.id, x.permission_key
from (values
  -- Owner: full org-scope control.
  ('owner','org.settings.read'), ('owner','org.settings.update'), ('owner','org.branding.update'),
  ('owner','org.branch.create'), ('owner','org.branch.update'), ('owner','org.branch.archive'),
  ('owner','org.billing.read'), ('owner','org.billing.manage'), ('owner','org.delete.request'),
  ('owner','people.member.invite'), ('owner','people.member.read'), ('owner','people.member.update'),
  ('owner','people.member.suspend'), ('owner','people.role.grant'), ('owner','people.role.revoke'),
  ('owner','people.join_request.read'), ('owner','people.join_request.approve'),
  ('owner','people.student.read'), ('owner','people.student.update'), ('owner','people.consent.capture'),
  ('owner','schedule.batch.create'), ('owner','schedule.batch.update'), ('owner','schedule.batch.archive'),
  ('owner','schedule.calendar.read'), ('owner','schedule.calendar.manage'), ('owner','schedule.holiday.manage'),
  ('owner','attendance.record'), ('owner','attendance.read'), ('owner','attendance.override'),
  ('owner','attendance.review_queue.resolve'), ('owner','attendance.face.enroll'),
  ('owner','finance.policy.manage'), ('owner','finance.charge.create'), ('owner','finance.charge.read'),
  ('owner','finance.charge.waive'), ('owner','finance.fine.manage'), ('owner','finance.payment.record'),
  ('owner','finance.proof.submit'), ('owner','finance.proof.approve'), ('owner','finance.refund.issue'),
  ('owner','finance.payout.read'), ('owner','finance.payout.manage'), ('owner','finance.ledger.read'),
  ('owner','progress.metric.log'), ('owner','progress.read'), ('owner','progress.report.generate'),
  ('owner','progress.metric.manage'),
  ('owner','notify.template.manage'), ('owner','notify.send.manual'), ('owner','notify.log.read'),
  ('owner','notify.fee_reminder.send'),
  ('owner','hr.staff.onboard'), ('owner','hr.leave.approve'), ('owner','hr.payout_settings.manage'),
  ('owner','market.listing.manage'), ('owner','market.lead.read'), ('owner','market.lead.assign'),
  ('owner','market.review.respond'),
  ('owner','medical.grant.request'), ('owner','medical.record.read'),
  ('owner','audit.log.read'),

  -- Org Admin: Owner's set minus billing-plan changes and org deletion.
  ('org_admin','org.settings.read'), ('org_admin','org.settings.update'), ('org_admin','org.branding.update'),
  ('org_admin','org.branch.create'), ('org_admin','org.branch.update'), ('org_admin','org.branch.archive'),
  ('org_admin','org.billing.read'),
  ('org_admin','people.member.invite'), ('org_admin','people.member.read'), ('org_admin','people.member.update'),
  ('org_admin','people.member.suspend'), ('org_admin','people.role.grant'), ('org_admin','people.role.revoke'),
  ('org_admin','people.join_request.read'), ('org_admin','people.join_request.approve'),
  ('org_admin','people.student.read'), ('org_admin','people.student.update'), ('org_admin','people.consent.capture'),
  ('org_admin','schedule.batch.create'), ('org_admin','schedule.batch.update'), ('org_admin','schedule.batch.archive'),
  ('org_admin','schedule.calendar.read'), ('org_admin','schedule.calendar.manage'), ('org_admin','schedule.holiday.manage'),
  ('org_admin','attendance.record'), ('org_admin','attendance.read'), ('org_admin','attendance.override'),
  ('org_admin','attendance.review_queue.resolve'), ('org_admin','attendance.face.enroll'),
  ('org_admin','finance.policy.manage'), ('org_admin','finance.charge.create'), ('org_admin','finance.charge.read'),
  ('org_admin','finance.charge.waive'), ('org_admin','finance.fine.manage'), ('org_admin','finance.payment.record'),
  ('org_admin','finance.proof.submit'), ('org_admin','finance.proof.approve'), ('org_admin','finance.refund.issue'),
  ('org_admin','finance.payout.read'), ('org_admin','finance.ledger.read'),
  ('org_admin','progress.metric.log'), ('org_admin','progress.read'), ('org_admin','progress.report.generate'),
  ('org_admin','progress.metric.manage'),
  ('org_admin','notify.template.manage'), ('org_admin','notify.send.manual'), ('org_admin','notify.log.read'),
  ('org_admin','notify.fee_reminder.send'),
  ('org_admin','hr.staff.onboard'), ('org_admin','hr.leave.approve'), ('org_admin','hr.payout_settings.manage'),
  ('org_admin','market.listing.manage'), ('org_admin','market.lead.read'), ('org_admin','market.lead.assign'),
  ('org_admin','market.review.respond'),
  ('org_admin','medical.grant.request'), ('org_admin','medical.record.read'),
  ('org_admin','audit.log.read'),

  -- Branch Admin: branch-scoped subset (has_perm_branch does the scoping).
  ('branch_admin','org.settings.read'), ('branch_admin','org.branch.update'),
  ('branch_admin','people.member.read'), ('branch_admin','people.member.invite'),
  ('branch_admin','people.member.suspend'), ('branch_admin','people.role.grant'), ('branch_admin','people.role.revoke'),
  ('branch_admin','people.join_request.read'), ('branch_admin','people.join_request.approve'),
  ('branch_admin','people.student.read'), ('branch_admin','people.student.update'), ('branch_admin','people.consent.capture'),
  ('branch_admin','schedule.batch.create'), ('branch_admin','schedule.batch.update'), ('branch_admin','schedule.batch.archive'),
  ('branch_admin','schedule.calendar.read'), ('branch_admin','schedule.calendar.manage'), ('branch_admin','schedule.holiday.manage'),
  ('branch_admin','attendance.record'), ('branch_admin','attendance.read'), ('branch_admin','attendance.override'),
  ('branch_admin','attendance.review_queue.resolve'), ('branch_admin','attendance.face.enroll'),
  ('branch_admin','finance.charge.create'), ('branch_admin','finance.charge.read'), ('branch_admin','finance.charge.waive'),
  ('branch_admin','finance.payment.record'), ('branch_admin','finance.proof.submit'), ('branch_admin','finance.proof.approve'),
  ('branch_admin','finance.refund.issue'),
  ('branch_admin','progress.read'),
  ('branch_admin','notify.template.manage'), ('branch_admin','notify.send.manual'),
  ('branch_admin','hr.staff.read'),

  -- Coach: own-batches subset (app-layer filter via my_batch_ids()).
  ('coach','people.student.read'),
  ('coach','schedule.batch.update'), ('coach','schedule.calendar.read'), ('coach','schedule.calendar.manage'),
  ('coach','attendance.record'), ('coach','attendance.read'), ('coach','attendance.review_queue.resolve'),
  ('coach','attendance.face.enroll'), ('coach','attendance.self_record'),
  ('coach','finance.charge.read'),
  ('coach','notify.send.manual'), ('coach','notify.fee_reminder.send'), ('coach','notify.template.manage'),
  ('coach','progress.metric.log'), ('coach','progress.read'),
  ('coach','market.listing.manage'),

  -- Assistant Coach: narrower than Coach — record/log only, no override or finance.
  ('assistant_coach','people.student.read'),
  ('assistant_coach','schedule.calendar.read'),
  ('assistant_coach','attendance.record'), ('assistant_coach','attendance.read'), ('assistant_coach','attendance.self_record'),
  ('assistant_coach','progress.metric.log'),

  -- Front Desk: check-in + branch read + proof intake, no approvals.
  ('front_desk','people.join_request.read'), ('front_desk','people.student.read'),
  ('front_desk','schedule.calendar.read'),
  ('front_desk','attendance.record'), ('front_desk','attendance.read'), ('front_desk','attendance.face.enroll'),
  ('front_desk','attendance.self_record'),
  ('front_desk','finance.charge.read'), ('front_desk','finance.proof.submit'),

  -- Accountant: finance module full, no people/attendance write.
  ('accountant','org.billing.read'),
  ('accountant','finance.policy.manage'), ('accountant','finance.charge.create'), ('accountant','finance.charge.read'),
  ('accountant','finance.charge.waive'), ('accountant','finance.fine.manage'), ('accountant','finance.payment.record'),
  ('accountant','finance.proof.submit'), ('accountant','finance.proof.approve'), ('accountant','finance.refund.issue'),
  ('accountant','finance.payout.read'), ('accountant','finance.payout.manage'), ('accountant','finance.ledger.read'),
  ('accountant','hr.payout_settings.read'),
  ('accountant','audit.log.read')

  -- Student: no role_permissions rows — self-access is an identity right
  -- (self policies keyed on enrollment/user_id), not RBAC-mediated. The role
  -- row exists so invitations/join_requests can reference the 'student' key.

) as x(role_key, permission_key)
join roles r on r.key = x.role_key and r.organization_id is null
on conflict do nothing;

-- Platform-role matrix (Doc 04 §5, second table).
insert into role_permissions (role_id, permission_key)
select r.id, x.permission_key
from (values
  ('super_admin','platform.org.lifecycle'), ('super_admin','platform.verification.review'),
  ('super_admin','platform.support.request_access'), ('super_admin','platform.subscription.manage'),
  ('super_admin','platform.flag.manage'), ('super_admin','platform.role.grant'), ('super_admin','platform.announce'),
  ('super_admin','platform.audit.read'), ('super_admin','platform.referral.manage'),
  ('verification_ops','platform.verification.review'),
  ('support','platform.support.request_access'),
  ('platform_finance','platform.subscription.manage'), ('platform_finance','platform.referral.manage')
  -- marketplace_partner: no catalogue permission maps to "aggregate campaign
  -- analytics read" yet — empty bundle, flagged here rather than inventing
  -- a key with no consumer.
) as x(role_key, permission_key)
join roles r on r.key = x.role_key and r.organization_id is null
on conflict do nothing;

-- ── Marketplace platform reference data (Doc 07 §11) ─────────────
-- Small v1 bootstrap set, India-first — real content growth (more sports/
-- cities/areas) is an ops/content task, not a schema change.

insert into taxonomy_sports (key, label, category) values
  ('swimming', 'Swimming', 'aquatics'),
  ('football', 'Football', 'team_sports'),
  ('cricket', 'Cricket', 'team_sports'),
  ('basketball', 'Basketball', 'team_sports'),
  ('badminton', 'Badminton', 'racquet_sports'),
  ('tennis', 'Tennis', 'racquet_sports'),
  ('chess', 'Chess', 'mind_sports'),
  ('yoga', 'Yoga', 'fitness'),
  ('dance', 'Dance', 'performing_arts'),
  ('music', 'Music', 'performing_arts'),
  ('athletics', 'Athletics', 'track_and_field'),
  ('martial_arts', 'Martial Arts', 'combat_sports')
on conflict (key) do nothing;

insert into geo_cities (key, label, state) values
  ('bengaluru', 'Bengaluru', 'Karnataka'),
  ('mumbai', 'Mumbai', 'Maharashtra'),
  ('delhi', 'Delhi', 'Delhi'),
  ('hyderabad', 'Hyderabad', 'Telangana'),
  ('chennai', 'Chennai', 'Tamil Nadu'),
  ('pune', 'Pune', 'Maharashtra')
on conflict (key) do nothing;

insert into geo_areas (key, city_key, label) values
  ('bengaluru-koramangala', 'bengaluru', 'Koramangala'),
  ('bengaluru-indiranagar', 'bengaluru', 'Indiranagar'),
  ('bengaluru-whitefield', 'bengaluru', 'Whitefield'),
  ('mumbai-andheri', 'mumbai', 'Andheri'),
  ('mumbai-bandra', 'mumbai', 'Bandra'),
  ('delhi-dwarka', 'delhi', 'Dwarka'),
  ('hyderabad-gachibowli', 'hyderabad', 'Gachibowli'),
  ('chennai-adyar', 'chennai', 'Adyar'),
  ('pune-kothrud', 'pune', 'Kothrud')
on conflict (key) do nothing;

-- ── Category/Subcategory/Tag taxonomy ─────────────────────────────
-- Ports the full V1 taxonomy (categories -> subcategories -> tags, covering
-- Sports, Fitness, Martial Arts, Dance, Music, Academic/Tuition, etc.) —
-- backs the coach-profile wizard's Category/Specialties picker and the
-- Academy onboarding wizard's Programs & Taxonomy step. Unrelated to
-- taxonomy_sports/sport_keys above, which still backs Explore's sport filter.

insert into categories (name, slug, icon, display_order) values
    ('Sports',                       'sports',                     '🏃', 1),
    ('Fitness',                      'fitness',                    '🏋️', 2),
    ('Martial Arts',                 'martial-arts-self-defense',  '🥋', 3),
    ('Yoga & Wellness',              'yoga-wellness',               '🧘', 4),
    ('Dance',                        'dance',                       '💃', 5),
    ('Music',                        'music',                       '🎵', 6),
    ('Visual Arts',                  'visual-arts',                 '🎨', 7),
    ('Performing Arts',              'performing-arts',             '🎭', 8),
    ('Adventure & Outdoor',          'adventure-outdoor',           '🏕️', 9),
    ('Coding & Technology',          'coding-technology',           '💻', 10),
    ('Academic / Tuition',           'academic-tuition',            '📚', 11)
on conflict (slug) do nothing;

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Badminton', 'badminton', 1), ('Cricket', 'cricket', 2), ('Football', 'football', 3),
    ('Basketball', 'basketball', 4), ('Table Tennis', 'table-tennis', 5), ('Tennis', 'tennis', 6),
    ('Swimming', 'swimming', 7), ('Athletics', 'athletics-track', 8), ('Skating', 'skating', 9),
    ('Chess', 'chess', 10)
) as v(name, slug, ord) where categories.slug = 'sports'
on conflict (slug) do nothing;

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('General Fitness', 'general-fitness', 1), ('Gym / Strength Training', 'gym-strength-training', 2),
    ('CrossFit / Functional Training', 'crossfit-functional-training', 3), ('Zumba', 'zumba', 4),
    ('Aerobics', 'aerobics', 5), ('HIIT', 'hiit', 6), ('Calisthenics', 'calisthenics', 7),
    ('Personal Training', 'personal-training', 8), ('Running', 'running', 9)
) as v(name, slug, ord) where categories.slug = 'fitness'
on conflict (slug) do nothing;

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Karate', 'karate', 1), ('Taekwondo', 'taekwondo', 2), ('Kung Fu', 'kung-fu', 3),
    ('Boxing', 'boxing', 4), ('Kickboxing', 'kickboxing', 5), ('Women''s Self-Defense', 'womens-self-defense', 6)
) as v(name, slug, ord) where categories.slug = 'martial-arts-self-defense'
on conflict (slug) do nothing;

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Hatha Yoga', 'hatha-yoga', 1), ('Power Yoga', 'power-yoga', 2), ('Pilates', 'pilates', 3),
    ('Meditation & Mindfulness', 'meditation-mindfulness', 4), ('Physiotherapy', 'physiotherapy', 5),
    ('Nutrition Counseling', 'nutrition-counseling', 6)
) as v(name, slug, ord) where categories.slug = 'yoga-wellness'
on conflict (slug) do nothing;

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Bharatanatyam', 'bharatanatyam', 1), ('Kathak', 'kathak', 2), ('Odissi', 'odissi', 3),
    ('Bollywood', 'bollywood', 4), ('Hip-Hop', 'hip-hop', 5), ('Contemporary', 'contemporary', 6),
    ('Ballet', 'ballet', 7), ('Salsa/Ballroom', 'salsa-ballroom', 8), ('Folk', 'folk', 9)
) as v(name, slug, ord) where categories.slug = 'dance'
on conflict (slug) do nothing;

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Vocal Classical', 'vocal-classical', 1), ('Vocal Western', 'vocal-western', 2), ('Guitar', 'guitar', 3),
    ('Piano/Keyboard', 'piano-keyboard', 4), ('Violin', 'violin', 5), ('Drums', 'drums', 6),
    ('Tabla', 'tabla', 7), ('Flute', 'flute', 8), ('Music Production/DJ', 'music-production-dj', 9)
) as v(name, slug, ord) where categories.slug = 'music'
on conflict (slug) do nothing;

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Painting & Drawing', 'painting-drawing', 1), ('Sketching', 'sketching', 2), ('Pottery', 'pottery', 3),
    ('Photography', 'photography', 4), ('Craft & DIY', 'craft-diy', 5)
) as v(name, slug, ord) where categories.slug = 'visual-arts'
on conflict (slug) do nothing;

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Theatre/Drama', 'theatre-drama', 1)
) as v(name, slug, ord) where categories.slug = 'performing-arts'
on conflict (slug) do nothing;

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Trekking', 'trekking', 1), ('Rock Climbing', 'rock-climbing', 2), ('Cycling', 'cycling', 3),
    ('Skateboarding', 'skateboarding', 4), ('Horse Riding', 'horse-riding', 5)
) as v(name, slug, ord) where categories.slug = 'adventure-outdoor'
on conflict (slug) do nothing;

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Coding for Kids (Scratch/Python basics)', 'coding-for-kids', 1), ('Web Development', 'web-development', 2),
    ('App Development', 'app-development', 3), ('AI/ML Basics', 'ai-ml-basics', 4), ('Robotics', 'robotics', 5),
    ('Game Development', 'game-development', 6), ('AI Tools', 'ai-tools', 7)
) as v(name, slug, ord) where categories.slug = 'coding-technology'
on conflict (slug) do nothing;

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Pre-Primary & Foundation (Nursery–Class 2)', 'pre-primary-foundation', 1),
    ('Primary (Class 3–5)', 'primary-class-3-5', 2),
    ('Middle School (Class 6–8)', 'middle-school-class-6-8', 3),
    ('Secondary — Class 9–10', 'secondary-class-9-10', 4),
    ('Senior Secondary — Class 11–12', 'senior-secondary-class-11-12', 5),
    ('Competitive Exams — Engineering', 'competitive-engineering', 6),
    ('Competitive Exams — Medical', 'competitive-medical', 7),
    ('Competitive Exams — Foundation (Class 6–10)', 'competitive-foundation', 8),
    ('Competitive Exams — Government/Other', 'competitive-government-other', 9),
    ('Languages', 'academic-languages', 10),
    ('STEM & Innovation', 'stem-innovation', 11),
    ('Study Skills & Counseling', 'study-skills-counseling', 12)
) as v(name, slug, ord) where categories.slug = 'academic-tuition'
on conflict (slug) do nothing;

-- Board tags — global (subcategory_id NULL), apply across every Academic grade-band.
insert into tags (subcategory_id, tag_type, name, slug, display_order) values
    (null, 'board', 'CBSE', 'cbse', 1),
    (null, 'board', 'ICSE', 'icse', 2),
    (null, 'board', 'State Board', 'state-board', 3),
    (null, 'board', 'IB', 'ib', 4)
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Phonics', 'phonics', 1), ('Basic Numeracy', 'basic-numeracy', 2), ('Rhymes', 'rhymes', 3), ('Handwriting', 'handwriting', 4)
) as v(name, slug, ord) where subcategories.slug = 'pre-primary-foundation'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('English', 'english', 1), ('Math', 'math', 2), ('EVS', 'evs', 3),
    ('Hindi/Regional Language', 'hindi-regional-language', 4), ('GK', 'gk', 5)
) as v(name, slug, ord) where subcategories.slug = 'primary-class-3-5'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('English', 'english', 1), ('Math', 'math', 2), ('Science', 'science', 3), ('Social Studies', 'social-studies', 4),
    ('Sanskrit/Third Language', 'sanskrit-third-language', 5), ('Computer Basics', 'computer-basics', 6)
) as v(name, slug, ord) where subcategories.slug = 'middle-school-class-6-8'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Math', 'math', 1), ('Science (Physics/Chemistry/Biology combined)', 'science-pcb', 2),
    ('Social Science', 'social-science', 3), ('English', 'english', 4)
) as v(name, slug, ord) where subcategories.slug = 'secondary-class-9-10'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Physics', 'physics', 1), ('Chemistry', 'chemistry', 2), ('Biology', 'biology', 3), ('Math', 'math', 4),
    ('Accountancy', 'accountancy', 5), ('Economics', 'economics', 6), ('Business Studies', 'business-studies', 7),
    ('Computer Science', 'computer-science', 8), ('English', 'english', 9)
) as v(name, slug, ord) where subcategories.slug = 'senior-secondary-class-11-12'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'stream', v.name, v.slug, v.ord from subcategories, (values
    ('Science', 'science', 1), ('Commerce', 'commerce', 2), ('Arts', 'arts', 3)
) as v(name, slug, ord) where subcategories.slug = 'senior-secondary-class-11-12'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'exam', v.name, v.slug, v.ord from subcategories, (values
    ('JEE Main', 'jee-main', 1), ('JEE Advanced', 'jee-advanced', 2), ('BITSAT', 'bitsat', 3), ('State CETs', 'state-cets', 4)
) as v(name, slug, ord) where subcategories.slug = 'competitive-engineering'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'exam', v.name, v.slug, v.ord from subcategories, (values
    ('NEET-UG', 'neet-ug', 1), ('AIIMS/Other Pre-Med', 'aiims-other-pre-med', 2)
) as v(name, slug, ord) where subcategories.slug = 'competitive-medical'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'exam', v.name, v.slug, v.ord from subcategories, (values
    ('Olympiad Prep (NTSE, NSO, IMO)', 'olympiad-prep', 1), ('Early JEE/NEET Foundation', 'early-jee-neet-foundation', 2)
) as v(name, slug, ord) where subcategories.slug = 'competitive-foundation'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'exam', v.name, v.slug, v.ord from subcategories, (values
    ('UPSC', 'upsc', 1), ('Banking (IBPS/SBI)', 'banking-ibps-sbi', 2), ('SSC', 'ssc', 3),
    ('State PSC', 'state-psc', 4), ('Defence (NDA/CDS)', 'defence-nda-cds', 5)
) as v(name, slug, ord) where subcategories.slug = 'competitive-government-other'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Spoken English', 'spoken-english', 1), ('IELTS/TOEFL/PTE Prep', 'ielts-toefl-pte-prep', 2),
    ('French', 'french', 3), ('German', 'german', 4), ('Spanish', 'spanish', 5), ('Japanese', 'japanese', 6),
    ('Telugu', 'telugu', 7), ('Hindi', 'hindi', 8), ('Sanskrit', 'sanskrit', 9)
) as v(name, slug, ord) where subcategories.slug = 'academic-languages'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Robotics Kits', 'robotics-kits', 1), ('Science Projects', 'science-projects', 2),
    ('Math Olympiad Training', 'math-olympiad-training', 3), ('Electronics/Arduino', 'electronics-arduino', 4)
) as v(name, slug, ord) where subcategories.slug = 'stem-innovation'
on conflict do nothing;

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Exam Strategy & Time Management', 'exam-strategy-time-management', 1),
    ('Career Counseling', 'career-counseling', 2), ('College Admissions (India/Abroad)', 'college-admissions', 3)
) as v(name, slug, ord) where subcategories.slug = 'study-skills-counseling'
on conflict do nothing;

-- ── Progress & Performance: platform metric library (Doc 07 §13) ─
-- Vitals under sport_key 'general'; a starter sport-specific set keyed to
-- the taxonomy_sports seed above. Orgs add their own via progress.metric.manage.

insert into metric_definitions (organization_id, sport_key, key, label, unit, direction) values
  (null, 'general', 'height_cm', 'Height', 'cm', null),
  (null, 'general', 'weight_kg', 'Weight', 'kg', null),
  (null, 'general', 'resting_hr_bpm', 'Resting heart rate', 'bpm', 'lower_better'),
  (null, 'swimming', 'freestyle_50m_sec', '50m freestyle', 'sec', 'lower_better'),
  (null, 'swimming', 'endurance_laps', 'Endurance (continuous laps)', 'laps', 'higher_better'),
  (null, 'cricket', 'batting_avg', 'Batting average', 'runs', 'higher_better'),
  (null, 'cricket', 'bowling_economy', 'Bowling economy', 'runs/over', 'lower_better'),
  (null, 'football', 'sprint_40m_sec', '40m sprint', 'sec', 'lower_better'),
  (null, 'football', 'yo_yo_level', 'Yo-yo endurance level', 'level', 'higher_better'),
  (null, 'basketball', 'free_throw_pct', 'Free-throw accuracy', '%', 'higher_better'),
  (null, 'badminton', 'smash_speed_kmh', 'Smash speed', 'km/h', 'higher_better'),
  (null, 'tennis', 'serve_speed_kmh', 'Serve speed', 'km/h', 'higher_better'),
  (null, 'chess', 'rating', 'Rating', 'elo', 'higher_better'),
  (null, 'athletics', 'sprint_100m_sec', '100m sprint', 'sec', 'lower_better'),
  (null, 'athletics', 'long_jump_m', 'Long jump', 'm', 'higher_better'),
  (null, 'yoga', 'flexibility_score', 'Flexibility score', 'pts', 'higher_better')
on conflict (organization_id, sport_key, key) do nothing;

-- ── Notifications: platform template library seed ────────────────
-- attendance.absence_confirmed is the first consumer (Doc 14 §8's <5min
-- parent-alert latency target). English only — hi/te are a real, deliberate
-- gap (real translation content is needed, not placeholder text).

insert into notification_templates (organization_id, key, channel, language, body, variables) values
  (null, 'attendance.absence_confirmed', 'email', 'en',
   'Hi {{recipientName}}, {{studentName}} was marked absent from {{batchName}} on {{sessionDate}}. If this looks wrong, contact your academy.',
   '["recipientName", "studentName", "batchName", "sessionDate"]'),
  (null, 'attendance.absence_confirmed', 'push', 'en',
   '{{studentName}} was marked absent from {{batchName}} today.',
   '["studentName", "batchName"]')
on conflict do nothing;
