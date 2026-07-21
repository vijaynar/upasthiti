'use client';

// Scheduling console (Doc 07 §7, Doc 04 §5 "Scheduling" row) — staff view for
// the active workspace: programs, batches (with their coach assignments and
// roster), class sessions, and holidays. Mirrors /people's plain-fetch client
// component style. No student/guardian schedule view here — that RLS is
// real (migration 0009) but the consuming page is deferred, same precedent
// as Phase 6's listWardEnrollments (service function shipped, route/UI
// later).

import { useEffect, useState } from 'react';
import { CalendarDays, Plus, Trash2, Users, X } from 'lucide-react';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

interface Branch {
  id: string;
  name: string;
}

interface Program {
  id: string;
  name: string;
  sportKey: string | null;
}

interface BatchSchedule {
  days: number[];
  startTime: string;
  endTime: string;
  startDate: string;
  endDate?: string | null;
}

interface Batch {
  id: string;
  branchId: string;
  programId: string | null;
  name: string;
  mode: 'in_person' | 'online' | 'hybrid';
  capacity: number | null;
  status: 'active' | 'archived';
  schedule: BatchSchedule;
}

interface CoachAssignment {
  membershipId: string;
  batchId: string;
  role: 'primary' | 'assistant';
}

interface BatchEnrollment {
  enrollmentId: string;
  batchId: string;
  status: 'active' | 'left';
}

interface ClassSession {
  id: string;
  batchId: string;
  sessionDate: string;
  startsAt: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'holiday';
}

interface Holiday {
  id: string;
  branchId: string | null;
  onDate: string;
  label: string;
}

interface Member {
  membershipId: string;
  userId: string;
  roleKeys: string[];
}

interface Enrollment {
  id: string;
  studentUserId: string;
  branchId: string;
  rollNumber: string | null;
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function statusBadgeClass(status: ClassSession['status']): string {
  switch (status) {
    case 'scheduled':
      return 'bg-neutral-900 text-white';
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'cancelled':
      return 'bg-red-100 text-red-700';
    case 'holiday':
      return 'bg-amber-100 text-amber-700';
  }
}

export default function SchedulingPage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [coachAssignments, setCoachAssignments] = useState<CoachAssignment[]>([]);
  const [roster, setRoster] = useState<BatchEnrollment[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);

  const [programName, setProgramName] = useState('');

