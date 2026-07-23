'use client';

// Coach professional-profile + onboarding wizard (Doc 04 §8 unification,
// layout matched to V1's CoachOnboardingWizard per product feedback — field
// grouping, DOB≥12y rule, real avatar upload, and full pricing strategy
// set). The ONE onboarding workflow shared by all four coach paths:
// self-serve independent coach, invited coach completing their own
// profile, an org admin filling it out for an existing member, and a
// platform-invited coach. "mode" picks which endpoint (and RLS policy) the
// submit hits.
//
// Self mode gets a leading "Personal information" step that admin mode
// doesn't: it writes to the caller's own identity profile via /api/v1/me,
// and there's no endpoint (by design — identity stays self-owned, Doc 05)
// for an admin to edit a DIFFERENT user's name/DOB/address. Ongoing edits
// to those fields live at /me/profile, same as before this step existed.
// Email is read-only here (established at signup, no PATCH path for it);
// phone is a plain contact field (no phone-OTP auth exists in V2 yet).
//
// Professional profile + What-you-teach are ONE step here (V1 has no
// separate "What you teach" step — everything from Category through
// Service Areas lives on its single "Professional Profile" screen; this
// now matches that exactly instead of the earlier 2-step split).
//
// Category/Specialties/Age groups/Skill levels are the real categories ->
// subcategories -> tags taxonomy (migration 0019) via CategoryPicker — the
// same taxonomy Discovery search (/explore) filters coaches by.
// Service Areas uses the same /api/v1/public/taxonomy response's
// cities/areas (Tier 1 only — V1's Tier 2 "communities"/apartment-complex
// search has no V2 equivalent: no table, no Places-backed search endpoint.
// That's a real new feature, not a rewire, and stays out of this pass).
//
// Pricing reuses V1's PaymentPricingStep.tsx UNCHANGED (it's a pure
// controlled component, no V1 API calls inside it) against a NEW
// coach_pricing_policies/coach_pricing_rules table pair (migration 0018) —
// 0016_coach_profiles.sql explicitly deferred this ("Finance's fee_policies
// are batch-scoped, a parallel per-coach table would be new, undiscussed
// scope"); it's now discussed and built to V1's exact field set.
//
// Avatar upload is real: POST /api/v1/me/avatar/upload-url issues a
// session-scoped signed Supabase Storage upload URL (packages/platform/src
// /storage), and the browser PUTs the file straight to it. This does NOT
// copy V1's pattern of a raw supabase-js client reading/writing tables from
// the browser (Doc 08 §2 rule 2 forbids that) — only the storage byte
// transfer goes direct, over a URL our own session-checked API minted.
//
// Documents still uses the docType+storagePath text-path convention the
// rest of V2's staff-hr module already has (no general file-upload
// primitive exists there yet) — building real upload for every document
// type is separate scope from the one V1 called out (the avatar).

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, AlertCircle, AlertTriangle, Loader2, User, Trash2, Upload } from 'lucide-react';
import { Chip } from '@/components/Chip';
import { RestrictedAutocompleteInput } from '@/components/RestrictedAutocompleteInput';
import { LocalityAutocompleteInput } from '@/components/LocalityAutocompleteInput';
import { CategoryPicker, type CategorySelection } from '@/components/CategoryPicker';
import { useCategoryTaxonomy } from '@/lib/useCategoryTaxonomy';
import { INDIAN_STATES, CITIES_BY_STATE } from '@/lib/indianStatesCities';
import { createBrowserClient } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import {
  PaymentPricingStep,
  createDefaultPaymentPricingSelection,
  isPaymentPricingValid,
  type PaymentPricingSelection,
  type PricingPolicy as UiPricingPolicy,
  type PricingRule as UiPricingRule,
} from '@/components/PaymentPricingStep';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface GeoCityApi {
  key: string;
  label: string;
  state: string | null;
}

interface GeoAreaApi {
  key: string;
  cityKey: string;
  label: string;
}

interface TaxonomyResponse {
  cities: GeoCityApi[];
  areas: GeoAreaApi[];
}

interface CoachProfileData {
  bio: string | null;
  experienceYears: number | null;
  qualification: string | null;
  languagesKnown: string[];
  ageGroups: string[];
  skillLevels: string[];
  serviceTypes: string[];
  classTypes: string[];
  serviceAreaKeys: string[];
  allowStudentOverrides: boolean;
  categoryId: string | null;
  subcategoryIds: string[];
  primarySubcategoryId: string | null;
  tagIds: string[];
}

interface PersonalProfile {
  displayName: string;
  dob: string | null;
  avatarPath: string | null;
  gender: string | null;
  phone: string | null;
  addressLine: string | null;
  state: string | null;
  city: string | null;
  area: string | null;
  email: string | null;
}

interface StaffDocument {
  id: string;
  docType: string;
  storagePath: string;
  reviewStatus: string;
}

