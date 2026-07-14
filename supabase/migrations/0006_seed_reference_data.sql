-- ============================================================
-- MIGRATION: 0006_seed_reference_data.sql
-- Abhyas — Reference/lookup data: default tenant, RBAC catalogue,
-- Discovery taxonomy, service-area geography.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION A: Default tenant
-- Required by the auth.users signup triggers in
-- 0004_functions_triggers.sql, which fall back to this tenant UUID
-- when a signup doesn't already carry one in its JWT app_metadata.
-- ────────────────────────────────────────────────────────────

INSERT INTO public.tenants (id, name, slug)
VALUES ('022c1494-057e-4c80-80dd-88fa4b1287b5', 'VidyaSopan Sports school', 'vidyasopan-sports-school')
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- SECTION B: RBAC — permission catalogue + system roles
-- ────────────────────────────────────────────────────────────

INSERT INTO public.permissions (module, action) VALUES
    ('attendance', 'mark'),
    ('attendance', 'view'),
    ('attendance', 'viewOwn'),
    ('audit_logs', 'view'),
    ('batches', 'create'),
    ('batches', 'delete'),
    ('batches', 'edit'),
    ('batches', 'view'),
    ('classes', 'create'),
    ('classes', 'delete'),
    ('classes', 'edit'),
    ('classes', 'view'),
    ('coaches', 'create'),
    ('coaches', 'delete'),
    ('coaches', 'edit'),
    ('coaches', 'view'),
    ('payments', 'manage'),
    ('payments', 'view'),
    ('reports', 'view'),
    ('roles', 'manage'),
    ('settings', 'manage'),
    ('students', 'create'),
    ('students', 'delete'),
    ('students', 'edit'),
    ('students', 'view'),
    ('users', 'create'),
    ('users', 'delete'),
    ('users', 'edit'),
    ('users', 'view');

INSERT INTO public.roles (name, tenant_id, is_system) VALUES
    ('Super Admin', NULL, true),
    ('Admin',       NULL, true),
    ('Coach',       NULL, true),
    ('Student',     NULL, true);

-- Super Admin: everything.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Super Admin';

-- Admin: everything except roles:manage (Super-Admin-only) and
-- attendance:viewOwn (that's the student-self permission).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Admin'
  AND (p.module, p.action) NOT IN (('roles', 'manage'), ('attendance', 'viewOwn'));

-- Coach.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Coach' AND (p.module, p.action) IN (
    ('attendance', 'mark'), ('attendance', 'view'),
    ('batches', 'edit'), ('batches', 'view'),
    ('classes', 'view'),
    ('reports', 'view'),
    ('students', 'view')
);

-- Student.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.name = 'Student' AND (p.module, p.action) IN (
    ('attendance', 'viewOwn'),
    ('payments', 'view'),
    ('reports', 'view')
);

-- ────────────────────────────────────────────────────────────
-- SECTION C: Discovery taxonomy — categories, subcategories, tags
-- ────────────────────────────────────────────────────────────

-- 1. Categories
INSERT INTO public.categories (name, slug, icon, display_order) VALUES
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

-- 2. Subcategories

-- Sports (Running lives under Fitness, not here)
INSERT INTO public.subcategories (category_id, name, slug, display_order)
SELECT id, v.name, v.slug, v.ord FROM public.categories, (VALUES
    ('Badminton', 'badminton', 1), ('Cricket', 'cricket', 2), ('Football', 'football', 3),
    ('Basketball', 'basketball', 4), ('Table Tennis', 'table-tennis', 5), ('Tennis', 'tennis', 6),
    ('Swimming', 'swimming', 7), ('Athletics', 'athletics-track', 8), ('Skating', 'skating', 9),
    ('Chess', 'chess', 10)
) AS v(name, slug, ord) WHERE categories.slug = 'sports';

