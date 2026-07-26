'use client';

// Academy / Organization Onboarding Wizard
// Multi-step wizard for setting up an academy, school, studio, or sports center.
// Steps:
// 1. Academy Basic Info & Branding (Name, Tagline, About, Primary Contact, Languages, Logo/Colors)
// 2. Main Branch & Facilities (Address, State/City, PIN Code, Geofence radius, Amenities checklist)
// 3. Programs & Offerings (CategoryPicker taxonomy: categories/subcategories/tags, age groups, skill levels, sportKeys for Explore search, instruction modes)
// 4. Business KYC & Bank Payouts (Legal entity type, GSTIN, PAN, Bank Account info, Document uploads)
// 5. Default Fee Plans & Financial Rules (PaymentPricingStep: Monthly subscriptions, Drop-in, Class packages, Registration fee, Late/Absence fines)
// 6. Review & Submit (Summary review, Terms agreement, Submit for platform verification)

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  AlertCircle,
  Upload,
  Trash2,
  Camera,
  Loader2,
  ShieldCheck,
  MapPin,
  Sparkles,
  Globe,
  FileText,
  CreditCard,
  Phone,
  Mail,
  User,
  CheckCircle2,
} from 'lucide-react';
import { Chip } from '@/components/Chip';
import { CategoryPicker, type CategorySelection } from '@/components/CategoryPicker';
import { useCategoryTaxonomy } from '@/lib/useCategoryTaxonomy';
import { INDIAN_STATES, CITIES_BY_STATE } from '@/lib/indianStatesCities';
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

interface Sport {
  key: string;
  label: string;
  category: string | null;
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
  sports: Sport[];
  cities: GeoCityApi[];
  areas: GeoAreaApi[];
}

const ENTITY_TYPES = [
  { value: 'sole_proprietorship', label: 'Sole Proprietorship', hint: 'Individual / single-owner academy' },
  { value: 'partnership', label: 'Partnership Firm', hint: 'Registered or unregistered partnership' },
  { value: 'private_limited', label: 'Private Limited (Pvt Ltd)', hint: 'Incorporated company' },
  { value: 'llp', label: 'Limited Liability Partnership (LLP)', hint: 'LLP registered under MCA' },
  { value: 'trust_society', label: 'Trust / NGO / Society', hint: 'Registered educational or sports trust' },
  { value: 'other', label: 'Other', hint: 'Unregistered or community organization' },
];

const AMENITIES_LIST = [
  'Indoor Courts',
  'Air Conditioning',
  'Synthetic Turf',
  'Changing Rooms',
  'Lockers',
  'CCTV Surveillance',
  'Parking Available',
  'Parent Waiting Area',
  'First Aid Station',
  'Equipment Rental',
  'Drinking Water',
  'Pro Shop / Canteen',
];

const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Kannada', 'Telugu', 'Tamil', 'Malayalam', 'Marathi', 'Gujarati', 'Bengali'];

const KYC_DOC_TYPES = [
  { id: 'business_proof', label: 'Business Registration / License', hint: 'Shop & Establishment, MSME/Udyam, or Incorporation Certificate' },
  { id: 'gst_certificate', label: 'GST Certificate', hint: 'Optional if turn-over is below threshold' },
  { id: 'pan_card', label: 'PAN Card (Org or Owner)', hint: 'Required for Razorpay Route online payouts' },
  { id: 'bank_proof', label: 'Cancelled Cheque / Bank Passbook', hint: 'For payout account verification' },
  { id: 'owner_id', label: 'Owner / Authorized Signatory Aadhaar', hint: 'Identity proof of primary contact' },
];

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}</span>
    </div>
  );
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
  return `w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500 transition ${extra}`;
}

export interface AcademyOnboardingWizardProps {
  organizationId?: string;
  academyName?: string;
  onCancel: () => void;
  onDone: () => void;
}

