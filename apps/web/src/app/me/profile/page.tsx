'use client';

// My Profile — one self-service page every role lands on (Doc 05 §5/§7):
// identity fields + linked sign-in methods, always; a coach professional
// profile section on top when the caller holds a coach/assistant_coach
// role in their active org (same wizard the onboarding paths use, Doc 04
// §8 unification), so "complete/edit your coach profile" isn't a separate
// surface from "onboard as a coach" — it's the same form, reopened.

import { useEffect, useState } from 'react';
import { UserRound, Mail, ShieldCheck, Briefcase } from 'lucide-react';
import CoachProfileWizard from '@/components/CoachProfileWizard';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

const COACH_ROLE_KEYS = ['coach', 'assistant_coach'];

interface Profile {
  id: string;
  displayName: string;
  dob: string | null;
  locale: string;
  timezone: string;
  avatarPath: string | null;
}

interface AuthMethod {
  id: string;
  provider: string;
  verifiedAt: string | null;
  lastUsedAt: string | null;
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>;
}

function IdentityCard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [dob, setDob] = useState('');
  const [locale, setLocale] = useState('en');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Profile>('/api/v1/me').then((p) => {
      setProfile(p);
      setDisplayName(p.displayName);
      setDob(p.dob ?? '');
      setLocale(p.locale);
      setTimezone(p.timezone);
    }).catch((err) => setError(err.message));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api('/api/v1/me', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: displayName.trim(), dob: dob || null, locale, timezone }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 flex items-center gap-2">
        <UserRound className="h-4 w-4 text-indigo-400" />
        <h2 className="text-sm font-semibold text-white">Identity</h2>
      </div>
      <ErrorBanner error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Date of birth</label>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Language</label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="te">Telugu</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Timezone</label>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>
      </div>
      <button
        disabled={saving}
        onClick={save}
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
      </button>
    </div>
  );
}

function AuthMethodsCard() {
  const [methods, setMethods] = useState<AuthMethod[] | null>(null);

  useEffect(() => {
    api<AuthMethod[]>('/api/v1/me/auth-methods').then(setMethods).catch(() => {});
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-indigo-400" />
        <h2 className="text-sm font-semibold text-white">Sign-in methods</h2>
      </div>
      {methods === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : methods.length === 0 ? (
        <p className="text-sm text-slate-400">None linked.</p>
      ) : (
        <ul className="space-y-2">
          {methods.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-slate-200">
                <Mail className="h-3.5 w-3.5 text-slate-500" />
                {m.provider === 'email_otp' ? 'Email (magic link)' : m.provider === 'google' ? 'Google' : m.provider}
              </span>
              <span className="text-xs text-slate-500">{m.verifiedAt ? 'verified' : 'unverified'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CoachProfileCard() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-indigo-400" />
        <h2 className="text-sm font-semibold text-white">Coach profile</h2>
      </div>
      <CoachProfileWizard mode="self" onCancel={() => {}} onDone={() => {}} />
      <p className="mt-2 text-xs text-slate-500">
        Documents, availability, and leave settings live under{' '}
        <a href="/me/staff" className="text-indigo-400 hover:underline">
          My HR
        </a>
        .
      </p>
    </div>
  );
}

export default function MyProfilePage() {
  const [isCoach, setIsCoach] = useState(false);

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace')
      .then(async (w) => {
        if (!w.activeOrgId) return;
        const res = await fetch(`/api/v1/orgs/${w.activeOrgId}/me/roles`);
        const body = await res.json();
        const roleKeys: string[] = body?.data?.roleKeys ?? [];
        setIsCoach(roleKeys.some((k) => COACH_ROLE_KEYS.includes(k)));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-lg font-semibold text-white">My Profile</h1>
        <p className="mt-1 text-sm text-slate-400">Your identity and account settings, shared across every organization.</p>
      </div>
      <IdentityCard />
      <AuthMethodsCard />
      {isCoach && <CoachProfileCard />}
    </div>
  );
}