-- Fitness
INSERT INTO public.subcategories (category_id, name, slug, display_order)
SELECT id, v.name, v.slug, v.ord FROM public.categories, (VALUES
    ('General Fitness', 'general-fitness', 1), ('Gym / Strength Training', 'gym-strength-training', 2),
    ('CrossFit / Functional Training', 'crossfit-functional-training', 3), ('Zumba', 'zumba', 4),
    ('Aerobics', 'aerobics', 5), ('HIIT', 'hiit', 6), ('Calisthenics', 'calisthenics', 7),
    ('Personal Training', 'personal-training', 8), ('Running', 'running', 9)
) AS v(name, slug, ord) WHERE categories.slug = 'fitness';

-- Martial Arts & Self-Defense
INSERT INTO public.subcategories (category_id, name, slug, display_order)
SELECT id, v.name, v.slug, v.ord FROM public.categories, (VALUES
    ('Karate', 'karate', 1), ('Taekwondo', 'taekwondo', 2), ('Kung Fu', 'kung-fu', 3),
    ('Boxing', 'boxing', 4), ('Kickboxing', 'kickboxing', 5), ('Women''s Self-Defense', 'womens-self-defense', 6)
) AS v(name, slug, ord) WHERE categories.slug = 'martial-arts-self-defense';

-- Yoga & Wellness
INSERT INTO public.subcategories (category_id, name, slug, display_order)
SELECT id, v.name, v.slug, v.ord FROM public.categories, (VALUES
    ('Hatha Yoga', 'hatha-yoga', 1), ('Power Yoga', 'power-yoga', 2), ('Pilates', 'pilates', 3),
    ('Meditation & Mindfulness', 'meditation-mindfulness', 4), ('Physiotherapy', 'physiotherapy', 5),
    ('Nutrition Counseling', 'nutrition-counseling', 6)
) AS v(name, slug, ord) WHERE categories.slug = 'yoga-wellness';

-- Dance
INSERT INTO public.subcategories (category_id, name, slug, display_order)
SELECT id, v.name, v.slug, v.ord FROM public.categories, (VALUES
    ('Bharatanatyam', 'bharatanatyam', 1), ('Kathak', 'kathak', 2), ('Odissi', 'odissi', 3),
    ('Bollywood', 'bollywood', 4), ('Hip-Hop', 'hip-hop', 5), ('Contemporary', 'contemporary', 6),
    ('Ballet', 'ballet', 7), ('Salsa/Ballroom', 'salsa-ballroom', 8), ('Folk', 'folk', 9)
) AS v(name, slug, ord) WHERE categories.slug = 'dance';

-- Music
INSERT INTO public.subcategories (category_id, name, slug, display_order)
SELECT id, v.name, v.slug, v.ord FROM public.categories, (VALUES
    ('Vocal Classical', 'vocal-classical', 1), ('Vocal Western', 'vocal-western', 2), ('Guitar', 'guitar', 3),
    ('Piano/Keyboard', 'piano-keyboard', 4), ('Violin', 'violin', 5), ('Drums', 'drums', 6),
    ('Tabla', 'tabla', 7), ('Flute', 'flute', 8), ('Music Production/DJ', 'music-production-dj', 9)
) AS v(name, slug, ord) WHERE categories.slug = 'music';

-- Visual Arts
INSERT INTO public.subcategories (category_id, name, slug, display_order)
SELECT id, v.name, v.slug, v.ord FROM public.categories, (VALUES
    ('Painting & Drawing', 'painting-drawing', 1), ('Sketching', 'sketching', 2), ('Pottery', 'pottery', 3),
    ('Photography', 'photography', 4), ('Craft & DIY', 'craft-diy', 5)
) AS v(name, slug, ord) WHERE categories.slug = 'visual-arts';

-- Performing Arts
INSERT INTO public.subcategories (category_id, name, slug, display_order)
SELECT id, v.name, v.slug, v.ord FROM public.categories, (VALUES
    ('Theatre/Drama', 'theatre-drama', 1)
) AS v(name, slug, ord) WHERE categories.slug = 'performing-arts';