export default function AcademyOnboardingWizard({
  organizationId,
  academyName = '',
  onCancel,
  onDone,
}: AcademyOnboardingWizardProps) {
  const { mode: themeMode } = useTheme();
  const { categories } = useCategoryTaxonomy();

  const STEPS = [
    'Academy Info & Brand',
    'Main Branch & Venue',
    'Programs & Taxonomy',
    'KYC & Payouts',
    'Pricing & Fee Plans',
    'Review & Submit',
  ];

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(organizationId ?? null);
  const [orgType, setOrgType] = useState<string>('academy');

  // ?testmode in the URL — same trick CoachProfileWizard uses (itself
  // carried over from V1's CoachOnboardingWizard) — reveals a per-step
  // "⚡ Auto-fill Test Data" button. Read directly off window.location
  // instead of useSearchParams() so this component doesn't force every
  // caller to wrap it in a <Suspense> boundary just for this.
  const [isTestMode, setIsTestMode] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('testmode')) {
      setIsTestMode(true);
    }
  }, []);

  // Taxonomy & Geo reference data
  const [sportsTaxonomy, setSportsTaxonomy] = useState<Sport[]>([]);

  // Step 1: Basic Info & Branding
  const [name, setName] = useState(academyName);
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [languages, setLanguages] = useState<string[]>(['English', 'Hindi']);
  const [brandColor, setBrandColor] = useState('#4f46e5');
  const [logoPath, setLogoPath] = useState('');

  // Step 2: Main Branch & Venue Location
  const [branchName, setBranchName] = useState('Main Campus');
  const [addressLine, setAddressLine] = useState('');
  const [stateName, setStateName] = useState('Telangana');
  const [cityName, setCityName] = useState('Hyderabad');
  const [areaName, setAreaName] = useState('');
  const [pincode, setPincode] = useState('');
  const [geofenceRadius, setGeofenceRadius] = useState(100);
  const [amenities, setAmenities] = useState<string[]>(['Indoor Courts', 'Parking Available', 'First Aid Station']);

  // Step 3: Programs & Taxonomy (CategoryPicker taxonomy + sportKeys for Explore)
  const [categorySelection, setCategorySelection] = useState<CategorySelection>({
    categoryId: null,
    subcategoryIds: [],
    primarySubcategoryId: null,
    tagIds: [],
    ageGroups: ['8-14', '15-18'],
    skillLevels: ['Beginner', 'Intermediate'],
  });
  const [selectedSportKeys, setSelectedSportKeys] = useState<string[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>(['offline']);
  const [classTypes, setClassTypes] = useState<string[]>(['group']);

  // Step 4: KYC & Payouts
  const [entityType, setEntityType] = useState('sole_proprietorship');
  const [gstin, setGstin] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [docUploads, setDocUploads] = useState<Record<string, { path: string; fileName: string }>>({});

  // Step 5: Pricing Strategy
  const [paymentPricing, setPaymentPricing] = useState<PaymentPricingSelection>(createDefaultPaymentPricingSelection());

  // Step 6: Agreement
  const [termsAgreed, setTermsAgreed] = useState(false);

  useEffect(() => {
    // Load public sports taxonomy for Explore/Marketplace search mapping
    api<TaxonomyResponse>('/api/v1/public/taxonomy')
      .then((t) => {
        setSportsTaxonomy(t.sports);
      })
      .catch(() => {});

    if (activeOrgId) {
      // Prefetch existing branding if available
      api<{ logoPath: string | null; colors: Record<string, string> | null; displayName: string | null }>(
        `/api/v1/orgs/${activeOrgId}/branding`
      )
        .then((b) => {
          if (b.displayName) setName(b.displayName);
          if (b.logoPath) setLogoPath(b.logoPath);
          if (b.colors?.primary) setBrandColor(b.colors.primary);
        })
        .catch(() => {});
    }
  }, [activeOrgId]);

  function toggleItem<T>(list: T[], val: T): T[] {
    return list.includes(val) ? list.filter((item) => item !== val) : [...list, val];
  }

  // ⚡ Auto-fill Test Data — only ever fills the CURRENTLY visible step, same
  // philosophy as CoachProfileWizard's fillTestData: each step's fields are
  // wired to that step's real setters, so nothing here bypasses actual
  // validation or backend calls. Step 4's "document upload" is a fake-path
  // stub even for manual clicks today (see handler above), so this matches
  // that existing behavior rather than downgrading a real upload.
  function fillTestData() {
    const randomId = Math.floor(1000 + Math.random() * 9000);

    if (step === 1) {
      const randAcademy = [
        'Ace Badminton Academy',
        'Champions Cricket Academy',
        'Elite Football School',
        'Rising Stars Sports Academy',
        'Victory Tennis Academy',
        'Apex Swimming Academy',
      ][Math.floor(Math.random() * 6)];
      const randContact = ['Rahul Verma', 'Anjali Nair', 'Karan Mehta', 'Sneha Iyer', 'Arjun Rao', 'Divya Menon'][Math.floor(Math.random() * 6)];
      const randPhone = Math.floor(6000000000 + Math.random() * 3999999999).toString();
      const slug = randAcademy.toLowerCase().replace(/[^a-z0-9]+/g, '');

      setName(`${randAcademy} ${randomId}`);
      setTagline('Nurturing Champions Since 2018');
      setDescription(
        'A dedicated training center focused on structured coaching programs, modern facilities, and a track record of developing competitive athletes.'
      );
      setContactName(randContact);
      setContactPhone(randPhone);
      setContactEmail(`contact@${slug}${randomId}.com`);
      setLanguages(['English', 'Hindi']);
      setBrandColor(['#4f46e5', '#0ea5e9', '#f97316', '#16a34a', '#db2777'][Math.floor(Math.random() * 5)]);
    }

    if (step === 2) {
      const randState = INDIAN_STATES[Math.floor(Math.random() * INDIAN_STATES.length)];
      const stateCities = CITIES_BY_STATE[randState] ?? [];
      const randCity = stateCities[Math.floor(Math.random() * stateCities.length)] ?? 'Hyderabad';
      setBranchName('Main Campus');
      setAddressLine('Plot 42, Financial District, Nanakramguda');
      setStateName(randState);
      setCityName(randCity);
      setAreaName('Indiranagar');
      setPincode(Math.floor(100000 + Math.random() * 899999).toString());
      setGeofenceRadius(100);
      setAmenities(['Indoor Courts', 'Parking Available', 'First Aid Station', 'Drinking Water']);
    }

    if (step === 3) {
      if (categories.length > 0) {
        const cat = categories[Math.floor(Math.random() * categories.length)];
        const sub = cat.subcategories.length > 0 ? cat.subcategories[Math.floor(Math.random() * cat.subcategories.length)] : null;
        setCategorySelection({
          categoryId: cat.id,
          subcategoryIds: sub ? [sub.id] : [],
          primarySubcategoryId: sub?.id ?? null,
          tagIds: [],
          ageGroups: ['8-14', '15-18'],
          skillLevels: ['Beginner', 'Intermediate'],
        });
      }
      if (sportsTaxonomy.length > 0) {
        setSelectedSportKeys(sportsTaxonomy.slice(0, 2).map((s) => s.key));
      }
      setServiceTypes(['offline', 'online']);
      setClassTypes(['group', 'one_to_one']);
    }

    if (step === 4) {
      setEntityType('private_limited');
      setPanNumber('ABCPK1234F');
      setGstin('36ABCPK1234F1Z5');
      setBankAccountName(name.trim() || 'Sample Academy Pvt Ltd');
      setBankName('HDFC Bank');
      setBankAccountNumber('50100012345678');
      setBankIfsc('HDFC0001234');
      const filled: Record<string, { path: string; fileName: string }> = {};
      for (const doc of KYC_DOC_TYPES) {
        filled[doc.id] = { path: `/documents/${doc.id}.pdf`, fileName: `${doc.id}_sample.pdf` };
      }
      setDocUploads(filled);
    }

    if (step === 5) {
      // Already valid out of the box (createDefaultPaymentPricingSelection
      // pre-enables monthly_subscription/per_class/trial_session with valid
      // rule defaults) — this just enables one more plan for a fuller demo.
      setPaymentPricing((prev) => ({
        ...prev,
        policies: prev.policies.map((p) => (p.policyType === 'package' ? { ...p, enabled: true } : p)),
      }));
    }
  }

  // --- Step Validations ---
  const isStep1Valid = name.trim().length >= 3 && contactPhone.trim().length >= 10;
  const isStep2Valid = addressLine.trim().length >= 5 && cityName.trim().length >= 2;
  const isStep3Valid = categorySelection.categoryId !== null || selectedSportKeys.length > 0;
  const isStep4Valid = panNumber.trim().length >= 10 || entityType !== 'sole_proprietorship';
  const isStep5Valid = isPaymentPricingValid(paymentPricing);

  async function handleSubmitAll() {
    setError(null);
    setSubmitting(true);

    try {
      let targetOrgId = activeOrgId;

      // 0. Bootstrap Organization if not created yet
      if (!targetOrgId) {
        const slugCandidate = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const res = await fetch('/api/v1/orgs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgType, name: name.trim(), slug: slugCandidate }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error?.message ?? 'Could not create the organization.');
        targetOrgId = body.data.organizationId;
        setActiveOrgId(targetOrgId);

        // Activate workspace
        await fetch('/api/v1/me/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId: targetOrgId }),
        });
      }

      // 1. Update Org Branding
      await fetch(`/api/v1/orgs/${targetOrgId}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: name.trim(),
          logoPath: logoPath || null,
          colors: { primary: brandColor },
        }),
      });

      // 2. Update Marketplace Listing (slug, headline, description, sportKeys,
      // cityKey, plus the Step 3 category/subcategory/tag/age-group/
      // skill-level selection — same taxonomy coach onboarding writes to
      // coach_profiles, now persisted on the listing instead of dropped).
      const slugCandidate = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      await fetch(`/api/v1/orgs/${targetOrgId}/listing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: slugCandidate,
          headline: tagline || undefined,
          description: description || undefined,
          sportKeys: selectedSportKeys,
          cityKey: cityName.toLowerCase().replace(/\s+/g, '_'),
          areaKeys: areaName ? [areaName.toLowerCase().replace(/\s+/g, '_')] : [],
          categoryId: categorySelection.categoryId ?? undefined,
          subcategoryIds: categorySelection.subcategoryIds,
          primarySubcategoryId: categorySelection.primarySubcategoryId ?? undefined,
          tagIds: categorySelection.tagIds,
          ageGroups: categorySelection.ageGroups,
          skillLevels: categorySelection.skillLevels,
        }),
      });

      // 3. Create Main Branch Location
      if (addressLine) {
        await fetch(`/api/v1/orgs/${targetOrgId}/branches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: branchName || 'Main Campus',
            geo: {
              address: addressLine,
              state: stateName,
              city: cityName,
              area: areaName,
              pincode,
              geofenceRadius,
              amenities,
            },
          }),
        }).catch(() => {}); // Ignore duplicate branch if already created
      }

      // 4. Publish the listing — upsertMyListing() (step 2 above) always
      // leaves a fresh listing in 'draft' regardless of org verification
      // status; this is the explicit transition out of draft (Doc 02 §9),
      // to 'live' immediately if the org is already active, otherwise
      // 'pending_verification' until platform staff approve the org
      // (activateOrgListings() then promotes it). Without this call the
      // listing never appears on /explore even after approval.
      await fetch(`/api/v1/orgs/${targetOrgId}/listing/publish`, { method: 'POST' }).catch(() => {});

      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save academy profile.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-slate-900/90 p-6 sm:p-8 text-slate-100 shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-400">
            <Building2 className="h-4 w-4" />
            <span>Academy Workspace Provisioning</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white">{name || 'Set Up Your Academy'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {isTestMode && step !== 6 && (
            <button
              type="button"
              onClick={fillTestData}
              className="flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-1.5 text-[10px] font-bold text-white transition-all hover:bg-indigo-600"
            >
              ⚡ Auto-fill Test Data
            </button>
          )}
          <button
            onClick={onCancel}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Progress Dots Bar */}
      <div className="mb-8 flex items-center justify-between gap-2">
        {STEPS.map((label, idx) => {
          const stepNum = idx + 1;
          const isActive = step === stepNum;
          const isDone = step > stepNum;
          return (
            <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
              <button
                onClick={() => isDone && setStep(stepNum)}
                disabled={!isDone && !isActive}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                  isActive
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/20'
                    : isDone
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                    : 'bg-white/5 text-slate-500 border border-white/10'
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : stepNum}
              </button>
              <span className={`text-[11px] font-medium hidden sm:inline-block ${isActive ? 'text-indigo-400 font-semibold' : 'text-slate-500'}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <ErrorBanner error={error} />

      {/* STEP 1: Academy Basic Info & Branding */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="border-b border-white/10 pb-3">
            <h2 className="text-lg font-semibold text-white">1. Basic Information & Branding</h2>
            <p className="text-xs text-slate-400">Establish your academy's brand, public tagline, and primary contact details.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label required>Academy Name</Label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Shuttle Smash Badminton Academy"
                className={fieldClass()}
              />
            </div>

            <div>
              <Label>Public Tagline / Headline</Label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Nurturing Champions Since 2018"
                className={fieldClass()}
              />
            </div>

            <div>
              <Label>Brand Accent Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
                />
                <span className="text-xs text-slate-400">Used for your public page & student receipts</span>
              </div>
            </div>

            <div className="sm:col-span-2">
              <Label>About Academy / Description</Label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell prospective students and parents about your facilities, coaching methodology, and achievements..."
                className={fieldClass()}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <User className="h-4 w-4 text-indigo-400" />
              Primary Administrative Contact
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label required>Contact Person Name</Label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Rahul Verma (Director)"
                  className={fieldClass()}
                />
              </div>
              <div>
                <Label required>Phone Number (WhatsApp)</Label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className={fieldClass()}
                />
              </div>
              <div>
                <Label>Official Email</Label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="contact@shuttlesmash.com"
                  className={fieldClass()}
                />
              </div>
            </div>
          </div>

          <div>
            <Label>Languages Taught In</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((lang) => (
                <Chip
                  key={lang}
                  clickable
                  selected={languages.includes(lang)}
                  onClick={() => setLanguages(toggleItem(languages, lang))}
                >
                  {lang}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Main Branch & Venue Location */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="border-b border-white/10 pb-3">
            <h2 className="text-lg font-semibold text-white">2. Main Campus & Facility Details</h2>
            <p className="text-xs text-slate-400">Configure your primary physical location and facility amenities for attendance check-ins.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label required>Campus / Branch Name</Label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="Main Campus (or e.g. Gachibowli Center)"
                className={fieldClass()}
              />
            </div>

            <div>
              <Label>PIN Code</Label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="500032"
                className={fieldClass()}
              />
            </div>

            <div className="sm:col-span-2">
              <Label required>Street Address</Label>
              <input
                type="text"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Plot 42, Financial District, Nanakramguda"
                className={fieldClass()}
              />
            </div>

            <div>
              <Label required>State</Label>
              <select
                value={stateName}
                onChange={(e) => {
                  setStateName(e.target.value);
                  const citiesList = CITIES_BY_STATE[e.target.value] || [];
                  if (citiesList.length) setCityName(citiesList[0]);
                }}
                className={fieldClass()}
              >
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s} className="bg-slate-900 text-white">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label required>City</Label>
              <select
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                className={fieldClass()}
              >
                {(CITIES_BY_STATE[stateName] || ['Hyderabad', 'Bengaluru', 'Mumbai', 'Delhi']).map((c) => (
                  <option key={c} value={c} className="bg-slate-900 text-white">
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Locality / Neighborhood</Label>
              <input
                type="text"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="e.g. Gachibowli"
                className={fieldClass()}
              />
            </div>

            <div>
              <Label>Attendance Geofence Radius (Meters)</Label>
              <select
                value={geofenceRadius}
                onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                className={fieldClass()}
              >
                <option value={50} className="bg-slate-900 text-white">50m (Tight venue check-in)</option>
                <option value={100} className="bg-slate-900 text-white">100m (Standard campus)</option>
                <option value={250} className="bg-slate-900 text-white">250m (Large complex/stadium)</option>
                <option value={500} className="bg-slate-900 text-white">500m (Wide perimeter)</option>
              </select>
            </div>
          </div>

          <div>
            <Label>Facility Amenities</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {AMENITIES_LIST.map((item) => (
                <Chip
                  key={item}
                  clickable
                  selected={amenities.includes(item)}
                  onClick={() => setAmenities(toggleItem(amenities, item))}
                >
                  {item}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Programs & Taxonomy */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="border-b border-white/10 pb-3">
            <h2 className="text-lg font-semibold text-white">3. Programs & Offering Taxonomy</h2>
            <p className="text-xs text-slate-400">
              Select category/subcategory/tags from the rich taxonomy for academy programs, plus sport keys for Explore marketplace discovery.
            </p>
          </div>

          {/* Rich Taxonomy Picker */}
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              Category & Specialty Taxonomy (Categories / Subcategories / Tags)
            </h3>
            <CategoryPicker
              categories={categories}
              value={categorySelection}
              onChange={setCategorySelection}
              theme="dark"
            />
          </div>

          {/* Explore / Marketplace Search Sports Mapping */}
          {sportsTaxonomy.length > 0 && (
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Globe className="h-4 w-4 text-indigo-400" />
                Marketplace Discovery Keywords (`taxonomy_sports` Keys)
              </h3>
              <p className="text-xs text-slate-400">
                Select specific sport keys used by students filtering in the `/explore` discovery search.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                {sportsTaxonomy.map((s) => (
                  <Chip
                    key={s.key}
                    clickable
                    selected={selectedSportKeys.includes(s.key)}
                    onClick={() => setSelectedSportKeys(toggleItem(selectedSportKeys, s.key))}
                  >
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {/* Delivery & Class Modes */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Service Delivery Type</Label>
              <div className="mt-2 flex gap-2">
                {['offline', 'online'].map((st) => (
                  <Chip
                    key={st}
                    clickable
                    selected={serviceTypes.includes(st)}
                    onClick={() => setServiceTypes(toggleItem(serviceTypes, st))}
                  >
                    {st === 'offline' ? 'Offline (On-Site)' : 'Online (Virtual)'}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <Label>Class Formats</Label>
              <div className="mt-2 flex gap-2">
                {['group', 'one_to_one'].map((ct) => (
                  <Chip
                    key={ct}
                    clickable
                    selected={classTypes.includes(ct)}
                    onClick={() => setClassTypes(toggleItem(classTypes, ct))}
                  >
                    {ct === 'group' ? 'Group Batches' : '1-on-1 Private'}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: KYC & Payout Details */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="border-b border-white/10 pb-3">
            <h2 className="text-lg font-semibold text-white">4. Business KYC & Payout Account</h2>
            <p className="text-xs text-slate-400">Provide legal entity information and bank details for automated online fee settlements.</p>
          </div>

          <div>
            <Label required>Legal Entity Structure</Label>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {ENTITY_TYPES.map((et) => (
                <button
                  type="button"
                  key={et.value}
                  onClick={() => setEntityType(et.value)}
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                    entityType === et.value
                      ? 'border-indigo-500 bg-indigo-500/10 text-white'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                  }`}
                >
                  <span className="text-sm font-semibold">{et.label}</span>
                  <span className="text-xs text-slate-400">{et.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label required>Organization / Owner PAN Number</Label>
              <input
                type="text"
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                maxLength={10}
                className={fieldClass()}
              />
            </div>

            <div>
              <Label>GSTIN (Optional)</Label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="36ABCDE1234F1Z5"
                maxLength={15}
                className={fieldClass()}
              />
            </div>
          </div>

          {/* Bank Payout Account Details */}
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-indigo-400" />
              Settlement Bank Account (Razorpay Route KYC)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Account Holder Name</Label>
                <input
                  type="text"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder="Shuttle Smash Sports Pvt Ltd"
                  className={fieldClass()}
                />
              </div>
              <div>
                <Label>Bank Name</Label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="HDFC Bank"
                  className={fieldClass()}
                />
              </div>
              <div>
                <Label>Account Number</Label>
                <input
                  type="password"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="50100012345678"
                  className={fieldClass()}
                />
              </div>
              <div>
                <Label>IFSC Code</Label>
                <input
                  type="text"
                  value={bankIfsc}
                  onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                  placeholder="HDFC0001234"
                  maxLength={11}
                  className={fieldClass()}
                />
              </div>
            </div>
          </div>

          {/* Verification Documents Checklist */}
          <div>
            <Label>Verification Document Uploads</Label>
            <div className="mt-2 space-y-2">
              {KYC_DOC_TYPES.map((doc) => {
                const uploaded = !!docUploads[doc.id];
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{doc.label}</div>
                      <div className="text-slate-400">{doc.hint}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDocUploads({
                          ...docUploads,
                          [doc.id]: { path: `/documents/${doc.id}.pdf`, fileName: `${doc.id}_sample.pdf` },
                        });
                      }}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
                        uploaded
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-white/10 text-slate-200 hover:bg-white/20'
                      }`}
                    >
                      {uploaded ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Uploaded</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-3.5 w-3.5" />
                          <span>Upload File</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: Pricing Strategy */}
      {step === 5 && (
        <div className="space-y-6">
          <div className="border-b border-white/10 pb-3">
            <h2 className="text-lg font-semibold text-white">5. Default Fee Plans & Financial Policies</h2>
            <p className="text-xs text-slate-400">Configure default pricing strategies applied to new batch enrollments.</p>
          </div>

          <PaymentPricingStep
            value={paymentPricing}
            onChange={setPaymentPricing}
            theme="dark"
          />
        </div>
      )}

      {/* STEP 6: Review & Finalize */}
      {step === 6 && (
        <div className="space-y-6">
          <div className="border-b border-white/10 pb-3">
            <h2 className="text-lg font-semibold text-white">6. Final Review & Provisioning</h2>
            <p className="text-xs text-slate-400">Review your academy configuration before requesting platform verification.</p>
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-xs">
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span className="text-slate-400">Academy Name</span>
              <span className="font-semibold text-white">{name}</span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span className="text-slate-400">Primary Contact</span>
              <span className="text-slate-200">{contactName} ({contactPhone})</span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span className="text-slate-400">Main Campus</span>
              <span className="text-slate-200">{branchName} — {cityName}, {stateName}</span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span className="text-slate-400">Entity Type & PAN</span>
              <span className="text-slate-200">{entityType.replace('_', ' ').toUpperCase()} • PAN: {panNumber || 'Not provided'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">KYC Documents</span>
              <span className="text-emerald-400 font-semibold">{Object.keys(docUploads).length} Documents Uploaded</span>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4 text-xs text-indigo-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              Platform Verification Process
            </div>
            <p>
              Upon submission, your academy workspace will be instantly accessible for setup. Public listing visibility on `/explore` will go live once your verification documents are reviewed by the Abhyas platform team.
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/5 text-indigo-600 focus:ring-indigo-500"
            />
            <span>I confirm that the details provided are accurate and agree to the Abhyas Terms of Service and Data Policy.</span>
          </label>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-4">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <div />
        )}

        {step < 6 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={
              (step === 1 && !isStep1Valid) ||
              (step === 2 && !isStep2Valid) ||
              (step === 3 && !isStep3Valid) ||
              (step === 4 && !isStep4Valid) ||
              (step === 5 && !isStep5Valid)
            }
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-50"
          >
            <span>Continue</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmitAll}
            disabled={!termsAgreed || submitting}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Provisioning Academy…</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Submit & Provision Workspace</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
