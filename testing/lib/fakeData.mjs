// Realistic Indian fake-data generators. Pure functions of an Rng instance —
// never touch Math.random() directly so a whole run stays reproducible from
// one --seed (requirement #18: realistic data, not random strings).

export const FIRST_NAMES_M = [
  'Arjun', 'Rohan', 'Vikram', 'Aditya', 'Karthik', 'Sameer', 'Rahul', 'Kabir', 'Ishaan', 'Aarav',
  'Vivaan', 'Krishna', 'Dev', 'Nikhil', 'Siddharth', 'Manoj', 'Suresh', 'Rajesh', 'Anand', 'Varun',
  'Ravi', 'Sanjay', 'Vijay', 'Ganesh', 'Harish', 'Pradeep', 'Naveen', 'Ashwin', 'Yuvraj', 'Kunal',
];
export const FIRST_NAMES_F = [
  'Priya', 'Ananya', 'Diya', 'Riya', 'Sneha', 'Kavya', 'Meera', 'Isha', 'Nisha', 'Divya',
  'Pooja', 'Shreya', 'Anjali', 'Neha', 'Radhika', 'Swati', 'Lakshmi', 'Deepika', 'Aisha', 'Tanvi',
  'Aarohi', 'Ishita', 'Kritika', 'Manasa', 'Nandini', 'Ojasvi', 'Pallavi', 'Ritika', 'Sanya', 'Vidya',
];
export const LAST_NAMES = [
  'Sharma', 'Reddy', 'Rao', 'Patil', 'Gupta', 'Verma', 'Kumar', 'Nair', 'Iyer', 'Menon',
  'Das', 'Mehta', 'Joshi', 'Deshmukh', 'Naidu', 'Choudhary', 'Agarwal', 'Bhat', 'Krishnan', 'Pillai',
  'Chowdhury', 'Bose', 'Ghosh', 'Mukherjee', 'Bajaj', 'Kapoor', 'Malhotra', 'Chauhan', 'Yadav', 'Thakur',
];

