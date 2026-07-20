'use client';

// Org provisioning (Doc 02 §9) — the 4 flows a freshly-authenticated
// identity (zero roles, zero orgs) can take. Each flow ends by making the
// resulting org the active workspace and sending the user to /workspace.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Mail, Search, UserRound, AlertCircle, CheckCircle2 } from 'lucide-react';

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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function activateWorkspace(router: ReturnType<typeof useRouter>, organizationId: string) {
  await fetch('/api/v1/me/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId: organizationId }),
  });
  router.push('/workspace');
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function CreateOrgForm({ orgType, fixedType, title }: { orgType: string; fixedType: boolean; title: string }) {
  const router = useRouter();
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
      await activateWorkspace(router, body.data.organizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      {error && <ErrorBanner message={error} />}

      {!fixedType && (
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
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
        <label className="mb-1 block text-sm font-medium text-neutral-700">Name</label>
        <input
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="Elite Sports Academy"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">URL</label>
        <div className="flex items-center rounded-lg border border-neutral-300 px-3 py-2 text-sm focus-within:border-neutral-500">
          <span className="text-neutral-400">abhyas.app/</span>
          <input
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            className="flex-1 border-0 p-0 outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
      >
        {loading ? 'Creating…' : 'Create workspace'}
      </button>
    </form>
  );
}

function AcceptInviteForm() {
  const router = useRouter();
  const [token, setToken] = useState('');
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
      await activateWorkspace(router, body.data.organizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900">Accept an invitation</h2>
      {error && <ErrorBanner message={error} />}
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Invitation code</label>
        <input
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste the code from your invite"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
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
      <div className="flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Your request to join {resolved?.name} has been sent — you&apos;ll get access once it&apos;s approved.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900">Find your organization</h2>
      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="organization URL or code"
            className="w-full rounded-lg border border-neutral-300 py-2.5 pl-9 pr-3 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {resolved && (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-4">
          <p className="text-sm text-neutral-700">
            Found <span className="font-medium">{resolved.name}</span> ({resolved.orgType.replace('_', ' ')})
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">I am a</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            >
              <option value="student">Student</option>
              <option value="coach">Coach</option>
              <option value="assistant_coach">Assistant coach</option>
            </select>
          </div>
          <button
            onClick={handleRequest}
            disabled={loading}
            className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Request to join'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  const [intent, setIntent] = useState<Intent>('choose');

  if (intent === 'coach') {
    return (
      <Shell onBack={() => setIntent('choose')}>
        <CreateOrgForm orgType="independent_coach" fixedType title="Set up your coaching workspace" />
      </Shell>
    );
  }
  if (intent === 'academy') {
    return (
      <Shell onBack={() => setIntent('choose')}>
        <CreateOrgForm orgType="academy" fixedType={false} title="Set up your organization" />
      </Shell>
    );
  }
  if (intent === 'invite') {
    return (
      <Shell onBack={() => setIntent('choose')}>
        <AcceptInviteForm />
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
        <h1 className="text-xl font-semibold text-neutral-900">You&apos;re signed in.</h1>
        <p className="mt-1 text-sm text-neutral-500">What brings you to Abhyas?</p>
      </div>
      <div className="mt-6 space-y-3">
        <IntentButton icon={UserRound} label="I'm a coach" hint="Set up your own coaching workspace" onClick={() => setIntent('coach')} />
        <IntentButton icon={Building2} label="I run an academy" hint="Academy, school, studio, or similar" onClick={() => setIntent('academy')} />
        <IntentButton icon={Mail} label="I have an invite" hint="Join a workspace you were invited to" onClick={() => setIntent('invite')} />
        <IntentButton icon={Search} label="I'm a parent or student" hint="Find and request to join an organization" onClick={() => setIntent('join')} />
      </div>
    </Shell>
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
      className="flex w-full items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-300 hover:bg-neutral-50"
    >
      <Icon className="h-5 w-5 shrink-0 text-neutral-500" />
      <span>
        <span className="block text-sm font-medium text-neutral-900">{label}</span>
        <span className="block text-xs text-neutral-500">{hint}</span>
      </span>
    </button>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        {onBack && (
          <button onClick={onBack} className="text-xs text-neutral-400 hover:text-neutral-600">
            ← Back
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
