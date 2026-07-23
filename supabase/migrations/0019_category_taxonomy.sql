-- Abhyas V2 — Category/Subcategory/Tag taxonomy + coach documents bucket.
--
-- Context: the coach-profile wizard's Professional Profile step was showing
-- Category as a flat de-duped taxonomy_sports.category string ("track_and_
-- field") because that's all V2 had — taxonomy_sports (migration 0013) is
-- explicitly "a small v1 bootstrap set... real content growth is an ops/
-- content task, not a schema change." Product asked to use V1's real
-- taxonomy instead (categories -> subcategories -> tags, covering Sports,
-- Fitness, Martial Arts, Dance, Music, Academic/Tuition, etc. — not just
-- sports). That taxonomy already exists as a full, working feature: table
-- shape ports from migrations_Backup/0006_coach_category_taxonomy.sql, seed
-- data ports verbatim from migrations_Backup/0007_seed_category_taxonomy
-- .sql, and the frontend (CategoryPicker.tsx, useCategoryTaxonomy.ts, and
-- the V1 CoachOnboardingWizard that already reads/writes it) is reused
-- unmodified — only the DB tables were missing from V2's active schema.
--
-- Deliberately NOT porting migrations_Backup/0006's coach_categories/
-- coach_tags JOIN tables — V2 already has its own convention for "what a
-- coach teaches" (coach_profiles.sport_keys/service_area_keys as plain
-- array columns, no join table), so category/subcategory/tag selections go
-- on coach_profiles the same way, not as a separate join table pair.
--
-- taxonomy_sports/sport_keys is UNCHANGED and still backs Explore/
-- Marketplace search (0013) — migrating that search surface onto this
-- richer taxonomy is real, separate scope, not a rewire, so the wizard's
-- Category/Specialties picker and Explore's sport filter now read from two
-- different taxonomies until that migration happens.

-- 1. categories --------------------------------------------------------
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  icon text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. subcategories -------------------------------------------------------
create table subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  slug text not null unique,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

