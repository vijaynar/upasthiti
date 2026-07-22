'use client';

// Coach professional-profile wizard (Doc 04 §8 unification) — the ONE
// onboarding workflow shared by all four coach paths: self-serve
// independent coach, invited coach completing their own profile, an org
// admin filling it out for an existing member, and a platform-invited
// coach. "mode" picks which endpoint (and RLS policy) the submit hits;
// the steps themselves are identical either way.
//
// Deliberately scoped to just the two fields nothing else in V2 captures
// (professional info + specialties) — documents/availability/leave/payout
// already have a full self-service surface at /me/staff ("My HR") and an
// admin surface at /staff, so this wizard doesn't duplicate them; it hands
// off there on completion instead.

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';

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

interface CoachProfileData {
  bio: string | null;
  experienceYears: number | null;
  qualification: string | null;
  languagesKnown: string[];
  sportKeys: string[];
  ageGroups: string[];
  skillLevels: string[];
  serviceTypes: string[];
  classTypes: string[];
}

const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Kannada', 'Telugu', 'Tamil', 'Malayalam', 'Marathi', 'Gujarati'];
const AGE_GROUP_OPTIONS = ['Kids', 'Teens', 'Adults', 'Seniors'];
const SKILL_LEVEL_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'];
const SERVICE_TYPE_OPTIONS = [
  { value: 'offline', label: 'Offline' },
  { value: 'online', label: 'Online' },
];
const CLASS_TYPE_OPTIONS = [
  { value: 'group', label: 'Group classes' },
  { value: 'one_to_one', label: 'One-to-one' },
];