// The ten states named in the brief. Each maps to one of the six geo_cities
// the app has actually launched (bengaluru/mumbai/delhi/hyderabad/chennai/
// pune) for anything that must satisfy listings.city_key /
// coach_profiles.service_area_keys FKs — free-text profile fields (users.state
// /city/area, branches.geo) use the state's own realistic cities instead.
export const STATE_CITIES = {
  'Andhra Pradesh': { cities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati'], marketCity: 'hyderabad' },
  'Telangana': { cities: ['Hyderabad', 'Warangal', 'Nizamabad'], marketCity: 'hyderabad' },
  'Karnataka': { cities: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi'], marketCity: 'bengaluru' },
  'Tamil Nadu': { cities: ['Chennai', 'Coimbatore', 'Madurai', 'Trichy'], marketCity: 'chennai' },
  'Maharashtra': { cities: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'], marketCity: 'mumbai' },
  'Delhi': { cities: ['New Delhi', 'Dwarka', 'Rohini', 'Saket'], marketCity: 'delhi' },
  'Gujarat': { cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'], marketCity: 'mumbai' },
  'Kerala': { cities: ['Kochi', 'Thiruvananthapuram', 'Kozhikode'], marketCity: 'chennai' },
  'Punjab': { cities: ['Ludhiana', 'Amritsar', 'Jalandhar'], marketCity: 'delhi' },
  'Rajasthan': { cities: ['Jaipur', 'Jodhpur', 'Udaipur'], marketCity: 'delhi' },
};
export const STATE_NAMES = Object.keys(STATE_CITIES);

export const AREAS = [
  'Gachibowli', 'Kondapur', 'Madhapur', 'Jubilee Hills', 'Banjara Hills', 'Kukatpally', 'Miyapur',
  'Hitech City', 'Manikonda', 'Secunderabad', 'Begumpet', 'Ameerpet', 'Nizampet', 'Kompally', 'Uppal',
  'Koramangala', 'Indiranagar', 'Whitefield', 'Andheri', 'Bandra', 'Dwarka', 'Adyar', 'Kothrud',
];

export const LANGUAGES = ['English', 'Hindi', 'Kannada', 'Telugu', 'Tamil', 'Malayalam', 'Marathi', 'Gujarati', 'Punjabi', 'Bengali'];

const QUALIFICATIONS = [
  'Certified Level 2 Coach', 'National Institute of Sports Diploma', 'B.P.Ed, M.P.Ed',
  'International Certification (ISSA)', 'State-level player, certified coach', 'Bachelor of Physical Education',
  'AIFF C-License Coach', 'BCCI Level 1 Certified Coach', 'Yoga Alliance RYT-500', 'FIDE Certified Trainer',
];
const ACHIEVEMENTS_POOL = [
  'State-level champion 2022', 'National medalist', 'Best Coach Award 2023',
  '5+ students placed in district teams', 'Coached 3 national-level players', 'Featured in local sports magazine',
  '10+ years competitive playing experience', 'District-level umpire/referee certified',
];

export function randomName(rng, gender) {
  const firstName = gender === 'F' ? rng.pick(FIRST_NAMES_F) : rng.pick(FIRST_NAMES_M);
  const lastName = rng.pick(LAST_NAMES);
  return { firstName, lastName, gender: gender === 'F' ? 'female' : 'male', fullName: `${firstName} ${lastName}` };
}

export function randomPhone(rng) {
  return '9' + Array.from({ length: 9 }, () => rng.int(0, 9)).join('');
}

const AVATAR_COLORS = ['4f46e5', '0ea5e9', 'f97316', '16a34a', 'db2777', '9333ea', '0d9488', 'ca8a04', 'dc2626', '2563eb'];

// Every profile needs SOME avatar (Requirement: "very lightweight" photos) —
// a tiny inline initials-on-a-colored-square SVG, base64 data URI. Renders
// directly via `<img src=...>` exactly like a real Supabase Storage public
// URL would (see CoachProfileWizard's avatarPath field), with no upload
// round trip, no real file storage, and no network dependency at all —
// the whole point of "lightweight" here.
export function avatarFor(rng, firstName, lastName) {
  const initials = `${firstName?.[0] ?? '?'}${lastName?.[0] ?? ''}`.toUpperCase();
  const bg = rng.pick(AVATAR_COLORS);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="24" fill="#${bg}"/><text x="64" y="80" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// Role goes IN the address on purpose (not a subdomain) — the email alone
// then tells you what the identity is for, which matters most for
// `testing/credentials.mjs --live`: reconstructed rows have no other source
// of truth for role/name than the email itself. Pass a bare role
// ('coach', 'guardian', 'owner', ...) for org-scoped identities, or
// 'platform.<roleKey>' for platform staff — see orchestrate.mjs call sites.
let emailCounter = 0;
export function emailFor(firstName, lastName, role, runTag) {
  emailCounter += 1;
  const tag = runTag ? `${runTag}.` : '';
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${role}.${tag}${emailCounter}@abhyas.local`;
}

export function randomAddress(rng, state) {
  const info = STATE_CITIES[state] ?? STATE_CITIES.Telangana;
  const city = rng.pick(info.cities);
  const area = rng.pick(AREAS);
  return {
    state,
    city,
    area,
    marketCity: info.marketCity,
    addressLine: `${rng.int(1, 999)}, ${area}`,
    pincode: String(rng.int(500000, 699999)),
  };
}

export function coachBio(rng, firstName, experienceYears, specialty) {
  const templates = [
    `${firstName} is a dedicated ${specialty} coach with ${experienceYears} years of experience, passionate about helping students of all levels improve their skills and confidence.`,
    `With ${experienceYears}+ years coaching ${specialty}, ${firstName} focuses on structured, discipline-first training that builds both technique and character.`,
    `${firstName} brings ${experienceYears} years of competitive and coaching experience in ${specialty}, mentoring students from first-timers to district-level competitors.`,
  ];
  return rng.pick(templates);
}

export function randomQualification(rng) { return rng.pick(QUALIFICATIONS); }
export function randomAchievements(rng) { return rng.sample(ACHIEVEMENTS_POOL, rng.int(0, 3)); }

export function academyName(rng, specialty) {
  const prefixes = ['Ace', 'Elite', 'Champions', 'Rising Stars', 'Victory', 'Apex', 'Prime', 'Legacy', 'Dynamic', 'Supreme'];
  const suffixes = ['Academy', 'Sports Academy', 'Training Center', 'Institute', 'Club', 'School'];
  return `${rng.pick(prefixes)} ${specialty} ${rng.pick(suffixes)}`;
}

export function reviewComment(rng) {
  return rng.pick([
    'Great coach, very patient with beginners!',
    'Really helped improve my technique over the last few months.',
    'Punctual and well organized sessions every time.',
    'Would recommend to anyone starting out in this sport.',
    'My child looks forward to every class — excellent with kids.',
    'Facilities are clean and well maintained.',
    'Communication about schedule changes could be better, but coaching quality is solid.',
    'Best academy in the area, hands down.',
  ]);
}

export function leadMessage(rng) {
  return rng.pick([
    'Interested in a trial class for my child, please share available slots.',
    'What are the fee details for the beginner batch?',
    'Do you have weekend batches available?',
    'Looking for personal training options, please call back.',
    'Can we schedule a facility visit this week?',
  ]);
}