// Shape the backend's /coach-profile/pricing routes speak — camelCase rule
// fields, distinct from PaymentPricingStep's own snake_case-ish PricingRule
// (kept that way there to match V1's file verbatim).
interface ApiPricingRule {
  amount: number;
  currency?: string;
  billingCycle?: string;
  autoRenew?: boolean;
  lateFeeAmount?: number;
  lateFeeGraceDays?: number;
  cancellationWindowHours?: number;
  minBookingCount?: number;
  classCount?: number;
  trialType?: string;
  lateArrivalFeeAmount?: number;
  lateArrivalThresholdMinutes?: number;
  absenceFeeAmount?: number;
}
interface ApiPricingPolicy {
  policyType: string;
  enabled: boolean;
  isDefault: boolean;
  rules: ApiPricingRule[];
}

function toApiRule(r: UiPricingRule): ApiPricingRule {
  return {
    amount: r.amount,
    currency: r.currency,
    billingCycle: r.billing_cycle,
    autoRenew: r.auto_renew,
    lateFeeAmount: r.late_fee_amount,
    lateFeeGraceDays: r.late_fee_grace_days,
    cancellationWindowHours: r.cancellation_window_hours,
    minBookingCount: r.min_booking_count,
    classCount: r.class_count,
    trialType: r.trial_type,
    lateArrivalFeeAmount: r.late_arrival_fee_amount,
    lateArrivalThresholdMinutes: r.late_arrival_threshold_minutes,
    absenceFeeAmount: r.absence_fee_amount,
  };
}

function fromApiRule(r: ApiPricingRule): UiPricingRule {
  return {
    amount: r.amount,
    currency: r.currency,
    billing_cycle: r.billingCycle as UiPricingRule['billing_cycle'],
    auto_renew: r.autoRenew,
    late_fee_amount: r.lateFeeAmount,
    late_fee_grace_days: r.lateFeeGraceDays,
    cancellation_window_hours: r.cancellationWindowHours,
    min_booking_count: r.minBookingCount,
    class_count: r.classCount,
    trial_type: r.trialType as UiPricingRule['trial_type'],
    late_arrival_fee_amount: r.lateArrivalFeeAmount,
    late_arrival_threshold_minutes: r.lateArrivalThresholdMinutes,
    absence_fee_amount: r.absenceFeeAmount,
  };
}

function applyExistingPricing(base: PaymentPricingSelection, existing: ApiPricingPolicy[]): PaymentPricingSelection {
  if (existing.length === 0) return base;
  return {
    ...base,
    policies: base.policies.map((p) => {
      const match = existing.find((e) => e.policyType === p.policyType);
      if (!match) return { ...p, enabled: false };
      return { policyType: p.policyType, enabled: true, isDefault: match.isDefault, rules: match.rules.map(fromApiRule) };
    }),
  };
}

const LANGUAGE_SUGGESTIONS = ['English', 'Hindi', 'Kannada', 'Telugu', 'Tamil', 'Malayalam', 'Marathi', 'Gujarati'];
// Qualification is free text, but the *kind* of credential expected varies
// a lot by category — ported verbatim from V1 (CoachOnboardingWizard.tsx),
// keyed by categories.slug (migration 0019).
const QUALIFICATION_PLACEHOLDER_BY_CATEGORY: Record<string, string> = {
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
const DEFAULT_QUALIFICATION_PLACEHOLDER = 'B.P.Ed, NIS Certified';
const SERVICE_TYPE_OPTIONS = [
  { value: 'offline', label: 'Offline' },
  { value: 'online', label: 'Online' },
];
const CLASS_TYPE_OPTIONS = [
  { value: 'group', label: 'Group classes' },
  { value: 'one_to_one', label: 'One-to-one' },
];
const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];
const DOC_TYPE_OPTIONS = [
  { value: 'id_proof', label: 'ID proof (Aadhaar / PAN)', hint: 'Upload a clear photo or scan' },
  { value: 'address_proof', label: 'Address proof', hint: 'Utility bill, rental agreement, etc.' },
  { value: 'certification', label: 'Qualification certificate', hint: 'Degree, diploma, or NIS certification' },
  { value: 'background_check', label: 'Background / police verification', hint: 'Optional, boosts your trust badge' },
  { value: 'other', label: 'Other', hint: 'Experience letters, first-aid, etc.' },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// Selected-state styling for every toggleable chip in this wizard comes
// from the shared Chip component (solid indigo) so Step 1's language chips
// and Step 2's service-type/class-type/area chips look identical — this
// wizard previously had its own ChipToggle with a lighter, translucent
// selected style that didn't match, which read as a bug once both were on
// screen together.
function ChipToggle({ label, selected, onClick, theme }: { label: string; selected: boolean; onClick: () => void; theme: 'light' | 'dark' }) {
  return (
    <Chip theme={theme} clickable selected={selected} onClick={onClick} size="md">
      {label}
    </Chip>
  );
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>;
}

function NoticeBanner({ notice }: { notice: string | null }) {
  if (!notice) return null;
  return <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">{notice}</div>;
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-sm font-medium text-slate-400">
      {children}
      {required && <span className="ml-1 text-red-400">*</span>}
    </label>
  );
}

