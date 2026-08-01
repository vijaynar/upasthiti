'use client';

// People console (Doc 07 §6, Doc 04 §5 "Students & profiles" row) — org
// staff view of enrollments in the active workspace. Scoped to what Phase 6
// actually built: enroll/list/update enrollments. No member/role admin UI
// here — that's Phase 3/4's existing "no admin UI yet" gap, unrelated to
// enrollment and not this phase's job to fill.

import { useEffect, useState } from 'react';
import { GraduationCap, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface Branch {
  id: string;
  name: string;
  status: string;
}

interface Enrollment {
  id: string;
  organizationId: string;
  branchId: string;
  studentUserId: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  rollNumber: string | null;
  startedOn: string;
  endedOn: string | null;
}

const STATUSES: Enrollment['status'][] = ['active', 'paused', 'completed', 'cancelled'];

export default function PeoplePage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [studentUserId, setStudentUserId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace').then((w) => setOrgId(w.activeOrgId));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    api<Branch[]>(`/api/v1/orgs/${orgId}/branches`)
      .then((bs) => {
        setBranches(bs);
        setBranchId((prev) => prev || bs.find((b) => b.name === 'Main')?.id || bs[0]?.id || '');
      })
      .catch((err) => setError(err.message));
    load();
  }, [orgId]);

  function load() {
    if (!orgId) return;
    api<Enrollment[]>(`/api/v1/orgs/${orgId}/enrollments`)
      .then(setEnrollments)
      .catch((err) => setError(err.message));
  }

  async function enroll() {
    if (!orgId || !studentUserId.trim() || !branchId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/enrollments`, {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          studentUserId: studentUserId.trim(),
          rollNumber: rollNumber.trim() || undefined,
          startedOn: new Date().toISOString().slice(0, 10),
        }),
      });
      setStudentUserId('');
      setRollNumber('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(enrollmentId: string, status: Enrollment['status']) {
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/enrollments/${enrollmentId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  if (orgId === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (orgId === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="glass-panel max-w-sm space-y-2 rounded-xl p-8 text-center">
          <GraduationCap className="mx-auto h-8 w-8 text-indigo-400" />
          <h1 className="text-lg font-semibold text-white">Students</h1>
          <p className="text-sm text-slate-400">Pick an active workspace first — this page shows the roster for whichever org you&apos;re working in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-3xl">
        <PageHeader badge="Team & Members" badgeIcon={GraduationCap} title="Students" description="Enrollments for the active workspace." />

        {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

        <div className="glass-panel mb-5 flex flex-wrap items-end gap-2 rounded-xl p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Student user ID</label>
            <input
              value={studentUserId}
              onChange={(e) => setStudentUserId(e.target.value)}
              placeholder="uuid of an existing identity"
              className="glass-input w-64 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Branch</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="glass-input rounded-lg px-3 py-1.5 text-sm"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Roll number</label>
            <input
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              className="glass-input w-32 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <button
            disabled={busy || !studentUserId.trim() || !branchId}
            onClick={enroll}
            className="btn-premium flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" /> Enroll
          </button>
        </div>

        {enrollments === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : enrollments.length === 0 ? (
          <p className="text-sm text-slate-400">No enrollments yet.</p>
        ) : (
          <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
            {enrollments.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-medium text-slate-100">student {e.studentUserId}</p>
                  <p className="text-xs text-slate-400">
                    {e.rollNumber ? `roll ${e.rollNumber} · ` : ''}
                    since {new Date(e.startedOn).toLocaleDateString()}
                  </p>
                </div>
                <select
                  value={e.status}
                  onChange={(ev) => setStatus(e.id, ev.target.value as Enrollment['status'])}
                  className={`rounded-full px-3 py-1 text-xs font-medium outline-none transition ${
                    e.status === 'active' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-400 border border-white/10'
                  }`}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
