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
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="glass-panel w-full max-w-sm space-y-6 rounded-xl p-8">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Abhyas Logo" className="mx-auto mb-3 h-12 w-auto object-contain" />
          <h1 className="text-xl font-semibold text-white">Sign in to Abhyas</h1>
          <p className="mt-1 text-sm text-slate-400">One identity across every organization.</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {magicSent ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Check {email} for a sign-in link.</span>
          </div>
        ) : (
          <>
            <a
              href="/api/v1/auth/oauth/google/start"
              className="btn-secondary flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10"
            >
              Continue with Google
            </a>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-white/10" />
              or
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleMagicLink} className="space-y-3">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="glass-input w-full rounded-lg py-2.5 pl-9 pr-3 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-premium w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
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
