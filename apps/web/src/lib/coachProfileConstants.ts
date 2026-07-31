// Shared option lists for anything that edits a coach's professional
// profile — CoachProfileWizard (onboarding + admin edit) and the My Profile
// page's Professional Information card both need the same value/label sets
// so a coach sees identical wording no matter which surface they're on.

export const LANGUAGE_SUGGESTIONS = ['English', 'Hindi', 'Kannada', 'Telugu', 'Tamil', 'Malayalam', 'Marathi', 'Gujarati'];

// Qualification is free text, but the *kind* of credential expected varies a
// lot by category — ported verbatim from V1 (CoachOnboardingWizard.tsx),
// keyed by categories.slug (migration 0019).
export const QUALIFICATION_PLACEHOLDER_BY_CATEGORY: Record<string, string> = {
  sports: 'B.P.Ed, NIS Certified',
  fitness: 'Certified Personal Trainer (ACE/ACSM)',
  'martial-arts-self-defense': 'Black Belt (3rd Dan), Certified Instructor',
  'yoga-wellness': 'RYT 200, Yoga Alliance Certified',
  dance: 'Diploma in Dance, Certified Choreographer',
  music: 'B.A. Music, Trinity/ABRSM Grade 8',
  'visual-arts': 'B.F.A., Diploma in Fine Arts',
  'performing-arts': 'Diploma in Theatre Arts',
  'adventure-outdoor': 'Wilderness First Aid, NOLS Certified',
  'coding-technology': 'B.Tech/B.E., Certified Software Trainer',
  'academic-tuition': 'M.Sc Mathematics, B.Ed',
};
export const DEFAULT_QUALIFICATION_PLACEHOLDER = 'B.P.Ed, NIS Certified';

export const SERVICE_TYPE_OPTIONS = [
  { value: 'offline', label: 'Offline' },
  { value: 'online', label: 'Online' },
];
export const CLASS_TYPE_OPTIONS = [
  { value: 'group', label: 'Group classes' },
  { value: 'one_to_one', label: 'One-to-one' },
];
export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];
export const DOC_TYPE_OPTIONS = [
  { value: 'id_proof', label: 'ID proof (Aadhaar / PAN)', hint: 'Upload a clear photo or scan' },
  { value: 'address_proof', label: 'Address proof', hint: 'Utility bill, rental agreement, etc.' },
  { value: 'certification', label: 'Qualification certificate', hint: 'Degree, diploma, or NIS certification' },
  { value: 'background_check', label: 'Background / police verification', hint: 'Optional, boosts your trust badge' },
  { value: 'other', label: 'Other', hint: 'Experience letters, first-aid, etc.' },
];

// Shared Tailwind classes for the small "View / Upload / Replace" action
// chips on a document row — used by both the profile page's Documents card
// and the coach onboarding wizard's Documents step, so height and color
// never drift apart between the two surfaces. Plain Tailwind utilities
// (not a custom CSS class) so there's no risk of a stale global-CSS cache
// leaving the chip unstyled.
export const DOC_CHIP_BASE =
  'inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition-colors';
export const DOC_CHIP_TEXT = 'px-3';
export const DOC_CHIP_ICON_ONLY = 'w-7 px-0';
export const DOC_CHIP_INDIGO = 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20';
export const DOC_CHIP_EMERALD = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20';
