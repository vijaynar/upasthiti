'use client';

// Self-service referrals (BR4/US-8) — available to any signed-in user, not
// org-scoped (Doc 04 §4: "any user" refers, no permission gate), same
// standalone-settings-page shape as /me/notifications. Reward approval is a
// platform-staff action (packages/modules/marketplace/src/service.ts's
// approveReferralReward) — no UI here, same "service+routes real, UI
// deferred" precedent every prior phase's platform-only actions have used.

import { useEffect, useState } from 'react';
import { Gift, Copy, Check } from 'lucide-react';

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
  created: 'bg-neutral-200 text-neutral-700',
  attributed: 'bg-blue-100 text-blue-700',
  rewarding: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
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
        <div>
          <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold text-neutral-900">
            <Gift className="h-5 w-5 text-neutral-500" /> Referrals
          </h1>
          <p className="text-sm text-neutral-500">Refer a coach or academy — earn a reward when they sign up.</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <button onClick={createCode} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800">
            Generate a referral code
          </button>

          <div className="mt-4 space-y-2">
            {referrals.length === 0 && <p className="text-sm text-neutral-400">No referral codes yet.</p>}
            {referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 p-2.5 text-sm">
                <div>
                  <p className="font-mono font-medium text-neutral-900">{r.code}</p>
                  {r.rewardAmountMinor !== null && (
                    <p className="text-xs text-neutral-500">Reward: ₹{(r.rewardAmountMinor / 100).toLocaleString('en-IN')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                  <button onClick={() => copyLink(r.code)} className="rounded-lg border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-50">
                    {copied === r.code ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
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