function fieldClass(extra = '') {
  return `w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500 ${extra}`;
}

const MIN_DOB_DATE = new Date(Date.now() - 12 * 365.25 * 24 * 60 * 60 * 1000);
const MIN_DOB_STRING = MIN_DOB_DATE.toISOString().split('T')[0];

export interface CoachProfileWizardProps {
  mode: 'self' | 'admin';
  /** Required when mode === 'admin' — the org whose /staff route owns this profile. */
  organizationId?: string;
  /** Required when mode === 'admin' — the existing staff_profiles row to attach the coach profile to. */
  staffProfileId?: string;
  /** Admin mode: whose profile this is, for the header. */
  memberName?: string;
  onCancel: () => void;
  onDone: () => void;
}

export default function CoachProfileWizard({ mode, organizationId, staffProfileId, memberName, onCancel, onDone }: CoachProfileWizardProps) {
  const { mode: themeMode } = useTheme();
  const { categories } = useCategoryTaxonomy();
  const isSelf = mode === 'self';
  const STEPS = isSelf
    ? ['Personal information', 'Professional profile', 'Documents', 'Pricing', 'Review & submit']
    : ['Professional profile', 'Documents', 'Pricing', 'Review & submit'];
  const PERSONAL_STEP = isSelf ? 1 : 0; // 0 = not present
  const PROFESSIONAL_STEP = isSelf ? 2 : 1;
  const DOCS_STEP = isSelf ? 3 : 2;
  const PRICING_STEP = isSelf ? 4 : 3;
  const REVIEW_STEP = isSelf ? 5 : 4;

  const [step, setStep] = useState(PERSONAL_STEP || PROFESSIONAL_STEP);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cities, setCities] = useState<GeoCityApi[]>([]);
  const [areas, setAreas] = useState<GeoAreaApi[]>([]);
  const [orgId, setOrgId] = useState<string | null>(organizationId ?? null);

  // ?testmode in the URL — same trick V1's CoachOnboardingWizard used
  // (scratch/original_register.tsx's isTestMode state, later carried into
  // CoachOnboardingWizard.tsx's testMode prop) — reveals a per-step
  // "⚡ Auto-fill Test Data" button. Read directly off window.location
  // instead of useSearchParams() so this component doesn't force every
  // caller to wrap it in a <Suspense> boundary just for this.
  const [isTestMode, setIsTestMode] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('testmode')) {
      setIsTestMode(true);
    }
  }, []);

  // --- Personal information (self mode only) ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarPath, setAvatarPath] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [personalAddressLine, setPersonalAddressLine] = useState('');
  const [personalState, setPersonalState] = useState('');
  const [personalCity, setPersonalCity] = useState('');
  const [personalArea, setPersonalArea] = useState('');

  // --- Professional profile (merged: About + What you teach + Areas) ---
  // Category/Specialties/Age groups/Skill levels are the real categories ->
  // subcategories -> tags taxonomy (migration 0019) via CategoryPicker — the
  // same taxonomy Discovery search (/explore) filters coaches by.
  const [categorySelection, setCategorySelection] = useState<CategorySelection>({
    categoryId: null,
    subcategoryIds: [],
    primarySubcategoryId: null,
    tagIds: [],
    ageGroups: [],
    skillLevels: [],
  });
  const [experienceYears, setExperienceYears] = useState('');
  const [qualification, setQualification] = useState('');
  const [serviceTypes, setServiceTypes] = useState<string[]>(['offline']);
  const [classTypes, setClassTypes] = useState<string[]>(['group']);
  const [areaCity, setAreaCity] = useState('');
  const [serviceAreaKeys, setServiceAreaKeys] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [languagesKnown, setLanguagesKnown] = useState<string[]>(['English']);
  const [langInput, setLangInput] = useState('');

  // --- Documents ---
  const [existingDocs, setExistingDocs] = useState<StaffDocument[]>([]);
  const [pendingDocs, setPendingDocs] = useState<Record<string, { path: string; fileName: string }>>({});
  const [docUploading, setDocUploading] = useState<Record<string, boolean>>({});

  // --- Pricing (V1's PaymentPricingStep, unmodified) ---
  const [paymentPricing, setPaymentPricing] = useState<PaymentPricingSelection>(createDefaultPaymentPricingSelection());
  const [pricingNotice, setPricingNotice] = useState<string | null>(null);

  const getUrl = mode === 'admin' ? `/api/v1/orgs/${organizationId}/staff/${staffProfileId}/coach-profile` : '/api/v1/me/coach-profile';
  const submitUrl = mode === 'admin' ? `/api/v1/orgs/${organizationId}/staff/${staffProfileId}/coach-profile` : '/api/v1/me/onboard-coach';
  const docsUrl = mode === 'admin' ? `/api/v1/orgs/${organizationId}/staff/${staffProfileId}/documents` : '/api/v1/me/staff/documents';
  const docsUploadUrlEndpoint = mode === 'admin' ? `/api/v1/orgs/${organizationId}/staff/${staffProfileId}/documents/upload-url` : '/api/v1/me/staff/documents/upload-url';
  const pricingUrl = mode === 'admin' ? `/api/v1/orgs/${organizationId}/staff/${staffProfileId}/coach-profile/pricing` : '/api/v1/me/coach-profile/pricing';

  useEffect(() => {
    api<TaxonomyResponse>('/api/v1/public/taxonomy').then((t) => {
      setCities(t.cities);
      setAreas(t.areas);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api<CoachProfileData | null>(getUrl)
      .then((existing) => {
        if (!existing) return;
        setBio(existing.bio ?? '');
        setExperienceYears(existing.experienceYears !== null ? String(existing.experienceYears) : '');
        setQualification(existing.qualification ?? '');
        if (existing.languagesKnown.length) setLanguagesKnown(existing.languagesKnown);
        setCategorySelection({
          categoryId: existing.categoryId,
          subcategoryIds: existing.subcategoryIds ?? [],
          primarySubcategoryId: existing.primarySubcategoryId,
          tagIds: existing.tagIds ?? [],
          ageGroups: existing.ageGroups,
          skillLevels: existing.skillLevels,
        });
        if (existing.serviceTypes.length) setServiceTypes(existing.serviceTypes);
        if (existing.classTypes.length) setClassTypes(existing.classTypes);
        setServiceAreaKeys(existing.serviceAreaKeys ?? []);
        setPaymentPricing((prev) => ({ ...prev, allowStudentOverrides: existing.allowStudentOverrides ?? false }));
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
    // Only re-fetch if we're pointed at a different profile
  }, [getUrl]);

  // Same for the service-areas City, from any already-selected serviceAreaKeys.
  useEffect(() => {
    if (areaCity || serviceAreaKeys.length === 0 || areas.length === 0) return;
    const first = areas.find((a) => serviceAreaKeys.includes(a.key));
    if (first) setAreaCity(first.cityKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, serviceAreaKeys]);

  // Self mode only — prefill the identity fields the Personal information step edits.
  useEffect(() => {
    if (!isSelf) return;
    api<PersonalProfile>('/api/v1/me')
      .then((p) => {
        const [first, ...rest] = (p.displayName ?? '').split(' ');
        setFirstName(first ?? '');
        setLastName(rest.join(' '));
        setEmail(p.email ?? null);
        setDob(p.dob ?? '');
        setGender(p.gender ?? '');
        setPhone(p.phone ?? '');
        setAvatarPath(p.avatarPath ?? '');
        setPersonalAddressLine(p.addressLine ?? '');
        setPersonalState(p.state ?? '');
        setPersonalCity(p.city ?? '');
        setPersonalArea(p.area ?? '');
      })
      .catch(() => {});
  }, [isSelf]);

  // Self mode resolves its own org (needed for Pricing permission checks admin-side); admin mode already has it via prop.
  useEffect(() => {
    if (!isSelf) return;
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace')
      .then((w) => setOrgId(w.activeOrgId))
      .catch(() => {});
  }, [isSelf]);

  useEffect(() => {
    api<StaffDocument[]>(docsUrl).then(setExistingDocs).catch(() => {});
  }, [docsUrl]);

  useEffect(() => {
    api<ApiPricingPolicy[]>(pricingUrl)
      .then((existing) => setPaymentPricing((prev) => applyExistingPricing(prev, existing)))
      .catch(() => {});
  }, [pricingUrl]);

  const handlePersonalStateChange = (next: string) => {
    setPersonalState(next);
    const stateCities = CITIES_BY_STATE[next] || [];
    if (personalCity && !stateCities.some((c) => c.toLowerCase() === personalCity.toLowerCase())) setPersonalCity('');
  };

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const { path, signedUrl, token } = await api<{ path: string; signedUrl: string; token: string }>('/api/v1/me/avatar/upload-url', {
        method: 'POST',
        body: JSON.stringify({ ext, contentType: file.type }),
      });
      void signedUrl; // uploadToSignedUrl resolves the destination from (bucket, path, token) itself
      const supabase = createBrowserClient();
      const { error: uploadErr } = await supabase.storage.from('avatars').uploadToSignedUrl(path, token, file);
      if (uploadErr) throw uploadErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatarPath(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  async function uploadDocument(docType: string, file: File) {
    setDocUploading((prev) => ({ ...prev, [docType]: true }));
    setError(null);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const { path, token } = await api<{ path: string; signedUrl: string; token: string }>(docsUploadUrlEndpoint, {
        method: 'POST',
        body: JSON.stringify({ ext, contentType: file.type, docType }),
      });
      const supabase = createBrowserClient();
      const { error: uploadErr } = await supabase.storage.from('coach-documents').uploadToSignedUrl(path, token, file);
      if (uploadErr) throw uploadErr;
      setPendingDocs((prev) => ({ ...prev, [docType]: { path, fileName: file.name } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document upload failed.');
    } finally {
      setDocUploading((prev) => ({ ...prev, [docType]: false }));
    }
  }

  async function handleDocumentFile(docType: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await uploadDocument(docType, file);
  }

  const availableCities = cities;
  const areasForCity = areaCity ? areas.filter((a) => a.cityKey === areaCity) : [];
  const selectedCategorySlug = categories.find((c) => c.id === categorySelection.categoryId)?.slug ?? null;
  const qualificationPlaceholder = `e.g. ${
    selectedCategorySlug ? (QUALIFICATION_PLACEHOLDER_BY_CATEGORY[selectedCategorySlug] ?? DEFAULT_QUALIFICATION_PLACEHOLDER) : DEFAULT_QUALIFICATION_PLACEHOLDER
  }`;

  const isDobTooYoung = dob !== '' && new Date(dob) > MIN_DOB_DATE;
  const isPersonalValid = !isSelf || (firstName.trim() !== '' && lastName.trim() !== '' && !isDobTooYoung);
  const isProfessionalValid =
    bio.trim() !== '' &&
    qualification.trim() !== '' &&
    experienceYears.trim() !== '' &&
    Number(experienceYears) >= 0 &&
    categorySelection.primarySubcategoryId !== null &&
    serviceTypes.length > 0 &&
    classTypes.length > 0;
  const isDocsValid = true; // skippable
  const isPricingValid = isPaymentPricingValid(paymentPricing);

  function isStepValid(s: number): boolean {
    if (s === PERSONAL_STEP) return isPersonalValid;
    if (s === PROFESSIONAL_STEP) return isProfessionalValid;
    if (s === DOCS_STEP) return isDocsValid;
    if (s === PRICING_STEP) return isPricingValid;
    return true;
  }

  function addLanguage(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = langInput.trim();
    if (val && !languagesKnown.includes(val)) setLanguagesKnown((prev) => [...prev, val]);
    setLangInput('');
  }

  // ⚡ Auto-fill Test Data — only ever fills the CURRENTLY visible step, same
  // as V1's fillRandomData (CoachOnboardingWizard.tsx): each step's fields
  // are wired to that step's real setters, so nothing here bypasses actual
  // validation or backend calls (avatar is a plain URL string, but
  // documents genuinely upload through uploadDocument — signed URL +
  // Supabase Storage — so a submitted testmode profile has real, working
  // document paths rather than fake references that would 404 later).
  function fillTestData() {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const randFirst = ['Amit', 'Rajesh', 'Vikram', 'Pooja', 'Neha', 'Sanjay', 'Preeti', 'Sunil'][Math.floor(Math.random() * 8)];
    const randLast = ['Sharma', 'Verma', 'Kumar', 'Patel', 'Joshi', 'Singh', 'Gupta', 'Reddy'][Math.floor(Math.random() * 8)];

    if (step === PERSONAL_STEP) {
      const randPhone = Math.floor(6000000000 + Math.random() * 3999999999).toString();
      setFirstName(randFirst);
      setLastName(randLast);
      setPhone(randPhone);
      setGender(GENDER_OPTIONS[Math.floor(Math.random() * GENDER_OPTIONS.length)].value);
      setDob('1990-06-15');
      setAvatarPath(`https://api.dicebear.com/7.x/adventurer/svg?seed=${randFirst}${randomId}`);
      setLanguagesKnown(['English', 'Hindi']);

      const randState = INDIAN_STATES[Math.floor(Math.random() * INDIAN_STATES.length)];
      const stateCities = CITIES_BY_STATE[randState] ?? [];
      const randCity = stateCities[Math.floor(Math.random() * stateCities.length)] ?? '';
      setPersonalState(randState);
      setPersonalCity(randCity);
      setPersonalArea('Indiranagar');
      setPersonalAddressLine('Flat 402, 3rd Block, Lotus Apts');
    }

    if (step === PROFESSIONAL_STEP) {
      if (categories.length > 0) {
        const cat = categories[Math.floor(Math.random() * categories.length)];
        const sub = cat.subcategories.length > 0 ? cat.subcategories[Math.floor(Math.random() * cat.subcategories.length)] : null;
        setCategorySelection({
          categoryId: cat.id,
          subcategoryIds: sub ? [sub.id] : [],
          primarySubcategoryId: sub?.id ?? null,
          tagIds: [],
          ageGroups: ['Kids', 'Adults'],
          skillLevels: ['Beginner', 'Intermediate'],
        });
      }
      setExperienceYears(Math.floor(2 + Math.random() * 12).toString());
      setQualification('B.P.Ed, Certified Instructor');
      setBio('Passionate coaching specialist focused on standard fitness, skill refinement, and consistent training modules.');

      if (cities.length > 0) {
        const city = cities[Math.floor(Math.random() * cities.length)];
        const cityAreas = areas.filter((a) => a.cityKey === city.key);
        setAreaCity(city.key);
        setServiceAreaKeys(cityAreas.slice(0, 2).map((a) => a.key));
      }
    }

    if (step === DOCS_STEP) {
      for (const doc of DOC_TYPE_OPTIONS) {
        const file = new File([`Test document content for ${doc.label}`], `${doc.value}_test.pdf`, { type: 'application/pdf' });
        void uploadDocument(doc.value, file);
      }
    }

    if (step === PRICING_STEP) {
      // Already valid out of the box (createDefaultPaymentPricingSelection
      // pre-enables monthly_subscription/per_class/trial_session with valid
      // rule defaults) — this just enables one more plan for a fuller demo.
      setPaymentPricing((prev) => ({
        ...prev,
        policies: prev.policies.map((p) => (p.policyType === 'package' ? { ...p, enabled: true } : p)),
      }));
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    setPricingNotice(null);
    try {
      if (isSelf) {
        await api('/api/v1/me', {
          method: 'PATCH',
          body: JSON.stringify({
            displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
            dob: dob || null,
            gender: gender || null,
            phone: phone.trim() || null,
            avatarPath: avatarPath.trim() || null,
            addressLine: personalAddressLine.trim() || null,
            state: personalState.trim() || null,
            city: personalCity.trim() || null,
            area: personalArea.trim() || null,
          }),
        });
      }

      await api(submitUrl, {
        method: mode === 'admin' ? 'PUT' : 'POST',
        body: JSON.stringify({
          bio: bio.trim(),
          experienceYears: Number(experienceYears),
          qualification: qualification.trim(),
          languagesKnown,
          ageGroups: categorySelection.ageGroups,
          skillLevels: categorySelection.skillLevels,
          serviceTypes,
          classTypes,
          serviceAreaKeys,
          allowStudentOverrides: paymentPricing.allowStudentOverrides,
          categoryId: categorySelection.categoryId,
          subcategoryIds: categorySelection.subcategoryIds,
          primarySubcategoryId: categorySelection.primarySubcategoryId,
          tagIds: categorySelection.tagIds,
        }),
      });

      for (const [docType, doc] of Object.entries(pendingDocs)) {
        if (!doc.path.trim()) continue;
        await api(docsUrl, { method: 'POST', body: JSON.stringify({ docType, storagePath: doc.path.trim() }) }).catch(() => {
          // Non-fatal — the profile already saved; surface via existingDocs staying short rather than aborting.
        });
      }

      try {
        await api(pricingUrl, {
          method: 'PUT',
          body: JSON.stringify({
            policies: paymentPricing.policies
              .filter((p) => p.enabled)
              .map((p): ApiPricingPolicy => ({ policyType: p.policyType, enabled: true, isDefault: p.isDefault, rules: p.rules.map(toApiRule) })),
          }),
        });
      } catch (err) {
        setPricingNotice(err instanceof Error ? err.message : "Pricing couldn't be saved — you can set it later from your coach profile.");
      }

      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingExisting) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  // Step numbers are mode-relative (see PERSONAL_STEP..REVIEW_STEP above) and
  // always match their 1-based position in STEPS for the active mode.
  const stepIndex = step - 1;

  return (
    <div className={`w-full space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 ${step === PRICING_STEP ? 'max-w-4xl' : 'max-w-2xl'}`}>
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {mode === 'admin' ? `Coach profile — ${memberName ?? 'member'}` : 'Set up your coach profile'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex] ?? STEPS[0]}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[11px] font-semibold text-red-400">* Required fields</span>
            {isTestMode && step !== REVIEW_STEP && (
              <button
                type="button"
                onClick={fillTestData}
                className="flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-1.5 text-[10px] font-bold text-white transition-all hover:bg-indigo-600"
              >
                ⚡ Auto-fill Test Data
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-indigo-500' : 'bg-white/10'}`} />
          ))}
        </div>
      </div>

      <ErrorBanner error={error} />
      <NoticeBanner notice={pricingNotice} />

      {step === PERSONAL_STEP && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Let&apos;s start with your basic info</h3>

          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
              {avatarUploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              ) : avatarPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPath} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
              ) : (
                <User className="h-7 w-7 text-slate-500" />
              )}
            </div>
            <div className="space-y-1">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10">
                <Camera className="h-3.5 w-3.5" />
                {avatarUploading ? 'Uploading…' : 'Upload photo'}
                <input type="file" accept="image/*" onChange={handleAvatarFile} disabled={avatarUploading} className="hidden" />
              </label>
              <p className="text-[11px] text-slate-600">JPG, PNG. Shown on your public listing.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label required>First name</Label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Rahul" className={fieldClass()} />
            </div>
            <div>
              <Label required>Last name</Label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Verma" className={fieldClass()} />
            </div>
            <div>
              <Label>Gender</Label>
              <select value={gender} onChange={(e) => setGender(e.target.value)} className={fieldClass()}>
                <option value="">Prefer not to say</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Date of birth</Label>
              <input type="date" value={dob} max={MIN_DOB_STRING} onChange={(e) => setDob(e.target.value)} className={fieldClass()} />
              {isDobTooYoung && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-red-400">
                  <AlertCircle className="h-3 w-3" /> Must be at least 12 years old
                </p>
              )}
            </div>
            <div>
              <Label>Email address</Label>
              <input value={email ?? ''} disabled placeholder="—" className={fieldClass('cursor-not-allowed text-slate-500')} />
              <p className="mt-1 text-[11px] text-slate-600">Set at signup — can&apos;t be changed here.</p>
            </div>
            <div>
              <Label>Phone number</Label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ''))}
                placeholder="9876543210"
                className={fieldClass()}
              />
            </div>
          </div>

          <div>
            <Label>Languages known</Label>
            <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 p-2">
              {languagesKnown.map((lang) => (
                <Chip key={lang} theme={themeMode} selected removable onRemove={() => setLanguagesKnown((prev) => prev.filter((l) => l !== lang))}>
                  {lang}
                </Chip>
              ))}
              <input
                value={langInput}
                onChange={(e) => setLangInput(e.target.value)}
                onKeyDown={addLanguage}
                placeholder="Type + Enter to add"
                className="min-w-[120px] flex-1 border-none bg-transparent px-1 text-xs text-slate-300 outline-none"
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {LANGUAGE_SUGGESTIONS.filter((l) => !languagesKnown.includes(l)).map((l) => (
                <Chip key={l} theme={themeMode} clickable onClick={() => setLanguagesKnown((prev) => [...prev, l])}>
                  + {l}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-white/10 pt-4">
            <h4 className="text-sm font-semibold text-slate-200">Address &amp; location details</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Country</Label>
                <div className={fieldClass('flex items-center text-slate-500')}>🇮🇳 India</div>
              </div>
              <div>
                <Label>State</Label>
                <RestrictedAutocompleteInput value={personalState} onChange={handlePersonalStateChange} options={INDIAN_STATES} placeholder="e.g. Telangana" theme={themeMode} strict />
              </div>
              <div>
                <Label>City</Label>
                <RestrictedAutocompleteInput value={personalCity} onChange={setPersonalCity} options={CITIES_BY_STATE[personalState] || []} placeholder="e.g. Hyderabad" theme={themeMode} strict={false} />
              </div>
            </div>
            <div>
              <Label>
                Area / locality{' '}
                <span className="font-normal text-slate-600">(optional{personalCity.trim() ? ` — restricted to ${personalCity.trim()}` : ''})</span>
              </Label>
              <LocalityAutocompleteInput value={personalArea} onChange={setPersonalArea} city={personalCity} placeholder="Start typing to search your locality" theme={themeMode} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label>
                  Full address <span className="font-normal text-slate-600">(optional)</span>
                </Label>
                <span className="text-[11px] text-slate-600">{personalAddressLine.length}/200</span>
              </div>
              <textarea
                rows={2}
                maxLength={200}
                value={personalAddressLine}
                onChange={(e) => setPersonalAddressLine(e.target.value)}
                placeholder="Flat/House No., Street, Landmark"
                className={fieldClass('resize-none')}
              />
            </div>
          </div>
        </div>
      )}

      {step === PROFESSIONAL_STEP && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Professional profile</h3>

          <CategoryPicker categories={categories} value={categorySelection} onChange={setCategorySelection} theme={themeMode} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label required>Experience (years)</Label>
              <input type="number" min={0} value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} placeholder="e.g. 5" className={fieldClass()} />
            </div>
            <div>
              <Label required>Qualification</Label>
              <input value={qualification} onChange={(e) => setQualification(e.target.value)} placeholder={qualificationPlaceholder} className={fieldClass()} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-400">Service type</label>
              <div className="flex flex-wrap gap-1.5">
                {SERVICE_TYPE_OPTIONS.map((s) => (
                  <ChipToggle key={s.value} theme={themeMode} label={s.label} selected={serviceTypes.includes(s.value)} onClick={() => setServiceTypes((prev) => toggle(prev, s.value))} />
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-400">Class type</label>
              <div className="flex flex-wrap gap-1.5">
                {CLASS_TYPE_OPTIONS.map((c) => (
                  <ChipToggle key={c.value} theme={themeMode} label={c.label} selected={classTypes.includes(c.value)} onClick={() => setClassTypes((prev) => toggle(prev, c.value))} />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-slate-400">
                Service areas <span className="font-normal text-slate-600">(optional — helps students find you nearby)</span>
              </label>
              <select value={areaCity} onChange={(e) => { setAreaCity(e.target.value); setServiceAreaKeys([]); }} className="w-40 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500">
                <option value="">City…</option>
                {availableCities.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {areaCity && (
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-2">
                {areasForCity.length === 0 && <span className="text-[11px] text-slate-500">No localities configured for this city yet.</span>}
                {areasForCity.map((a) => (
                  <ChipToggle key={a.key} theme={themeMode} label={a.label} selected={serviceAreaKeys.includes(a.key)} onClick={() => setServiceAreaKeys((prev) => toggle(prev, a.key))} />
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-600">
              Apartment-complex / community-level targeting isn&apos;t built yet — city + locality only for now.
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-400">
                Professional bio <span className="ml-1 text-red-400">*</span>
              </label>
              <span className="text-xs text-slate-600">{bio.length}/500</span>
            </div>
            <textarea
              rows={3}
              maxLength={500}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Your teaching style, achievements, and what students can expect…"
              className={fieldClass('resize-none')}
            />
          </div>
        </div>
      )}

      {step === DOCS_STEP && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Verification documents</h3>

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>You can skip this step for now, but approval will be put on hold until these documents are uploaded and verified later from your coach profile.</span>
          </div>

          <div className="space-y-2">
            {DOC_TYPE_OPTIONS.map((doc) => {
              const existing = existingDocs.find((d) => d.docType === doc.value);
              const pending = pendingDocs[doc.value];
              const uploading = docUploading[doc.value] ?? false;
              return (
                <div key={doc.value} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200">{doc.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{doc.hint}</p>
                    {pending ? (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                        <Check className="h-3 w-3" /> {pending.fileName}
                      </p>
                    ) : existing ? (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                        <Check className="h-3 w-3" /> Uploaded · {existing.reviewStatus}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {pending && (
                      <button
                        type="button"
                        onClick={() => setPendingDocs((prev) => { const next = { ...prev }; delete next[doc.value]; return next; })}
                        className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <label
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all ${
                        pending || existing
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'
                      }`}
                    >
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {uploading ? 'Uploading…' : pending || existing ? 'Replace' : 'Upload'}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        disabled={uploading}
                        onChange={(e) => handleDocumentFile(doc.value, e)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === PRICING_STEP && <PaymentPricingStep value={paymentPricing} onChange={setPaymentPricing} theme={themeMode} />}

      {step === REVIEW_STEP && (
        <div className="space-y-3 text-sm">
          <h3 className="text-sm font-semibold text-slate-200">Review your information</h3>

          {isSelf && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">Personal information</p>
                <button type="button" onClick={() => setStep(PERSONAL_STEP)} className="text-xs font-medium text-indigo-400 hover:underline">
                  Edit
                </button>
              </div>
              <p className="text-slate-200">
                {firstName} {lastName}
                {gender ? ` · ${GENDER_OPTIONS.find((g) => g.value === gender)?.label ?? gender}` : ''}
                {dob ? ` · ${dob}` : ''}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {email ?? '—'}
                {phone ? ` · +91 ${phone}` : ''}
              </p>
              {(personalArea || personalCity) && <p className="mt-0.5 text-xs text-slate-500">{[personalArea, personalCity, personalState].filter(Boolean).join(', ')}</p>}
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">Professional profile</p>
              <button type="button" onClick={() => setStep(PROFESSIONAL_STEP)} className="text-xs font-medium text-indigo-400 hover:underline">
                Edit
              </button>
            </div>
            <p className="text-slate-200">
              {categories.find((c) => c.id === categorySelection.categoryId)?.name ?? '—'}
              {categorySelection.subcategoryIds.length > 0
                ? ` — ${(categories.find((c) => c.id === categorySelection.categoryId)?.subcategories ?? [])
                    .filter((s) => categorySelection.subcategoryIds.includes(s.id))
                    .map((s) => (s.id === categorySelection.primarySubcategoryId ? `${s.name} (Primary)` : s.name))
                    .join(', ')}`
                : ''}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">{experienceYears} yrs · {qualification}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {serviceTypes.join(', ')} · {classTypes.map((c) => CLASS_TYPE_OPTIONS.find((o) => o.value === c)?.label ?? c).join(', ')}
              {serviceAreaKeys.length > 0 ? ` · ${areas.filter((a) => serviceAreaKeys.includes(a.key)).map((a) => a.label).join(', ')}` : ''}
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">Documents</p>
              <button type="button" onClick={() => setStep(DOCS_STEP)} className="text-xs font-medium text-indigo-400 hover:underline">
                Edit
              </button>
            </div>
            <p className="text-slate-200">
              {existingDocs.length + Object.keys(pendingDocs).length} on file
              {Object.keys(pendingDocs).length > 0 ? ' (new ones queued)' : ''}
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">Pricing</p>
              <button type="button" onClick={() => setStep(PRICING_STEP)} className="text-xs font-medium text-indigo-400 hover:underline">
                Edit
              </button>
            </div>
            <p className="text-slate-200">
              {paymentPricing.policies.filter((p) => p.enabled).length} plan(s)
              {paymentPricing.policies.some((p) => p.enabled)
                ? ` — ${paymentPricing.policies.filter((p) => p.enabled).map((p) => p.policyType.replace('_', ' ')).join(', ')}`
                : ''}
            </p>
          </div>

          <p className="text-xs text-slate-500">
            {mode === 'self' ? 'Documents can still be added later from My HR.' : 'This creates or updates the coach profile, documents, and pricing for this member.'}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => (stepIndex === 0 ? onCancel() : setStep(step - 1))}
          className="flex items-center gap-1 rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {stepIndex === 0 ? 'Cancel' : 'Back'}
        </button>
        {step !== REVIEW_STEP ? (
          <button
            type="button"
            disabled={!isStepValid(step)}
            onClick={() => setStep(step + 1)}
            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {mode === 'admin' ? 'Save profile' : 'Complete onboarding'}
          </button>
        )}
      </div>
    </div>
  );
}