-- 3. tags ------------------------------------------------------------------
-- subcategory_id nullable: NULL means the tag applies broadly (Board tags
-- apply across every Academic/Tuition grade-band rather than being
-- duplicated per subcategory). Non-null scopes it to one subcategory.
create table tags (
  id uuid primary key default gen_random_uuid(),
  subcategory_id uuid references subcategories(id) on delete cascade,
  tag_type text not null check (tag_type in ('subject', 'board', 'stream', 'exam')),
  name text not null,
  slug text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index tags_unique_global_idx on tags(tag_type, slug) where subcategory_id is null;
create unique index tags_unique_scoped_idx on tags(subcategory_id, tag_type, slug) where subcategory_id is not null;

create index categories_active_idx on categories(is_active, display_order);
create index subcategories_category_idx on subcategories(category_id);
create index tags_subcategory_idx on tags(subcategory_id);

-- ── RLS: platform-wide reference data, public read (same shape as
-- taxonomy_sports/geo_cities/geo_areas in 0013) ──

-- service_role grants are explicit and required here, unlike most of this
-- schema: tables created by our migrations are owned by role `postgres`,
-- and that role's default ACL (unlike supabase_admin-owned tables) does NOT
-- include SELECT for service_role — only Delete/References/Trigger/
-- Maintenance. db.getServiceClient() (raw pg, packages/platform) connects
-- as postgres directly so it never notices; PostgREST-via-service-role
-- (apps/web/src/lib/api.ts's adminDb(), what /api/v1/public/categories
-- uses) does, and 500'd with "permission denied" without these. This is a
-- pre-existing gap on every table this schema has created so far (e.g.
-- coach_profiles, 0016) that simply never had an adminDb()-based reader
-- before this one.

alter table categories enable row level security;
create policy categories_select_all on categories for select to authenticated using (true);
grant select on categories to authenticated, service_role;

alter table subcategories enable row level security;
create policy subcategories_select_all on subcategories for select to authenticated using (true);
grant select on subcategories to authenticated, service_role;

alter table tags enable row level security;
create policy tags_select_all on tags for select to authenticated using (true);
grant select on tags to authenticated, service_role;

-- 4. coach_profiles: category/subcategory/tag selection (parallels
-- sport_keys/service_area_keys — plain columns, not a join table) ---------
alter table coach_profiles
  add column category_id uuid references categories(id),
  add column subcategory_ids uuid[] not null default '{}',
  add column primary_subcategory_id uuid references subcategories(id),
  add column tag_ids uuid[] not null default '{}';

-- coach_profiles itself (0016) never granted service_role SELECT either —
-- needed now for /api/v1/public/categories' coachCount query.
grant select on coach_profiles to service_role;

-- 5. Seed — ported verbatim from migrations_Backup/0007_seed_category_
--    taxonomy.sql (values below are the FINAL state per that file's header).

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
    ('Academic / Tuition',           'academic-tuition',            '📚', 11);

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Badminton', 'badminton', 1), ('Cricket', 'cricket', 2), ('Football', 'football', 3),
    ('Basketball', 'basketball', 4), ('Table Tennis', 'table-tennis', 5), ('Tennis', 'tennis', 6),
    ('Swimming', 'swimming', 7), ('Athletics', 'athletics-track', 8), ('Skating', 'skating', 9),
    ('Chess', 'chess', 10)
) as v(name, slug, ord) where categories.slug = 'sports';

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('General Fitness', 'general-fitness', 1), ('Gym / Strength Training', 'gym-strength-training', 2),
    ('CrossFit / Functional Training', 'crossfit-functional-training', 3), ('Zumba', 'zumba', 4),
    ('Aerobics', 'aerobics', 5), ('HIIT', 'hiit', 6), ('Calisthenics', 'calisthenics', 7),
    ('Personal Training', 'personal-training', 8), ('Running', 'running', 9)
) as v(name, slug, ord) where categories.slug = 'fitness';

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Karate', 'karate', 1), ('Taekwondo', 'taekwondo', 2), ('Kung Fu', 'kung-fu', 3),
    ('Boxing', 'boxing', 4), ('Kickboxing', 'kickboxing', 5), ('Women''s Self-Defense', 'womens-self-defense', 6)
) as v(name, slug, ord) where categories.slug = 'martial-arts-self-defense';

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Hatha Yoga', 'hatha-yoga', 1), ('Power Yoga', 'power-yoga', 2), ('Pilates', 'pilates', 3),
    ('Meditation & Mindfulness', 'meditation-mindfulness', 4), ('Physiotherapy', 'physiotherapy', 5),
    ('Nutrition Counseling', 'nutrition-counseling', 6)
) as v(name, slug, ord) where categories.slug = 'yoga-wellness';

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Bharatanatyam', 'bharatanatyam', 1), ('Kathak', 'kathak', 2), ('Odissi', 'odissi', 3),
    ('Bollywood', 'bollywood', 4), ('Hip-Hop', 'hip-hop', 5), ('Contemporary', 'contemporary', 6),
    ('Ballet', 'ballet', 7), ('Salsa/Ballroom', 'salsa-ballroom', 8), ('Folk', 'folk', 9)
) as v(name, slug, ord) where categories.slug = 'dance';

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Vocal Classical', 'vocal-classical', 1), ('Vocal Western', 'vocal-western', 2), ('Guitar', 'guitar', 3),
    ('Piano/Keyboard', 'piano-keyboard', 4), ('Violin', 'violin', 5), ('Drums', 'drums', 6),
    ('Tabla', 'tabla', 7), ('Flute', 'flute', 8), ('Music Production/DJ', 'music-production-dj', 9)
) as v(name, slug, ord) where categories.slug = 'music';

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Painting & Drawing', 'painting-drawing', 1), ('Sketching', 'sketching', 2), ('Pottery', 'pottery', 3),
    ('Photography', 'photography', 4), ('Craft & DIY', 'craft-diy', 5)
) as v(name, slug, ord) where categories.slug = 'visual-arts';

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Theatre/Drama', 'theatre-drama', 1)
) as v(name, slug, ord) where categories.slug = 'performing-arts';

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Trekking', 'trekking', 1), ('Rock Climbing', 'rock-climbing', 2), ('Cycling', 'cycling', 3),
    ('Skateboarding', 'skateboarding', 4), ('Horse Riding', 'horse-riding', 5)
) as v(name, slug, ord) where categories.slug = 'adventure-outdoor';

insert into subcategories (category_id, name, slug, display_order)
select id, v.name, v.slug, v.ord from categories, (values
    ('Coding for Kids (Scratch/Python basics)', 'coding-for-kids', 1), ('Web Development', 'web-development', 2),
    ('App Development', 'app-development', 3), ('AI/ML Basics', 'ai-ml-basics', 4), ('Robotics', 'robotics', 5),
    ('Game Development', 'game-development', 6), ('AI Tools', 'ai-tools', 7)
) as v(name, slug, ord) where categories.slug = 'coding-technology';

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
) as v(name, slug, ord) where categories.slug = 'academic-tuition';