-- Adventure & Outdoor
INSERT INTO public.subcategories (category_id, name, slug, display_order)
SELECT id, v.name, v.slug, v.ord FROM public.categories, (VALUES
    ('Trekking', 'trekking', 1), ('Rock Climbing', 'rock-climbing', 2), ('Cycling', 'cycling', 3),
    ('Skateboarding', 'skateboarding', 4), ('Horse Riding', 'horse-riding', 5)
) AS v(name, slug, ord) WHERE categories.slug = 'adventure-outdoor';

-- Coding & Technology
INSERT INTO public.subcategories (category_id, name, slug, display_order)
SELECT id, v.name, v.slug, v.ord FROM public.categories, (VALUES
    ('Coding for Kids (Scratch/Python basics)', 'coding-for-kids', 1), ('Web Development', 'web-development', 2),
    ('App Development', 'app-development', 3), ('AI/ML Basics', 'ai-ml-basics', 4), ('Robotics', 'robotics', 5),
    ('Game Development', 'game-development', 6), ('AI Tools', 'ai-tools', 7)
) AS v(name, slug, ord) WHERE categories.slug = 'coding-technology';

-- Academic / Tuition — grade-band subcategories
INSERT INTO public.subcategories (category_id, name, slug, display_order)
SELECT id, v.name, v.slug, v.ord FROM public.categories, (VALUES
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
) AS v(name, slug, ord) WHERE categories.slug = 'academic-tuition';

-- 3. Tags

-- Board tags — global (subcategory_id NULL), apply across every Academic grade-band.
INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order) VALUES
    (NULL, 'board', 'CBSE', 'cbse', 1),
    (NULL, 'board', 'ICSE', 'icse', 2),
    (NULL, 'board', 'State Board', 'state-board', 3),
    (NULL, 'board', 'IB', 'ib', 4);

-- Subject tags — scoped to their grade-band subcategory.
INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'subject', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('Phonics', 'phonics', 1), ('Basic Numeracy', 'basic-numeracy', 2), ('Rhymes', 'rhymes', 3), ('Handwriting', 'handwriting', 4)
) AS v(name, slug, ord) WHERE subcategories.slug = 'pre-primary-foundation';

INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'subject', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('English', 'english', 1), ('Math', 'math', 2), ('EVS', 'evs', 3),
    ('Hindi/Regional Language', 'hindi-regional-language', 4), ('GK', 'gk', 5)
) AS v(name, slug, ord) WHERE subcategories.slug = 'primary-class-3-5';

INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'subject', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('English', 'english', 1), ('Math', 'math', 2), ('Science', 'science', 3), ('Social Studies', 'social-studies', 4),
    ('Sanskrit/Third Language', 'sanskrit-third-language', 5), ('Computer Basics', 'computer-basics', 6)
) AS v(name, slug, ord) WHERE subcategories.slug = 'middle-school-class-6-8';

INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'subject', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('Math', 'math', 1), ('Science (Physics/Chemistry/Biology combined)', 'science-pcb', 2),
    ('Social Science', 'social-science', 3), ('English', 'english', 4)
) AS v(name, slug, ord) WHERE subcategories.slug = 'secondary-class-9-10';

INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'subject', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('Physics', 'physics', 1), ('Chemistry', 'chemistry', 2), ('Biology', 'biology', 3), ('Math', 'math', 4),
    ('Accountancy', 'accountancy', 5), ('Economics', 'economics', 6), ('Business Studies', 'business-studies', 7),
    ('Computer Science', 'computer-science', 8), ('English', 'english', 9)
) AS v(name, slug, ord) WHERE subcategories.slug = 'senior-secondary-class-11-12';

