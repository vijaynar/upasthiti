'use client';

// Self-service referrals (BR4/US-8) — available to any signed-in user, not
// org-scoped (Doc 04 §4: "any user" refers, no permission gate), same
// standalone-settings-page shape as /me/notifications. Reward approval is a
// platform-staff action (packages/modules/marketplace/src/service.ts's
// approveReferralReward) — no UI here, same "service+routes real, UI
// deferred" precedent every prior phase's platform-only actions have used.

import { useEffect, useState } from 'react';
import { Gift, Copy, Check } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

type ReferralStatus = 'created' | 'attributed' | 'rewarding' | 'completed' | 'rejected';

interface Referral {
  id: string;
  code: string;
  referredOrgId: string | null;
  rewardAmountMinor: number | null;
  status: ReferralStatus;
  createdAt: string;
}

const STATUS_COLORS: Record<ReferralStatus, string> = {
  created: 'bg-white/10 text-slate-300 border border-white/10',
  attributed: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  rewarding: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  completed: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-300 border border-red-500/30',
};

export default function MyReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api<Referral[]>('/api/v1/me/referrals').then(setReferrals).catch((err) => setError(err.message));
  }

  useEffect(reload, []);

  async function createCode() {
    setError(null);
    try {
      await api('/api/v1/me/referrals', { method: 'POST' });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  function copyLink(code: string) {
    const link = `${window.location.origin}/explore?ref=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader badge="Referrals" badgeIcon={Gift} title="Referrals" description="Refer a coach or academy — earn a reward when they sign up." />

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

        <section className="glass-panel rounded-xl p-4">
          <button onClick={createCode} className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold">
            Generate a referral code
          </button>

          <div className="mt-4 space-y-2">
            {referrals.length === 0 && <p className="text-sm text-slate-400">No referral codes yet.</p>}
            {referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm">
                <div>
                  <p className="font-mono font-medium text-indigo-300">{r.code}</p>
                  {r.rewardAmountMinor !== null && (
                    <p className="text-xs text-slate-400">Reward: ₹{(r.rewardAmountMinor / 100).toLocaleString('en-IN')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                  <button onClick={() => copyLink(r.code)} className="btn-secondary rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/10">
                    {copied === r.code ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
