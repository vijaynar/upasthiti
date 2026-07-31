'use client';

// Org provisioning (Doc 02 §9) — the 4 flows a freshly-authenticated
// identity (zero roles, zero orgs) can take. Each flow ends by making the
// resulting org the active workspace and sending the user to /workspace —
// except when the caller ends up holding a `coach`/`assistant_coach` role
// in that org (independent-coach self-serve, or accepting a coach invite),
// in which case it detours through CoachProfileWizard first (Doc 04 §8
// unification: same professional-profile step every coach path shares).

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Mail, Search, UserRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import CoachProfileWizard from '@/components/CoachProfileWizard';
import AcademyOnboardingWizard from '@/components/AcademyOnboardingWizard';
import { useAcademyOperationEnabled } from '@/lib/useFeatureFlags';

type Intent = 'choose' | 'coach' | 'academy' | 'invite' | 'join';

const ACADEMY_TYPES: { value: string; label: string }[] = [
  { value: 'academy', label: 'Academy' },
  { value: 'school', label: 'School' },
  { value: 'music', label: 'Music' },
  { value: 'dance', label: 'Dance' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'tuition', label: 'Tuition' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'other', label: 'Other' },
];

const COACH_ROLE_KEYS = ['coach', 'assistant_coach'];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function activateWorkspace(organizationId: string): Promise<void> {
  await fetch('/api/v1/me/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId: organizationId }),
  });
}