  const [batchName, setBatchName] = useState('');
  const [batchBranchId, setBatchBranchId] = useState('');
  const [batchProgramId, setBatchProgramId] = useState('');
  const [batchDays, setBatchDays] = useState<number[]>([1, 3, 5]);
  const [batchStartTime, setBatchStartTime] = useState('16:00');
  const [batchEndTime, setBatchEndTime] = useState('17:00');
  const [batchStartDate, setBatchStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const [coachMembershipId, setCoachMembershipId] = useState('');
  const [rosterEnrollmentId, setRosterEnrollmentId] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayLabel, setHolidayLabel] = useState('');

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace').then((w) => setOrgId(w.activeOrgId));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    api<Branch[]>(`/api/v1/orgs/${orgId}/branches`)
      .then((bs) => {
        setBranches(bs);
        setBatchBranchId((prev) => prev || bs.find((b) => b.name === 'Main')?.id || bs[0]?.id || '');
      })
      .catch((err) => setError(err.message));
    api<Member[]>(`/api/v1/orgs/${orgId}/members`).then(setMembers).catch(() => {});
    api<Enrollment[]>(`/api/v1/orgs/${orgId}/enrollments`).then(setEnrollments).catch(() => {});
    loadPrograms();
    loadBatches();
    loadHolidays();
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !expandedBatchId) return;
    api<CoachAssignment[]>(`/api/v1/orgs/${orgId}/batches/${expandedBatchId}/coaches`).then(setCoachAssignments).catch((err) => setError(err.message));
    api<BatchEnrollment[]>(`/api/v1/orgs/${orgId}/batches/${expandedBatchId}/roster`).then(setRoster).catch((err) => setError(err.message));
    api<ClassSession[]>(`/api/v1/orgs/${orgId}/batches/${expandedBatchId}/sessions`).then(setSessions).catch((err) => setError(err.message));
  }, [orgId, expandedBatchId]);

  function loadPrograms() {
    if (!orgId) return;
    api<Program[]>(`/api/v1/orgs/${orgId}/programs`).then(setPrograms).catch((err) => setError(err.message));
  }

  function loadBatches() {
    if (!orgId) return;
    api<Batch[]>(`/api/v1/orgs/${orgId}/batches`).then(setBatches).catch((err) => setError(err.message));
  }

  function loadHolidays() {
    if (!orgId) return;
    api<Holiday[]>(`/api/v1/orgs/${orgId}/holidays`).then(setHolidays).catch((err) => setError(err.message));
  }

  function reloadBatchDetail(batchId: string) {
    if (!orgId) return;
    api<CoachAssignment[]>(`/api/v1/orgs/${orgId}/batches/${batchId}/coaches`).then(setCoachAssignments).catch((err) => setError(err.message));
    api<BatchEnrollment[]>(`/api/v1/orgs/${orgId}/batches/${batchId}/roster`).then(setRoster).catch((err) => setError(err.message));
    api<ClassSession[]>(`/api/v1/orgs/${orgId}/batches/${batchId}/sessions`).then(setSessions).catch((err) => setError(err.message));
  }

  async function addProgram() {
    if (!orgId || !programName.trim()) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/programs`, { method: 'POST', body: JSON.stringify({ name: programName.trim() }) });
      setProgramName('');
      loadPrograms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  function toggleDay(dow: number) {
    setBatchDays((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort()));
  }

  async function addBatch() {
    if (!orgId || !batchName.trim() || !batchBranchId || batchDays.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/batches`, {
        method: 'POST',
        body: JSON.stringify({
          branchId: batchBranchId,
          programId: batchProgramId || undefined,
          name: batchName.trim(),
          schedule: { days: batchDays, startTime: batchStartTime, endTime: batchEndTime, startDate: batchStartDate },
        }),
      });
      setBatchName('');
      loadBatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function assignCoach(batchId: string) {
    if (!orgId || !coachMembershipId) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/batches/${batchId}/coaches`, { method: 'POST', body: JSON.stringify({ membershipId: coachMembershipId }) });
      setCoachMembershipId('');
      reloadBatchDetail(batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function removeCoach(batchId: string, membershipId: string) {
    if (!orgId) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/batches/${batchId}/coaches/${membershipId}`, { method: 'DELETE' });
      reloadBatchDetail(batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function addToRoster(batchId: string) {
    if (!orgId || !rosterEnrollmentId) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/batches/${batchId}/roster`, { method: 'POST', body: JSON.stringify({ enrollmentId: rosterEnrollmentId }) });
      setRosterEnrollmentId('');
      reloadBatchDetail(batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function removeFromRoster(batchId: string, enrollmentId: string) {
    if (!orgId) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/batches/${batchId}/roster/${enrollmentId}`, { method: 'DELETE' });
      reloadBatchDetail(batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function cancelSession(batchId: string, sessionId: string) {
    if (!orgId) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/batches/${batchId}/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
      reloadBatchDetail(batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function addHoliday() {
    if (!orgId || !holidayDate || !holidayLabel.trim()) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/holidays`, { method: 'POST', body: JSON.stringify({ onDate: holidayDate, label: holidayLabel.trim() }) });
      setHolidayDate('');
      setHolidayLabel('');
      loadHolidays();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function removeHoliday(holidayId: string) {
    if (!orgId) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/holidays/${holidayId}`, { method: 'DELETE' });
      loadHolidays();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  if (orgId === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  if (orgId === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-sm space-y-2 rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <CalendarDays className="mx-auto h-8 w-8 text-neutral-300" />
          <h1 className="text-lg font-semibold text-neutral-900">Scheduling</h1>
          <p className="text-sm text-neutral-500">Pick an active workspace first — this page shows batches for whichever org you&apos;re working in.</p>
        </div>
      </div>
    );
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="mb-1 text-lg font-semibold text-neutral-900">Scheduling</h1>
          <p className="text-sm text-neutral-500">Programs, batches, coaches, roster, and holidays for the active workspace.</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Programs */}
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Programs</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {programs.map((p) => (
              <span key={p.id} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                {p.name}
              </span>
            ))}
            {programs.length === 0 && <span className="text-xs text-neutral-400">No programs yet.</span>}
          </div>
          <div className="flex gap-2">
            <input
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              placeholder="e.g. Swimming Level 1"
              className="w-64 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
            />
            <button
              onClick={addProgram}
              disabled={!programName.trim()}
              className="flex items-center gap-1 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add program
            </button>
          </div>
        </section>

        {/* Batches */}
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Batches</h2>

          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Name</label>
              <input
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                className="w-40 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Branch</label>
              <select
                value={batchBranchId}
                onChange={(e) => setBatchBranchId(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Program</label>
              <select
                value={batchProgramId}
                onChange={(e) => setBatchProgramId(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
              >
                <option value="">—</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Days</label>
              <div className="flex gap-1">
                {DOW_LABELS.map((label, idx) => {
                  const dow = idx + 1;
                  const active = batchDays.includes(dow);
                  return (
                    <button
                      key={dow}
                      onClick={() => toggleDay(dow)}
                      className={`rounded px-1.5 py-1 text-[10px] font-medium ${active ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Start</label>
              <input
                type="time"
                value={batchStartTime}
                onChange={(e) => setBatchStartTime(e.target.value)}
                className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">End</label>
              <input
                type="time"
                value={batchEndTime}
                onChange={(e) => setBatchEndTime(e.target.value)}
                className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">From</label>
              <input
                type="date"
                value={batchStartDate}
                onChange={(e) => setBatchStartDate(e.target.value)}
                className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
              />
            </div>
            <button
              disabled={busy || !batchName.trim() || !batchBranchId || batchDays.length === 0}
              onClick={addBatch}
              className="flex items-center gap-1 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Create batch
            </button>
          </div>

          {batches.length === 0 ? (
            <p className="text-sm text-neutral-500">No batches yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
              {batches.map((b) => (
                <li key={b.id} className="p-3">
                  <button
                    onClick={() => setExpandedBatchId((prev) => (prev === b.id ? null : b.id))}
                    className="flex w-full items-center justify-between gap-4 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{b.name}</p>
                      <p className="text-xs text-neutral-500">
                        {branchName(b.branchId)} · {b.schedule.days.map((d) => DOW_LABELS[d - 1]).join('/')} · {b.schedule.startTime}-{b.schedule.endTime}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${b.status === 'active' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                      {b.status}
                    </span>
                  </button>

                  {expandedBatchId === b.id && (
                    <div className="mt-3 grid gap-4 border-t border-neutral-100 pt-3 sm:grid-cols-3">
                      {/* Coaches */}
                      <div>
                        <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-neutral-700">
                          <Users className="h-3 w-3" /> Coaches
                        </p>
                        <ul className="mb-2 space-y-1">
                          {coachAssignments.map((ca) => (
                            <li key={ca.membershipId} className="flex items-center justify-between text-xs text-neutral-600">
                              <span>{members.find((m) => m.membershipId === ca.membershipId)?.userId ?? ca.membershipId}</span>
                              <button onClick={() => removeCoach(b.id, ca.membershipId)} className="text-neutral-400 hover:text-red-600">
                                <X className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                          {coachAssignments.length === 0 && <li className="text-xs text-neutral-400">None assigned.</li>}
                        </ul>
                        <div className="flex gap-1">
                          <select
                            value={coachMembershipId}
                            onChange={(e) => setCoachMembershipId(e.target.value)}
                            className="w-full rounded border border-neutral-300 px-1.5 py-1 text-[11px] outline-none"
                          >
                            <option value="">Pick member…</option>
                            {members.map((m) => (
                              <option key={m.membershipId} value={m.membershipId}>
                                {m.userId} ({m.roleKeys.join(',') || 'no role'})
                              </option>
                            ))}
                          </select>
                          <button onClick={() => assignCoach(b.id)} className="rounded bg-neutral-900 px-2 text-white">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Roster */}
                      <div>
                        <p className="mb-1 text-xs font-semibold text-neutral-700">Roster</p>
                        <ul className="mb-2 space-y-1">
                          {roster
                            .filter((r) => r.status === 'active')
                            .map((r) => (
                              <li key={r.enrollmentId} className="flex items-center justify-between text-xs text-neutral-600">
                                <span>{enrollments.find((e) => e.id === r.enrollmentId)?.rollNumber ?? r.enrollmentId}</span>
                                <button onClick={() => removeFromRoster(b.id, r.enrollmentId)} className="text-neutral-400 hover:text-red-600">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </li>
                            ))}
                          {roster.filter((r) => r.status === 'active').length === 0 && <li className="text-xs text-neutral-400">No students yet.</li>}
                        </ul>
                        <div className="flex gap-1">
                          <select
                            value={rosterEnrollmentId}
                            onChange={(e) => setRosterEnrollmentId(e.target.value)}
                            className="w-full rounded border border-neutral-300 px-1.5 py-1 text-[11px] outline-none"
                          >
                            <option value="">Pick student…</option>
                            {enrollments.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.rollNumber ?? e.studentUserId}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => addToRoster(b.id)} className="rounded bg-neutral-900 px-2 text-white">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Sessions */}
                      <div>
                        <p className="mb-1 text-xs font-semibold text-neutral-700">Upcoming sessions</p>
                        <ul className="max-h-40 space-y-1 overflow-y-auto">
                          {sessions.map((s) => (
                            <li key={s.id} className="flex items-center justify-between text-xs text-neutral-600">
                              <span>{new Date(s.startsAt).toLocaleString()}</span>
                              <div className="flex items-center gap-1">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusBadgeClass(s.status)}`}>{s.status}</span>
                                {s.status === 'scheduled' && (
                                  <button onClick={() => cancelSession(b.id, s.id)} className="text-neutral-400 hover:text-red-600">
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                          {sessions.length === 0 && <li className="text-xs text-neutral-400">No sessions materialized yet.</li>}
                        </ul>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Holidays */}
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Holidays</h2>
          <div className="mb-3 flex gap-2">
            <input
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
            />
            <input
              value={holidayLabel}
              onChange={(e) => setHolidayLabel(e.target.value)}
              placeholder="e.g. Republic Day"
              className="w-48 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
            />
            <button
              onClick={addHoliday}
              disabled={!holidayDate || !holidayLabel.trim()}
              className="flex items-center gap-1 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add holiday
            </button>
          </div>
          {holidays.length === 0 ? (
            <p className="text-sm text-neutral-500">No holidays set.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between p-3 text-sm">
                  <span>
                    {new Date(h.onDate).toLocaleDateString()} — {h.label} {h.branchId ? `(${branchName(h.branchId)})` : '(org-wide)'}
                  </span>
                  <button onClick={() => removeHoliday(h.id)} className="text-neutral-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