-- Stream tags — scoped to Senior Secondary only.
INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'stream', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('Science', 'science', 1), ('Commerce', 'commerce', 2), ('Arts', 'arts', 3)
) AS v(name, slug, ord) WHERE subcategories.slug = 'senior-secondary-class-11-12';

-- Exam tags — scoped to their Competitive Exams subcategory.
INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'exam', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('JEE Main', 'jee-main', 1), ('JEE Advanced', 'jee-advanced', 2), ('BITSAT', 'bitsat', 3), ('State CETs', 'state-cets', 4)
) AS v(name, slug, ord) WHERE subcategories.slug = 'competitive-engineering';

INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'exam', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('NEET-UG', 'neet-ug', 1), ('AIIMS/Other Pre-Med', 'aiims-other-pre-med', 2)
) AS v(name, slug, ord) WHERE subcategories.slug = 'competitive-medical';

INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'exam', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('Olympiad Prep (NTSE, NSO, IMO)', 'olympiad-prep', 1), ('Early JEE/NEET Foundation', 'early-jee-neet-foundation', 2)
) AS v(name, slug, ord) WHERE subcategories.slug = 'competitive-foundation';

INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'exam', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('UPSC', 'upsc', 1), ('Banking (IBPS/SBI)', 'banking-ibps-sbi', 2), ('SSC', 'ssc', 3),
    ('State PSC', 'state-psc', 4), ('Defence (NDA/CDS)', 'defence-nda-cds', 5)
) AS v(name, slug, ord) WHERE subcategories.slug = 'competitive-government-other';

-- Languages subcategory — subject tags for individual language/test-prep offerings.
INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'subject', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('Spoken English', 'spoken-english', 1), ('IELTS/TOEFL/PTE Prep', 'ielts-toefl-pte-prep', 2),
    ('French', 'french', 3), ('German', 'german', 4), ('Spanish', 'spanish', 5), ('Japanese', 'japanese', 6),
    ('Telugu', 'telugu', 7), ('Hindi', 'hindi', 8), ('Sanskrit', 'sanskrit', 9)
) AS v(name, slug, ord) WHERE subcategories.slug = 'academic-languages';

-- STEM & Innovation subcategory — subject tags.
INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'subject', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('Robotics Kits', 'robotics-kits', 1), ('Science Projects', 'science-projects', 2),
    ('Math Olympiad Training', 'math-olympiad-training', 3), ('Electronics/Arduino', 'electronics-arduino', 4)
) AS v(name, slug, ord) WHERE subcategories.slug = 'stem-innovation';

-- Study Skills & Counseling subcategory — subject tags.
INSERT INTO public.tags (subcategory_id, tag_type, name, slug, display_order)
SELECT id, 'subject', v.name, v.slug, v.ord FROM public.subcategories, (VALUES
    ('Exam Strategy & Time Management', 'exam-strategy-time-management', 1),
    ('Career Counseling', 'career-counseling', 2), ('College Admissions (India/Abroad)', 'college-admissions', 3)
) AS v(name, slug, ord) WHERE subcategories.slug = 'study-skills-counseling';

-- ────────────────────────────────────────────────────────────
-- SECTION D: Service geography — Tier 1 Hyderabad localities
-- (with coordinates baked in for Places Autocomplete anchoring)
-- ────────────────────────────────────────────────────────────

