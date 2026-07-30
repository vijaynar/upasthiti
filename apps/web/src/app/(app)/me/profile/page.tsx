'use client';

// My Profile — one self-service page every role lands on (Doc 05 §5/§7):
// identity fields + linked sign-in methods, always; a coach's professional
// profile, documents, and pricing on top when the caller holds a coach/
// assistant_coach role in their active org.
//
// The header/card/field shell lives in components/profile/ProfileSections
// (role-agnostic on purpose — a future student/admin profile page reuses
// it) while this file owns which fields go in which card and how they're
// loaded/saved, since that part genuinely is coach-shaped today.
//
// Category & specialty are edited inline via the same CategoryPicker the
// onboarding wizard uses, so this page and onboarding never drift apart on
// that step. Everything else deep in the taxonomy (service areas, documents,
// pricing) still goes through CoachProfileWizard, mounted on demand under
// "Advanced setup" rather than re-implemented here.

import { useEffect, useState } from 'react';
import {
  UserRound,
  Mail,
  ShieldCheck,
  Briefcase,
  Calendar,
  Cake,
  GraduationCap,
  FileText,
  Bell,
  IndianRupee,
  Loader2,
  Check,
  Upload,
  BellOff,
  Pencil,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Star,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import CoachProfileWizard from '@/components/CoachProfileWizard';
import { Chip } from '@/components/Chip';
import { RestrictedAutocompleteInput } from '@/components/RestrictedAutocompleteInput';
import { LocalityAutocompleteInput } from '@/components/LocalityAutocompleteInput';
import { INDIAN_STATES, CITIES_BY_STATE } from '@/lib/indianStatesCities';
import { useCategoryTaxonomy } from '@/lib/useCategoryTaxonomy';
import { useTheme } from '@/lib/theme';
import { CategoryPicker, type CategorySelection } from '@/components/CategoryPicker';
import { createBrowserClient } from '@/lib/supabase';
import { PaymentPricingStep, createDefaultPaymentPricingSelection, type PaymentPricingSelection } from '@/components/PaymentPricingStep';
import { applyExistingPricing, toApiPolicies, type ApiPricingPolicy } from '@/lib/pricingApi';
import { SERVICE_TYPE_OPTIONS, CLASS_TYPE_OPTIONS, GENDER_OPTIONS, DOC_TYPE_OPTIONS, LANGUAGE_SUGGESTIONS } from '@/lib/coachProfileConstants';
import { InfoCard, FieldRow, ProfileHeaderCard, ToggleSwitch, Label, ReadOnlyTag, fieldClass, type StatItem } from '@/components/profile/ProfileSections';

// createDefaultPaymentPricingSelection() pre-enables a sensible starting set
// of plans — the right call inside the onboarding wizard, where a coach
// consciously walks through a dedicated Pricing step before submitting. On
// this page, Payment & Pricing is just one card among several under one
// shared Save button, so a coach saving an unrelated field (e.g. their
// phone number) must not silently write fabricated ₹3000/₹500 pricing they
// never reviewed. Starts fully unchecked instead; applyExistingPricing()
// still fills it in correctly once real saved policies exist.
function createEmptyPaymentPricingSelection(): PaymentPricingSelection {
  const base = createDefaultPaymentPricingSelection();
  return { ...base, policies: base.policies.map((p) => ({ ...p, enabled: false, isDefault: false })) };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

const COACH_ROLE_KEYS = ['coach', 'assistant_coach'];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const dob = new Date(iso);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return `${age} Years`;
}

interface Profile {
  id: string;
  displayName: string;
  dob: string | null;
  locale: string;
  timezone: string;
  avatarPath: string | null;
  gender: string | null;
  phone: string | null;
  addressLine: string | null;
  state: string | null;
  city: string | null;
  area: string | null;
  email: string | null;
}

interface AuthMethod {
  id: string;
  provider: string;
  verifiedAt: string | null;
  lastUsedAt: string | null;
}

interface SessionSummary {
  id: string;
  deviceLabel: string | null;
  platform: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  isCurrent: boolean;
}

interface StaffProfile {
  id: string;
  status: 'active' | 'on_leave' | 'offboarded';
  designation: string | null;
  createdAt: string;
}

interface CoachProfile {
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

interface StaffDocument {
  id: string;
  docType: string;
  storagePath: string;
  reviewStatus: string;
}

interface NotificationPreference {
  channel: 'whatsapp' | 'sms' | 'email' | 'push';
  kind: string;
  enabled: boolean;
}

const NOTIFICATION_KINDS: { kind: string; label: string }[] = [{ kind: 'attendance.absence_confirmed', label: 'Absence alerts' }];
const NOTIFICATION_CHANNELS: { channel: NotificationPreference['channel']; label: string }[] = [
  { channel: 'email', label: 'Email' },
  { channel: 'push', label: 'Push' },
  { channel: 'whatsapp', label: 'WhatsApp' },
  { channel: 'sms', label: 'SMS' },
];

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>;
}

const EMPTY_CATEGORY_SELECTION: CategorySelection = {
  categoryId: null,
  subcategoryIds: [],
  primarySubcategoryId: null,
  tagIds: [],
  ageGroups: [],
  skillLevels: [],
};

export default function MyProfilePage() {
  const { categories } = useCategoryTaxonomy();
  const { mode: themeMode } = useTheme();

  const [isCoach, setIsCoach] = useState(false);
  // Three independent async facts have to land before we know which UI to
  // show — plain identity, whether the caller is a coach, and (only if so)
  // whether they've completed coach onboarding yet. Rendering as soon as
  // the first of these resolves flashes the wrong layout (the full page,
  // then a swap to the onboarding wizard) for anyone not yet onboarded.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [roleResolved, setRoleResolved] = useState(false);
  const [coachProfileLoaded, setCoachProfileLoaded] = useState(false);
  const initializing = !profileLoaded || !roleResolved || (isCoach && !coachProfileLoaded);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null);
  const [authMethods, setAuthMethods] = useState<AuthMethod[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [documents, setDocuments] = useState<StaffDocument[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreference[]>([]);
  const [paymentPricing, setPaymentPricing] = useState<PaymentPricingSelection>(createEmptyPaymentPricingSelection());
  // Whether the coach has ever saved a pricing policy — createDefaultPaymentPricingSelection()
  // pre-enables a sensible starting set (a good default for the edit-mode form), but the
  // view-mode summary must not present those un-saved defaults as if they were real.
  const [hasSavedPricing, setHasSavedPricing] = useState(false);

  // --- Edit-mode form state, seeded from the loaded data above whenever edit mode opens ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bio, setBio] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [qualification, setQualification] = useState('');
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [classTypes, setClassTypes] = useState<string[]>([]);
  const [languagesKnown, setLanguagesKnown] = useState<string[]>([]);
  const [categorySelection, setCategorySelection] = useState<CategorySelection>(EMPTY_CATEGORY_SELECTION);
  const [langInput, setLangInput] = useState('');
  const [docUploading, setDocUploading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api<Profile>('/api/v1/me')
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setProfileLoaded(true));
    api<AuthMethod[]>('/api/v1/me/auth-methods').then(setAuthMethods).catch(() => {});
    api<SessionSummary[]>('/api/v1/me/sessions').then(setSessions).catch(() => {});
    api<NotificationPreference[]>('/api/v1/me/notification-preferences').then(setNotifPrefs).catch(() => {});
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace')
      .then(async (w) => {
        if (!w.activeOrgId) return;
        const res = await fetch(`/api/v1/orgs/${w.activeOrgId}/me/roles`);
        const body = await res.json();
        const roleKeys: string[] = body?.data?.roleKeys ?? [];
        setIsCoach(roleKeys.some((k) => COACH_ROLE_KEYS.includes(k)));
      })
      .catch(() => {})
      .finally(() => setRoleResolved(true));
  }, []);

  useEffect(() => {
    if (!isCoach) return;
    api<StaffProfile | null>('/api/v1/me/staff-profile').then(setStaffProfile).catch(() => {});
    api<CoachProfile | null>('/api/v1/me/coach-profile')
      .then(setCoachProfile)
      .catch(() => {})
      .finally(() => setCoachProfileLoaded(true));
    api<StaffDocument[]>('/api/v1/me/staff/documents').then(setDocuments).catch(() => {});
    api<ApiPricingPolicy[]>('/api/v1/me/coach-profile/pricing')
      .then((existing) => {
        setHasSavedPricing(existing.length > 0);
        setPaymentPricing((prev) => applyExistingPricing(prev, existing));
      })
      .catch(() => {});
  }, [isCoach]);

  function beginEdit() {
    if (!profile) return;
    const [first, ...rest] = (profile.displayName ?? '').split(' ');
    setFirstName(first ?? '');
    setLastName(rest.join(' '));
    setGender(profile.gender ?? '');
    setDob(profile.dob ?? '');
    setPhone(profile.phone ?? '');
    setAddressLine(profile.addressLine ?? '');
    setState(profile.state ?? '');
    setCity(profile.city ?? '');
    setArea(profile.area ?? '');
    setAvatarPath(profile.avatarPath ?? null);
    if (coachProfile) {
      setBio(coachProfile.bio ?? '');
      setExperienceYears(coachProfile.experienceYears !== null ? String(coachProfile.experienceYears) : '');
      setQualification(coachProfile.qualification ?? '');
      setServiceTypes(coachProfile.serviceTypes);
      setClassTypes(coachProfile.classTypes);
      setLanguagesKnown(coachProfile.languagesKnown);
      setCategorySelection({
        categoryId: coachProfile.categoryId,
        subcategoryIds: coachProfile.subcategoryIds,
        primarySubcategoryId: coachProfile.primarySubcategoryId,
        tagIds: coachProfile.tagIds,
        ageGroups: coachProfile.ageGroups,
        skillLevels: coachProfile.skillLevels,
      });
    }
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  function handleStateChange(next: string) {
    setState(next);
    const stateCities = CITIES_BY_STATE[next] || [];
    if (city && !stateCities.some((c) => c.toLowerCase() === city.toLowerCase())) setCity('');
  }

  function toggleInList(list: string[], value: string, setter: (v: string[]) => void) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function addLanguage(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = langInput.trim();
    if (val && !languagesKnown.includes(val)) setLanguagesKnown((prev) => [...prev, val]);
    setLangInput('');
  }

  async function handleAvatarFile(file: File) {
    setAvatarUploading(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const { path, token } = await api<{ path: string; signedUrl: string; token: string }>('/api/v1/me/avatar/upload-url', {
        method: 'POST',
        body: JSON.stringify({ ext, contentType: file.type }),
      });
      const supabase = createBrowserClient();
      const { error: uploadErr } = await supabase.storage.from('avatars').uploadToSignedUrl(path, token, file);
      if (uploadErr) throw uploadErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatarPath(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleDocumentFile(docType: string, file: File) {
    setDocUploading((prev) => ({ ...prev, [docType]: true }));
    setError(null);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const { path, token } = await api<{ path: string; signedUrl: string; token: string }>('/api/v1/me/staff/documents/upload-url', {
        method: 'POST',
        body: JSON.stringify({ ext, contentType: file.type, docType }),
      });
      const supabase = createBrowserClient();
      const { error: uploadErr } = await supabase.storage.from('coach-documents').uploadToSignedUrl(path, token, file);
      if (uploadErr) throw uploadErr;
      await api('/api/v1/me/staff/documents', { method: 'POST', body: JSON.stringify({ docType, storagePath: path }) });
      const refreshed = await api<StaffDocument[]>('/api/v1/me/staff/documents');
      setDocuments(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document upload failed.');
    } finally {
      setDocUploading((prev) => ({ ...prev, [docType]: false }));
    }
  }

  async function toggleNotification(channel: NotificationPreference['channel'], kind: string) {
    const current = notifPrefs.find((p) => p.channel === channel && p.kind === kind)?.enabled ?? true;
    const next = !current;
    try {
      await api('/api/v1/me/notification-preferences', { method: 'PUT', body: JSON.stringify({ channel, kind, enabled: next }) });
      setNotifPrefs((prev) => [...prev.filter((p) => !(p.channel === channel && p.kind === kind)), { channel, kind, enabled: next }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      // Identity fields have no dependency on the coach profile, so they save
      // (and reflect immediately) even if the professional-info save below
      // can't proceed — one missing field there shouldn't roll back the rest.
      await api('/api/v1/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
          dob: dob || null,
          gender: gender || null,
          phone: phone.trim() || null,
          addressLine: addressLine.trim() || null,
          state: state.trim() || null,
          city: city.trim() || null,
          area: area.trim() || null,
          avatarPath: avatarPath ?? null,
        }),
      });
      setProfile(await api<Profile>('/api/v1/me'));

      if (isCoach && coachProfile) {
        // categoryId is mandatory server-side (a coach without one is invisible
        // in search) — categorySelection is edited inline via CategoryPicker now,
        // so this just guards against saving before a category is actually picked.
        if (!categorySelection.categoryId || categorySelection.subcategoryIds.length === 0) {
          throw new Error('Your identity details were saved. Pick a coaching category and at least one specialty above, then save again.');
        }
        await api('/api/v1/me/onboard-coach', {
          method: 'POST',
          body: JSON.stringify({
            bio: bio.trim(),
            experienceYears: experienceYears.trim() ? Number(experienceYears) : 0,
            qualification: qualification.trim(),
            languagesKnown,
            ageGroups: categorySelection.ageGroups,
            skillLevels: categorySelection.skillLevels,
            serviceTypes,
            classTypes,
            serviceAreaKeys: coachProfile.serviceAreaKeys,
            allowStudentOverrides: paymentPricing.allowStudentOverrides,
            categoryId: categorySelection.categoryId,
            subcategoryIds: categorySelection.subcategoryIds,
            primarySubcategoryId: categorySelection.primarySubcategoryId,
            tagIds: categorySelection.tagIds,
          }),
        });
        await api('/api/v1/me/coach-profile/pricing', { method: 'PUT', body: JSON.stringify({ policies: toApiPolicies(paymentPricing) }) });
        setHasSavedPricing(true);
        setCoachProfile(await api<CoachProfile | null>('/api/v1/me/coach-profile'));
      }

      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  if (initializing) {
    return (
      <div className="flex items-center justify-center p-24 text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-8">
        <ErrorBanner error={error ?? 'Could not load your profile.'} />
      </div>
    );
  }

  // Not yet onboarded as a coach — the flat "quick edit" layout below needs
  // an existing coach profile to seed itself from, so a first-time coach
  // still gets the full step wizard (category, documents, pricing) here.
  if (isCoach && coachProfile === null) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-8">
        <PageHeader badge="My Account" badgeIcon={UserRound} title="My Profile" description="Finish setting up your coach profile to unlock the full profile page." />
        <CoachProfileWizard mode="self" onCancel={() => {}} onDone={() => window.location.reload()} />
      </div>
    );
  }

  const viewCategory = coachProfile ? categories.find((c) => c.id === coachProfile.categoryId) : null;
  const viewSpecialties = (viewCategory?.subcategories ?? []).filter((s) => coachProfile?.subcategoryIds.includes(s.id));

  const statusLabel = staffProfile ? { active: 'Active', on_leave: 'On leave', offboarded: 'Offboarded' }[staffProfile.status] : null;

  const age = formatAge(profile.dob);
  const stats = (
    [
      staffProfile && { icon: Calendar, label: 'Joined on', value: formatDate(staffProfile.createdAt), color: 'indigo' as const },
      coachProfile?.experienceYears != null && { icon: Briefcase, label: 'Experience', value: `${coachProfile.experienceYears} Years`, color: 'violet' as const },
      coachProfile?.qualification && { icon: GraduationCap, label: 'Qualification', value: coachProfile.qualification, color: 'indigo' as const },
      age && { icon: Cake, label: 'Age', value: age, color: 'rose' as const },
    ] as (StatItem | false | null | undefined | '')[]
  ).filter((s): s is StatItem => Boolean(s));

  const mostRecentSession = sessions.slice().sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''))[0];
  const enabledPolicies = paymentPricing.policies.filter((p) => p.enabled);

  return (
    <div className="mx-auto max-w-6xl space-y-2 p-8 pb-28">
      <PageHeader
        badge="My Account"
        badgeIcon={UserRound}
        title="My Profile"
        description="View and manage your personal information, contact details and preferences."
        action={
          editing ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save changes
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={beginEdit}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit profile
            </button>
          )
        }
      />

      <ErrorBanner error={error} />

      <ProfileHeaderCard
        avatarPath={avatarPath ?? profile.avatarPath}
        avatarUploading={avatarUploading}
        onAvatarFile={editing ? handleAvatarFile : undefined}
        name={editing ? `${firstName} ${lastName}`.trim() : profile.displayName}
        roleLabel={staffProfile?.designation || (isCoach ? 'Coach' : 'Member')}
        statusLabel={statusLabel}
        stats={stats}
        quote={isCoach ? (editing ? bio : coachProfile?.bio ?? undefined) : undefined}
        quotePlaceholder="A short line describing what you coach…"
        editing={editing}
        onQuoteChange={isCoach ? setBio : undefined}
      />

      <div className="grid grid-cols-1 gap-x-4 gap-y-2 lg:grid-cols-3">
        <InfoCard icon={UserRound} title="Personal Information">
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First name</Label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldClass()} />
                </div>
                <div>
                  <Label>Last name</Label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldClass()} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Phone number</Label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ''))} className={fieldClass()} />
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
              <div>
                <Label>Date of birth</Label>
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={fieldClass()} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>State</Label>
                  <RestrictedAutocompleteInput value={state} onChange={handleStateChange} options={INDIAN_STATES} placeholder="e.g. Telangana" theme="dark" strict />
                </div>
                <div>
                  <Label>City</Label>
                  <RestrictedAutocompleteInput value={city} onChange={setCity} options={CITIES_BY_STATE[state] || []} placeholder="e.g. Hyderabad" theme="dark" strict={false} />
                </div>
              </div>
              <div>
                <Label>Area / Locality</Label>
                <LocalityAutocompleteInput value={area} onChange={setArea} city={city} placeholder="Start typing to search your locality" theme="dark" />
              </div>
              <div>
                <Label>Address</Label>
                <textarea rows={2} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className={fieldClass('resize-none')} />
              </div>
            </div>
          ) : (
            <div>
              <FieldRow label="Full Name" value={profile.displayName} />
              <FieldRow label="Email Address" value={profile.email} />
              <FieldRow label="Phone Number" value={profile.phone} />
              <FieldRow label="Gender" value={GENDER_OPTIONS.find((g) => g.value === profile.gender)?.label} />
              <FieldRow label="Age" value={formatAge(profile.dob)} />
              <FieldRow label="State" value={profile.state} />
              <FieldRow label="City" value={profile.city} />
              <FieldRow label="Area / Locality" value={profile.area} />
              <FieldRow label="Address" value={profile.addressLine} />
            </div>
          )}
        </InfoCard>

        {isCoach && coachProfile && (
          <InfoCard icon={Briefcase} title="Professional Information">
            {editing ? (
              <div className="space-y-3">
                <CategoryPicker categories={categories} value={categorySelection} onChange={setCategorySelection} theme={themeMode} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Experience (years)</Label>
                    <input type="number" min={0} value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} className={fieldClass()} />
                  </div>
                  <div>
                    <Label>Qualification</Label>
                    <input value={qualification} onChange={(e) => setQualification(e.target.value)} className={fieldClass()} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Service Types</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {SERVICE_TYPE_OPTIONS.map((s) => (
                        <Chip key={s.value} theme="dark" clickable selected={serviceTypes.includes(s.value)} onClick={() => toggleInList(serviceTypes, s.value, setServiceTypes)}>
                          {s.label}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Class Types</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {CLASS_TYPE_OPTIONS.map((c) => (
                        <Chip key={c.value} theme="dark" clickable selected={classTypes.includes(c.value)} onClick={() => toggleInList(classTypes, c.value, setClassTypes)}>
                          {c.label}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Languages Known</Label>
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {languagesKnown.map((lang) => (
                      <Chip key={lang} theme="dark" selected removable onRemove={() => setLanguagesKnown((prev) => prev.filter((l) => l !== lang))}>
                        {lang}
                      </Chip>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={langInput}
                      onChange={(e) => setLangInput(e.target.value)}
                      onKeyDown={addLanguage}
                      placeholder="Type language and press Enter"
                      className={fieldClass('flex-1')}
                    />
                    <button
                      type="button"
                      style={{ minHeight: 0 }}
                      onClick={() => {
                        const val = langInput.trim();
                        if (val && !languagesKnown.includes(val)) setLanguagesKnown((prev) => [...prev, val]);
                        setLangInput('');
                      }}
                      className="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/20"
                    >
                      Add
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {LANGUAGE_SUGGESTIONS.filter((l) => !languagesKnown.includes(l)).map((l) => (
                      <Chip key={l} theme="dark" clickable onClick={() => setLanguagesKnown((prev) => [...prev, l])}>
                        + {l}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <FieldRow label="Category" value={viewCategory?.name} />
                <FieldRow
                  label="Specialty"
                  value={
                    viewSpecialties.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {viewSpecialties.map((s) => (
                          <ReadOnlyTag key={s.id}>
                            {s.name}
                            {s.id === coachProfile.primarySubcategoryId && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />}
                          </ReadOnlyTag>
                        ))}
                      </div>
                    )
                  }
                />
                <FieldRow label="Experience" value={coachProfile.experienceYears != null ? `${coachProfile.experienceYears} Years` : null} />
                <FieldRow label="Qualification" value={coachProfile.qualification} />
                <FieldRow
                  label="Service Types"
                  value={
                    coachProfile.serviceTypes.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {coachProfile.serviceTypes.map((v) => (
                          <ReadOnlyTag key={v}>{SERVICE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v}</ReadOnlyTag>
                        ))}
                      </div>
                    )
                  }
                />
                <FieldRow
                  label="Class Types"
                  value={
                    coachProfile.classTypes.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {coachProfile.classTypes.map((v) => (
                          <ReadOnlyTag key={v}>{CLASS_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v}</ReadOnlyTag>
                        ))}
                      </div>
                    )
                  }
                />
                <FieldRow
                  label="Age Groups"
                  value={
                    coachProfile.ageGroups.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {coachProfile.ageGroups.map((v) => (
                          <ReadOnlyTag key={v}>{v}</ReadOnlyTag>
                        ))}
                      </div>
                    )
                  }
                />
                <FieldRow
                  label="Skill Levels"
                  value={
                    coachProfile.skillLevels.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {coachProfile.skillLevels.map((v) => (
                          <ReadOnlyTag key={v}>{v}</ReadOnlyTag>
                        ))}
                      </div>
                    )
                  }
                />
                <FieldRow
                  label="Languages Known"
                  value={
                    coachProfile.languagesKnown.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {coachProfile.languagesKnown.map((v) => (
                          <ReadOnlyTag key={v}>{v}</ReadOnlyTag>
                        ))}
                      </div>
                    )
                  }
                />
              </div>
            )}
          </InfoCard>
        )}

        <InfoCard icon={ShieldCheck} title="Account & Security">
          <div>
            <FieldRow label="Login Email" value={profile.email} />
            <FieldRow
              label="Sign-in Methods"
              value={
                authMethods.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1">
                    {authMethods.map((m) => (
                      <span key={m.id} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
                        <Mail className="h-3 w-3 text-slate-500" />
                        {m.provider === 'email_otp' ? 'Email link' : m.provider === 'google' ? 'Google' : m.provider}
                      </span>
                    ))}
                  </div>
                )
              }
            />
            <FieldRow label="Last Active" value={mostRecentSession ? `${formatDate(mostRecentSession.lastSeenAt)} · ${mostRecentSession.platform ?? mostRecentSession.deviceLabel ?? 'web'}` : null} />
          </div>
          <p className="mt-3 text-[11px] text-slate-600">Sign-in uses Google or a one-time email link — there&apos;s no password to manage.</p>
        </InfoCard>

        {isCoach && (
          <InfoCard icon={FileText} title="Documents">
            <ul className="space-y-1.5">
              {DOC_TYPE_OPTIONS.map((doc) => {
                const existing = documents.find((d) => d.docType === doc.value);
                const uploading = docUploading[doc.value] ?? false;
                return (
                  <li key={doc.value} className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-slate-200">{doc.label}</p>
                      {existing && <p className="text-[10px] text-emerald-400">Uploaded · {existing.reviewStatus}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {existing && !editing && (
                        <a
                          href={`/api/v1/me/staff/documents/${existing.id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-400 hover:bg-indigo-500/20"
                        >
                          <ExternalLink className="h-2.5 w-2.5" /> View
                        </a>
                      )}
                      {editing ? (
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-400 hover:bg-indigo-500/20">
                          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          {uploading ? 'Uploading…' : existing ? 'Replace' : 'Upload'}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            disabled={uploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (file) handleDocumentFile(doc.value, file);
                            }}
                            className="hidden"
                          />
                        </label>
                      ) : (
                        !existing && <span className="text-[10px] text-slate-600">Not uploaded</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </InfoCard>
        )}

        <InfoCard
          icon={Bell}
          title="Notification Preferences"
          action={
            <a href="/me/notifications" className="text-[11px] font-medium text-indigo-400 hover:underline">
              Manage all
            </a>
          }
        >
          {NOTIFICATION_KINDS.map(({ kind, label }) => (
            <div key={kind} className="mb-2 last:mb-0">
              <p className="mb-1.5 text-xs text-slate-400">{label}</p>
              <div className="flex flex-wrap gap-4">
                {NOTIFICATION_CHANNELS.map(({ channel, label: chLabel }) => {
                  const enabled = notifPrefs.find((p) => p.channel === channel && p.kind === kind)?.enabled ?? true;
                  return (
                    <div key={channel} className="flex items-center gap-2">
                      <ToggleSwitch checked={enabled} onChange={() => toggleNotification(channel, kind)} />
                      <span className="flex items-center gap-1 text-xs text-slate-300">
                        {enabled ? <Bell className="h-3 w-3 text-slate-500" /> : <BellOff className="h-3 w-3 text-slate-600" />}
                        {chLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </InfoCard>
      </div>

      {isCoach && coachProfile && (
        <InfoCard icon={IndianRupee} title="Payment & Pricing">
          {editing ? (
            <PaymentPricingStep value={paymentPricing} onChange={setPaymentPricing} theme="dark" />
          ) : !hasSavedPricing || enabledPolicies.length === 0 ? (
            <p className="text-xs text-slate-500">No pricing plans set up yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {enabledPolicies.map((p) => (
                <span
                  key={p.policyType}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${
                    p.isDefault ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' : 'border-white/10 bg-white/[0.02] text-slate-300'
                  }`}
                >
                  {p.policyType.replace(/_/g, ' ')}
                  {p.rules[0]?.amount != null && p.rules[0].amount > 0 ? ` · ₹${p.rules[0].amount}` : ''}
                  {p.isDefault ? ' · Default' : ''}
                </span>
              ))}
            </div>
          )}
        </InfoCard>
      )}

      {isCoach && (
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200"
          >
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Advanced setup — categories, service areas &amp; specialties
          </button>
          {showAdvanced && (
            <div className="mt-3">
              <CoachProfileWizard mode="self" onCancel={() => setShowAdvanced(false)} onDone={() => window.location.reload()} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