-- Board tags — global (subcategory_id NULL), apply across every Academic grade-band.
insert into tags (subcategory_id, tag_type, name, slug, display_order) values
    (null, 'board', 'CBSE', 'cbse', 1),
    (null, 'board', 'ICSE', 'icse', 2),
    (null, 'board', 'State Board', 'state-board', 3),
    (null, 'board', 'IB', 'ib', 4);

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Phonics', 'phonics', 1), ('Basic Numeracy', 'basic-numeracy', 2), ('Rhymes', 'rhymes', 3), ('Handwriting', 'handwriting', 4)
) as v(name, slug, ord) where subcategories.slug = 'pre-primary-foundation';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('English', 'english', 1), ('Math', 'math', 2), ('EVS', 'evs', 3),
    ('Hindi/Regional Language', 'hindi-regional-language', 4), ('GK', 'gk', 5)
) as v(name, slug, ord) where subcategories.slug = 'primary-class-3-5';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('English', 'english', 1), ('Math', 'math', 2), ('Science', 'science', 3), ('Social Studies', 'social-studies', 4),
    ('Sanskrit/Third Language', 'sanskrit-third-language', 5), ('Computer Basics', 'computer-basics', 6)
) as v(name, slug, ord) where subcategories.slug = 'middle-school-class-6-8';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Math', 'math', 1), ('Science (Physics/Chemistry/Biology combined)', 'science-pcb', 2),
    ('Social Science', 'social-science', 3), ('English', 'english', 4)
) as v(name, slug, ord) where subcategories.slug = 'secondary-class-9-10';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Physics', 'physics', 1), ('Chemistry', 'chemistry', 2), ('Biology', 'biology', 3), ('Math', 'math', 4),
    ('Accountancy', 'accountancy', 5), ('Economics', 'economics', 6), ('Business Studies', 'business-studies', 7),
    ('Computer Science', 'computer-science', 8), ('English', 'english', 9)
) as v(name, slug, ord) where subcategories.slug = 'senior-secondary-class-11-12';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'stream', v.name, v.slug, v.ord from subcategories, (values
    ('Science', 'science', 1), ('Commerce', 'commerce', 2), ('Arts', 'arts', 3)
) as v(name, slug, ord) where subcategories.slug = 'senior-secondary-class-11-12';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'exam', v.name, v.slug, v.ord from subcategories, (values
    ('JEE Main', 'jee-main', 1), ('JEE Advanced', 'jee-advanced', 2), ('BITSAT', 'bitsat', 3), ('State CETs', 'state-cets', 4)
) as v(name, slug, ord) where subcategories.slug = 'competitive-engineering';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'exam', v.name, v.slug, v.ord from subcategories, (values
    ('NEET-UG', 'neet-ug', 1), ('AIIMS/Other Pre-Med', 'aiims-other-pre-med', 2)
) as v(name, slug, ord) where subcategories.slug = 'competitive-medical';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'exam', v.name, v.slug, v.ord from subcategories, (values
    ('Olympiad Prep (NTSE, NSO, IMO)', 'olympiad-prep', 1), ('Early JEE/NEET Foundation', 'early-jee-neet-foundation', 2)
) as v(name, slug, ord) where subcategories.slug = 'competitive-foundation';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'exam', v.name, v.slug, v.ord from subcategories, (values
    ('UPSC', 'upsc', 1), ('Banking (IBPS/SBI)', 'banking-ibps-sbi', 2), ('SSC', 'ssc', 3),
    ('State PSC', 'state-psc', 4), ('Defence (NDA/CDS)', 'defence-nda-cds', 5)
) as v(name, slug, ord) where subcategories.slug = 'competitive-government-other';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Spoken English', 'spoken-english', 1), ('IELTS/TOEFL/PTE Prep', 'ielts-toefl-pte-prep', 2),
    ('French', 'french', 3), ('German', 'german', 4), ('Spanish', 'spanish', 5), ('Japanese', 'japanese', 6),
    ('Telugu', 'telugu', 7), ('Hindi', 'hindi', 8), ('Sanskrit', 'sanskrit', 9)
) as v(name, slug, ord) where subcategories.slug = 'academic-languages';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Robotics Kits', 'robotics-kits', 1), ('Science Projects', 'science-projects', 2),
    ('Math Olympiad Training', 'math-olympiad-training', 3), ('Electronics/Arduino', 'electronics-arduino', 4)
) as v(name, slug, ord) where subcategories.slug = 'stem-innovation';

insert into tags (subcategory_id, tag_type, name, slug, display_order)
select id, 'subject', v.name, v.slug, v.ord from subcategories, (values
    ('Exam Strategy & Time Management', 'exam-strategy-time-management', 1),
    ('Career Counseling', 'career-counseling', 2), ('College Admissions (India/Abroad)', 'college-admissions', 3)
) as v(name, slug, ord) where subcategories.slug = 'study-skills-counseling';

-- 6. coach-documents bucket — PRIVATE (unlike avatars, verification
-- documents are never publicly readable). Upload goes through the same
-- signed-URL adapter as avatars (packages/platform/src/storage); reads use
-- signedRead, never getPublicUrl.
insert into storage.buckets (id, name, public)
values ('coach-documents', 'coach-documents', false)
on conflict (id) do nothing;