INSERT INTO public.service_areas (name, slug, display_order, lat, lng) VALUES
    ('Gachibowli',                 'gachibowli',                 1,  17.4401, 78.3489),
    ('Kondapur',                   'kondapur',                   2,  17.4615, 78.3672),
    ('Kokapet',                    'kokapet',                    3,  17.4147, 78.3339),
    ('Narsingi',                   'narsingi',                   4,  17.3959, 78.3489),
    ('Manikonda',                  'manikonda',                  5,  17.4062, 78.3809),
    ('Financial District',         'financial-district',         6,  17.4131, 78.3454),
    ('Tellapur',                   'tellapur',                   7,  17.4735, 78.3057),
    ('Nallagandla',                'nallagandla',                8,  17.4622, 78.3169),
    ('Miyapur',                    'miyapur',                    9,  17.4969, 78.3629),
    ('Kukatpally',                 'kukatpally',                 10, 17.4849, 78.4108),
    ('Nizampet',                   'nizampet',                   11, 17.5079, 78.3849),
    ('Bachupally',                 'bachupally',                 12, 17.5354, 78.3746),
    ('Kompally',                   'kompally',                   13, 17.5433, 78.4869),
    ('Madhapur',                   'madhapur',                   14, 17.4483, 78.3915),
    ('Hitech City',                'hitech-city',                15, 17.4483, 78.3799),
    ('Jubilee Hills',              'jubilee-hills',               16, 17.4308, 78.4073),
    ('Banjara Hills',              'banjara-hills',               17, 17.4156, 78.4347),
    ('Somajiguda',                 'somajiguda',                 18, 17.4239, 78.4611),
    ('Begumpet',                   'begumpet',                   19, 17.4436, 78.4666),
    ('Ameerpet',                   'ameerpet',                   20, 17.4374, 78.4482),
    ('SR Nagar',                   'sr-nagar',                   21, 17.4423, 78.4416),
    ('Kukatpally Housing Board',   'kukatpally-housing-board',   22, 17.4931, 78.3996),
    ('Chandanagar',                'chandanagar',                23, 17.4938, 78.3389),
    ('Attapur',                    'attapur',                    24, 17.3733, 78.4285),
    ('Rajendra Nagar',             'rajendra-nagar',             25, 17.3389, 78.4006),
    ('LB Nagar',                   'lb-nagar',                   26, 17.3465, 78.5531),
    ('Uppal',                      'uppal',                      27, 17.4058, 78.5591),
    ('Nagole',                     'nagole',                     28, 17.3757, 78.5561),
    ('Alwal',                      'alwal',                      29, 17.5039, 78.5077),
    ('Secunderabad',               'secunderabad',               30, 17.4399, 78.4983),
    ('Dammaiguda',                 'dammaiguda',                 31, 17.4884, 78.5626),
    ('Vanasthalipuram',            'vanasthalipuram',            32, 17.3444, 78.5719),
    ('Dilsukhnagar',               'dilsukhnagar',               33, 17.3687, 78.5247),
    ('Malakpet',                   'malakpet',                   34, 17.3739, 78.5008),
    ('Shamshabad',                 'shamshabad',                 35, 17.2403, 78.4294),
    ('Adibatla',                   'adibatla',                   36, 17.2158, 78.5511),
    ('Nadergul',                   'nadergul',                   37, 17.2836, 78.5225),
    ('Hayathnagar',                'hayathnagar',                38, 17.3267, 78.5992),
    ('Medchal',                    'medchal',                    39, 17.6293, 78.4816),
    ('Suchitra',                   'suchitra',                   40, 17.5285, 78.4592),
    ('Bowenpally',                 'bowenpally',                 41, 17.4667, 78.4783),
    ('Sainikpuri',                 'sainikpuri',                 42, 17.5028, 78.5544),
    ('ECIL',                       'ecil',                       43, 17.4728, 78.5661),
    ('Kapra',                      'kapra',                      44, 17.4772, 78.5535),
    ('Habsiguda',                  'habsiguda',                  45, 17.4103, 78.5453),
    ('Tarnaka',                    'tarnaka',                    46, 17.4278, 78.5347),
    ('Nacharam',                   'nacharam',                   47, 17.4269, 78.5566),
    ('Toli Chowki',                'toli-chowki',                48, 17.3963, 78.4174),
    ('Mehdipatnam',                'mehdipatnam',                49, 17.3948, 78.4392),
    ('Panjagutta',                 'panjagutta',                 50, 17.4275, 78.4506);
