'use client';

// "Add / Invite Student" popup (Students page). Two ways to get a student
// onto the roster, as two tabs in one popup rather than two separate flows:
//   - "Add existing" — staff already knows the student's user ID or email
//     (an email is resolved to an existing account server-side).
//   - "Invite" — share the org code / join link so the student signs
//     themselves up (same mechanism the old inline InviteBanner exposed).
// Branch is hidden entirely when the org only has one branch, since there's
// nothing to choose.

import { useState } from 'react';
import { Check, Copy, Link2, Mail, UserPlus, X } from 'lucide-react';
import type { Branch } from './types';
import { api } from './types';

type ModalTab = 'existing' | 'invite';

export function AddStudentModal({
  orgId,
  orgSlug,
  branches,
  onClose,
  onEnrolled,
}: {
  orgId: string;
  orgSlug: string;
  branches: Branch[];
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [tab, setTab] = useState<ModalTab>('existing');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-md space-y-4 rounded-2xl border border-white/10 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-white">
            <UserPlus className="h-5 w-5 text-indigo-400" /> Add / Invite Student
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 text-xs font-semibold">
          <button
            onClick={() => setTab('existing')}
            className={`flex-1 rounded-lg py-1.5 transition ${tab === 'existing' ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Add Existing Account
          </button>
          <button
            onClick={() => setTab('invite')}
            className={`flex-1 rounded-lg py-1.5 transition ${tab === 'invite' ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Invite by Link
          </button>
        </div>

        {tab === 'existing' ? (
          <AddExistingForm orgId={orgId} branches={branches} onClose={onClose} onEnrolled={onEnrolled} />
        ) : (
          <InviteByLink orgSlug={orgSlug} />
        )}
      </div>
    </div>
  );
}

function AddExistingForm({
  orgId,
  branches,
  onClose,
  onEnrolled,
}: {
  orgId: string;
  branches: Branch[];
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const singleBranch = branches.length <= 1;
  const [identifier, setIdentifier] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [rollNumber, setRollNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveBranchId = singleBranch ? branches[0]?.id ?? '' : branchId;
  const canSubmit = identifier.trim().length > 0 && effectiveBranchId && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/enrollments`, {
        method: 'POST',
        body: JSON.stringify({
          branchId: effectiveBranchId,
          studentUserId: identifier.trim(),
          rollNumber: rollNumber.trim() || undefined,
          startedOn: new Date().toISOString().slice(0, 10),
        }),
      });
      onEnrolled();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">{error}</div>}

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-300">Student user ID or email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="uuid, or name@example.com"
              className="glass-input w-full rounded-xl py-2 pl-9 pr-3 text-sm text-white"
              autoFocus
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            An email must belong to an existing account — the student needs to have signed in at least once.
          </p>
        </div>

        {!singleBranch && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">Branch</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2 text-sm text-white"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-300">Roll number (optional)</label>
          <input
            value={rollNumber}
            onChange={(e) => setRollNumber(e.target.value)}
            className="glass-input w-full rounded-xl px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-white/5">
          Cancel
        </button>
        <button disabled={!canSubmit} onClick={submit} className="btn-premium rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50">
          {busy ? 'Adding…' : 'Add Student'}
        </button>
      </div>
    </div>
  );
}

function InviteByLink({ orgSlug }: { orgSlug: string }) {
  const [slugCopied, setSlugCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const joinUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/onboarding?intent=join&org=${encodeURIComponent(orgSlug)}`;

  function copySlug() {
    navigator.clipboard.writeText(orgSlug).catch(() => {});
    setSlugCopied(true);
    setTimeout(() => setSlugCopied(false), 2000);
  }
  function copyLink() {
    navigator.clipboard.writeText(joinUrl).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">Share the code or link — students use it on the onboarding page to find and request to join your organisation.</p>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Organisation code</p>
        <div className="flex items-center gap-1.5">
          <code className="flex-1 truncate select-all rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-mono text-indigo-200">{orgSlug}</code>
          <button
            onClick={copySlug}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 active:scale-95"
          >
            {slugCopied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy code
              </>
            )}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Direct join link</p>
        <div className="flex items-center gap-1.5">
          <span className="flex-1 truncate select-all rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">{joinUrl}</span>
          <button
            onClick={copyLink}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/20 active:scale-95"
          >
            {linkCopied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied
              </>
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5" /> Copy link
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
