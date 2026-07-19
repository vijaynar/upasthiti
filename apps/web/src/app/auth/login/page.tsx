'use client';

// V2 rebuild (Doc 05 §2): Google OAuth + email magic link only. The client
// never talks to Supabase directly (Doc 08 §2 rule 2) — Google sign-in is a
// plain link to our own redirect route, and magic link goes through our API.

import { useState } from 'react';
import { Mail, CheckCircle2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/magic-link/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not send the sign-in link.');
      setMagicSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-neutral-900">Sign in to Abhyas</h1>
          <p className="mt-1 text-sm text-neutral-500">One identity across every organization.</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {magicSent ? (
          <div className="flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Check {email} for a sign-in link.</span>
          </div>
        ) : (
          <>
            <a
              href="/api/v1/auth/oauth/google/start"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Continue with Google
            </a>

            <div className="flex items-center gap-3 text-xs text-neutral-400">
              <div className="h-px flex-1 bg-neutral-200" />
              or
              <div className="h-px flex-1 bg-neutral-200" />
            </div>

            <form onSubmit={handleMagicLink} className="space-y-3">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-neutral-300 py-2.5 pl-9 pr-3 text-sm focus:border-neutral-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