async function hasCoachRole(organizationId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/v1/orgs/${organizationId}/me/roles`);
    const body = await res.json();
    const roleKeys: string[] = body?.data?.roleKeys ?? [];
    return roleKeys.some((k) => COACH_ROLE_KEYS.includes(k));
  } catch {
    return false;
  }
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function CreateOrgForm({
  orgType,
  fixedType,
  title,
  onCreated,
}: {
  orgType: string;
  fixedType: boolean;
  title: string;
  onCreated: (organizationId: string) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState(orgType);
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/v1/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgType: fixedType ? orgType : type, name, slug }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not create the organization.');
      onCreated(body.data.organizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {error && <ErrorBanner message={error} />}

      {!fixedType && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-400">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="glass-input w-full rounded-lg px-3 py-2 text-sm"
          >
            {ACADEMY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-400">Name</label>
        <input
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="Elite Sports Academy"
          className="glass-input w-full rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-400">URL</label>
        <div className="glass-input flex items-center rounded-lg px-3 py-2 text-sm">
          <span className="text-slate-400">abhyas.app/</span>
          <input
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            className="flex-1 bg-transparent border-0 p-0 text-slate-100 outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn-premium w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {loading ? 'Creating…' : 'Create workspace'}
      </button>
    </form>
  );
}

function AcceptInviteForm({ onAccepted }: { onAccepted: (organizationId: string) => void }) {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/v1/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not accept the invitation.');
      onAccepted(body.data.organizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Accept an invitation</h2>
      {error && <ErrorBanner message={error} />}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-400">Invitation code</label>
        <input
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste the code from your invite"
          className="glass-input w-full rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="btn-premium w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {loading ? 'Joining…' : 'Join workspace'}
      </button>
    </form>
  );
}

function JoinRequestForm() {
  const [slug, setSlug] = useState('');
  const [resolved, setResolved] = useState<{ id: string; name: string; orgType: string } | null>(null);
  const [role, setRole] = useState<'student' | 'coach' | 'assistant_coach'>('student');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResolved(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/orgs/resolve?slug=${encodeURIComponent(slugify(slug))}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'No organization found with that URL.');
      setResolved(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRequest() {
    if (!resolved) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/orgs/${resolved.id}/join-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedRole: role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not send the join request.');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Your request to join {resolved?.name} has been sent — you&apos;ll get access once it&apos;s approved.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Find your organization</h2>
      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="organization URL or code"
            className="glass-input w-full rounded-lg py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-secondary rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {resolved && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-slate-200">
            Found <span className="font-semibold text-white">{resolved.name}</span> ({resolved.orgType.replace('_', ' ')})
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-400">I am a</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="glass-input w-full rounded-lg px-3 py-2 text-sm"
            >
              <option value="student">Student</option>
              <option value="coach">Coach</option>
              <option value="assistant_coach">Assistant coach</option>
            </select>
          </div>
          <button
            onClick={handleRequest}
            disabled={loading}
            className="btn-premium w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Request to join'}
          </button>
        </div>
      )}
    </div>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const academyEnabled = useAcademyOperationEnabled();
  const initialIntent = (searchParams.get('intent') as Intent) || (searchParams.get('token') ? 'invite' : 'choose');
  const [intent, setIntent] = useState<Intent>(initialIntent);
  const [coachWizardOrgId, setCoachWizardOrgId] = useState<string | null>(null);
  const [academyWizardOrgId, setAcademyWizardOrgId] = useState<string | null>(null);

  function finish() {
    router.push('/workspace');
  }

  async function afterOrgReady(organizationId: string, checkRole: boolean) {
    await activateWorkspace(organizationId);
    if (checkRole && (await hasCoachRole(organizationId))) {
      setCoachWizardOrgId(organizationId);
    } else if (academyEnabled) {
      setAcademyWizardOrgId(organizationId);
    } else {
      finish();
    }
  }

  if (coachWizardOrgId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <CoachProfileWizard mode="self" onCancel={finish} onDone={finish} />
      </div>
    );
  }

  if (intent === 'coach') {
    return (
      <Shell onBack={() => setIntent('choose')}>
        <CreateOrgForm
          orgType="independent_coach"
          fixedType
          title="Set up your coaching workspace"
          onCreated={(orgId) => afterOrgReady(orgId, true)}
        />
      </Shell>
    );
  }

  if (academyEnabled && (intent === 'academy' || academyWizardOrgId)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <AcademyOnboardingWizard
          organizationId={academyWizardOrgId ?? undefined}
          onCancel={() => {
            setAcademyWizardOrgId(null);
            setIntent('choose');
          }}
          onDone={finish}
        />
      </div>
    );
  }
  if (intent === 'invite') {
    return (
      <Shell onBack={() => setIntent('choose')}>
        <AcceptInviteForm onAccepted={(orgId) => afterOrgReady(orgId, true)} />
      </Shell>
    );
  }
  if (intent === 'join') {
    return (
      <Shell onBack={() => setIntent('choose')}>
        <JoinRequestForm />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-white">You&apos;re signed in.</h1>
        <p className="mt-1 text-sm text-slate-400">What brings you to Abhyas?</p>
      </div>
      <div className="mt-6 space-y-3">
        <IntentButton icon={UserRound} label="I'm a coach" hint="Set up your own coaching workspace" onClick={() => setIntent('coach')} />
        {academyEnabled && (
          <IntentButton icon={Building2} label="I run an academy" hint="Academy, school, studio, or similar" onClick={() => setIntent('academy')} />
        )}
        <IntentButton icon={Mail} label="I have an invite" hint="Join a workspace you were invited to" onClick={() => setIntent('invite')} />
        <IntentButton icon={Search} label="I'm a parent or student" hint="Find and request to join an organization" onClick={() => setIntent('join')} />
      </div>
    </Shell>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  );
}

function IntentButton({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof UserRound;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/20 hover:bg-white/10"
    >
      <Icon className="h-5 w-5 shrink-0 text-indigo-400" />
      <span>
        <span className="block text-sm font-medium text-slate-100">{label}</span>
        <span className="block text-xs text-slate-400">{hint}</span>
      </span>
    </button>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="glass-panel w-full max-w-sm space-y-4 rounded-xl p-8">
        {onBack && (
          <button onClick={onBack} className="text-xs text-slate-400 hover:text-white">
            ← Back
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