const STEPS = ['About you', 'What you teach', 'Review & submit'] as const;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function ChipToggle({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        selected
          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200'
          : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>;
}

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
  const [step, setStep] = useState(1);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);

  const [bio, setBio] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [qualification, setQualification] = useState('');
  const [languagesKnown, setLanguagesKnown] = useState<string[]>(['English']);
  const [sportKeys, setSportKeys] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [skillLevels, setSkillLevels] = useState<string[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>(['offline']);
  const [classTypes, setClassTypes] = useState<string[]>(['group']);

  const getUrl = mode === 'admin' ? `/api/v1/orgs/${organizationId}/staff/${staffProfileId}/coach-profile` : '/api/v1/me/coach-profile';
  const submitUrl = mode === 'admin' ? `/api/v1/orgs/${organizationId}/staff/${staffProfileId}/coach-profile` : '/api/v1/me/onboard-coach';

  useEffect(() => {
    api<{ sports: Sport[] }>('/api/v1/public/taxonomy').then((t) => setSports(t.sports)).catch(() => {});
  }, []);

  useEffect(() => {
    api<CoachProfileData | null>(getUrl)
      .then((existing) => {
        if (!existing) return;
        setBio(existing.bio ?? '');
        setExperienceYears(existing.experienceYears !== null ? String(existing.experienceYears) : '');
        setQualification(existing.qualification ?? '');
        if (existing.languagesKnown.length) setLanguagesKnown(existing.languagesKnown);
        setSportKeys(existing.sportKeys);
        setAgeGroups(existing.ageGroups);
        setSkillLevels(existing.skillLevels);
        if (existing.serviceTypes.length) setServiceTypes(existing.serviceTypes);
        if (existing.classTypes.length) setClassTypes(existing.classTypes);
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
    // Only re-fetch if we're pointed at a different profile
  }, [getUrl]);

  const isStep1Valid = bio.trim() !== '' && qualification.trim() !== '' && experienceYears.trim() !== '' && Number(experienceYears) >= 0;
  const isStep2Valid = sportKeys.length > 0 && serviceTypes.length > 0 && classTypes.length > 0;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api(submitUrl, {
        method: mode === 'admin' ? 'PUT' : 'POST',
        body: JSON.stringify({
          bio: bio.trim(),
          experienceYears: Number(experienceYears),
          qualification: qualification.trim(),
          languagesKnown,
          sportKeys,
          ageGroups,
          skillLevels,
          serviceTypes,
          classTypes,
        }),
      });
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

  return (
    <div className="w-full max-w-xl space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div>
        <h2 className="text-lg font-semibold text-white">
          {mode === 'admin' ? `Coach profile — ${memberName ?? 'member'}` : 'Set up your coach profile'}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {STEPS[step - 1]} · Step {step} of {STEPS.length}
        </p>
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? 'bg-indigo-500' : 'bg-white/10'}`} />
          ))}
        </div>
      </div>

      <ErrorBanner error={error} />

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-400">Experience (years)</label>
            <input
              type="number"
              min={0}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
              placeholder="e.g. 5"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-400">Qualification</label>
            <input
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              placeholder="e.g. B.P.Ed, NIS Certified"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-400">Professional bio</label>
              <span className="text-xs text-slate-600">{bio.length}/500</span>
            </div>
            <textarea
              rows={3}
              maxLength={500}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Your teaching style, achievements, and what students can expect…"
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-400">Languages known</label>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGE_OPTIONS.map((lang) => (
                <ChipToggle key={lang} label={lang} selected={languagesKnown.includes(lang)} onClick={() => setLanguagesKnown((prev) => toggle(prev, lang))} />
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-400">Sports / specialties</label>
            <div className="flex flex-wrap gap-1.5">
              {sports.map((s) => (
                <ChipToggle key={s.key} label={s.label} selected={sportKeys.includes(s.key)} onClick={() => setSportKeys((prev) => toggle(prev, s.key))} />
              ))}
              {sports.length === 0 && <p className="text-xs text-slate-500">Loading sports…</p>}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-400">Age groups you teach</label>
            <div className="flex flex-wrap gap-1.5">
              {AGE_GROUP_OPTIONS.map((g) => (
                <ChipToggle key={g} label={g} selected={ageGroups.includes(g)} onClick={() => setAgeGroups((prev) => toggle(prev, g))} />
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-400">Skill levels</label>
            <div className="flex flex-wrap gap-1.5">
              {SKILL_LEVEL_OPTIONS.map((s) => (
                <ChipToggle key={s} label={s} selected={skillLevels.includes(s)} onClick={() => setSkillLevels((prev) => toggle(prev, s))} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-400">Service type</label>
              <div className="flex flex-wrap gap-1.5">
                {SERVICE_TYPE_OPTIONS.map((s) => (
                  <ChipToggle key={s.value} label={s.label} selected={serviceTypes.includes(s.value)} onClick={() => setServiceTypes((prev) => toggle(prev, s.value))} />
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-400">Class type</label>
              <div className="flex flex-wrap gap-1.5">
                {CLASS_TYPE_OPTIONS.map((c) => (
                  <ChipToggle key={c.value} label={c.label} selected={classTypes.includes(c.value)} onClick={() => setClassTypes((prev) => toggle(prev, c.value))} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Experience &amp; qualification</p>
            <p className="mt-1 text-slate-200">{experienceYears} yrs · {qualification}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Bio</p>
            <p className="mt-1 text-slate-300">{bio}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Teaches</p>
            <p className="mt-1 text-slate-200">
              {sports.filter((s) => sportKeys.includes(s.key)).map((s) => s.label).join(', ') || '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {serviceTypes.join(', ')} · {classTypes.map((c) => CLASS_TYPE_OPTIONS.find((o) => o.value === c)?.label ?? c).join(', ')}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            {mode === 'self'
              ? "You can add documents, availability, and leave settings afterward from My HR."
              : 'This creates or updates the coach profile for this member.'}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={step === 1 ? onCancel : () => setStep(step - 1)}
          className="flex items-center gap-1 rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {step === 1 ? 'Cancel' : 'Back'}
        </button>
        {step < STEPS.length ? (
          <button
            type="button"
            disabled={(step === 1 && !isStep1Valid) || (step === 2 && !isStep2Valid)}
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
