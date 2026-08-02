'use client';

// Scheduling console (Doc 07 §7, Doc 04 §5 "Scheduling" row) — staff view for
// the active workspace: programs, batches (with their coach assignments and
// roster), class sessions, and holidays. Mirrors /people's plain-fetch client
// component style. No student/guardian schedule view here — that RLS is
// real (migration 0009) but the consuming page is deferred, same precedent
// as Phase 6's listWardEnrollments (service function shipped, route/UI
// later).

import { useEffect, useState } from 'react';
import { CalendarDays, CalendarPlus, Plus, Trash2, Users, UserPlus, X } from 'lucide-react';
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
  primaryMetricKey: string | null;
}

interface MetricDefinition {
  id: string;
  key: string;
  label: string;
  unit: string | null;
}

interface BatchJoinRequest {
  id: string;
  batchId: string;
  status: 'pending' | 'approved' | 'rejected';
  batchName?: string;
  studentDisplayName?: string;
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

interface AvailabilitySlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function statusBadgeClass(status: ClassSession['status']): string {
  switch (status) {
    case 'scheduled':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    case 'completed':
      return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
    case 'cancelled':
      return 'bg-red-500/20 text-red-300 border border-red-500/30';
    case 'holiday':
      return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
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
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [joinRequests, setJoinRequests] = useState<BatchJoinRequest[]>([]);
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
    api<MetricDefinition[]>(`/api/v1/orgs/${orgId}/progress/metrics`).then(setMetrics).catch(() => {});
    loadPrograms();
    loadBatches();
    loadHolidays();
    loadJoinRequests();
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

  function loadJoinRequests() {
    if (!orgId) return;
    api<BatchJoinRequest[]>(`/api/v1/orgs/${orgId}/batch-join-requests`).then(setJoinRequests).catch(() => {});
  }

  async function decideJoinRequest(requestId: string, decision: 'approved' | 'rejected') {
    if (!orgId) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/batch-join-requests/${requestId}/decide`, { method: 'POST', body: JSON.stringify({ decision }) });
      loadJoinRequests();
      if (decision === 'approved' && expandedBatchId) reloadBatchDetail(expandedBatchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function setPrimaryMetric(batchId: string, primaryMetricKey: string) {
    if (!orgId) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/batches/${batchId}`, { method: 'PATCH', body: JSON.stringify({ primaryMetricKey: primaryMetricKey || null }) });
      loadBatches();
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
          <CalendarDays className="mx-auto h-8 w-8 text-indigo-400" />
          <h1 className="text-lg font-semibold text-white">Scheduling</h1>
          <p className="text-sm text-slate-400">Pick an active workspace first — this page shows batches for whichever org you&apos;re working in.</p>
        </div>
      </div>
    );
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          badge="Scheduling"
          badgeIcon={CalendarDays}
          title="Scheduling"
          description="Programs, batches, coaches, roster, and holidays for the active workspace."
        />

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

        {/* My availability */}
        <MyAvailabilitySection />

        {/* Programs */}
        <section className="glass-panel rounded-xl p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Programs</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {programs.map((p) => (
              <span key={p.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {p.name}
              </span>
            ))}
            {programs.length === 0 && <span className="text-xs text-slate-400">No programs yet.</span>}
          </div>
          <div className="flex gap-2">
            <input
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              placeholder="e.g. Swimming Level 1"
              className="glass-input w-64 rounded-lg px-3 py-1.5 text-sm"
            />
            <button
              onClick={addProgram}
              disabled={!programName.trim()}
              className="btn-premium flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add program
            </button>
          </div>
        </section>

        {/* Batches */}
        <section className="glass-panel rounded-xl p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Batches</h2>

          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
              <input
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                className="glass-input w-40 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Branch</label>
              <select
                value={batchBranchId}
                onChange={(e) => setBatchBranchId(e.target.value)}
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
              <label className="mb-1 block text-xs font-medium text-slate-400">Program</label>
              <select
                value={batchProgramId}
                onChange={(e) => setBatchProgramId(e.target.value)}
                className="glass-input rounded-lg px-3 py-1.5 text-sm"
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
              <label className="mb-1 block text-xs font-medium text-slate-400">Days</label>
              <div className="flex gap-1">
                {DOW_LABELS.map((label, idx) => {
                  const dow = idx + 1;
                  const active = batchDays.includes(dow);
                  return (
                    <button
                      key={dow}
                      onClick={() => toggleDay(dow)}
                      className={`rounded px-1.5 py-1 text-[10px] font-medium transition ${active ? 'bg-indigo-600 text-white' : 'border border-white/10 bg-white/5 text-slate-400'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Start</label>
              <input
                type="time"
                value={batchStartTime}
                onChange={(e) => setBatchStartTime(e.target.value)}
                className="glass-input rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">End</label>
              <input
                type="time"
                value={batchEndTime}
                onChange={(e) => setBatchEndTime(e.target.value)}
                className="glass-input rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">From</label>
              <input
                type="date"
                value={batchStartDate}
                onChange={(e) => setBatchStartDate(e.target.value)}
                className="glass-input rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <button
              disabled={busy || !batchName.trim() || !batchBranchId || batchDays.length === 0}
              onClick={addBatch}
              className="btn-premium flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Create batch
            </button>
          </div>

          {batches.length === 0 ? (
            <p className="text-sm text-slate-400">No batches yet.</p>
          ) : (
            <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
              {batches.map((b) => (
                <li key={b.id} className="p-3">
                  <div className="flex w-full items-center justify-between gap-4">
                    <button
                      onClick={() => setExpandedBatchId((prev) => (prev === b.id ? null : b.id))}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-medium text-slate-100">{b.name}</p>
                      <p className="text-xs text-slate-400">
                        {branchName(b.branchId)} · {b.schedule.days.map((d) => DOW_LABELS[d - 1]).join('/')} · {b.schedule.startTime}-{b.schedule.endTime}
                      </p>
                    </button>
                    <select
                      value={b.primaryMetricKey ?? ''}
                      onChange={(e) => setPrimaryMetric(b.id, e.target.value)}
                      title="Progress metric shown on the student portal for this batch"
                      className="glass-input shrink-0 rounded px-1.5 py-1 text-[11px]"
                    >
                      <option value="">No progress goal</option>
                      {metrics.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${b.status === 'active' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-400 border border-white/10'}`}>
                      {b.status}
                    </span>
                  </div>

                  {expandedBatchId === b.id && (
                    <div className="mt-3 grid gap-4 border-t border-white/10 pt-3 sm:grid-cols-3">
                      {/* Coaches */}
                      <div>
                        <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-300">
                          <Users className="h-3 w-3 text-indigo-400" /> Coaches
                        </p>
                        <ul className="mb-2 space-y-1">
                          {coachAssignments.map((ca) => (
                            <li key={ca.membershipId} className="flex items-center justify-between text-xs text-slate-300">
                              <span>{members.find((m) => m.membershipId === ca.membershipId)?.userId ?? ca.membershipId}</span>
                              <button onClick={() => removeCoach(b.id, ca.membershipId)} className="text-slate-400 hover:text-red-400">
                                <X className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                          {coachAssignments.length === 0 && <li className="text-xs text-slate-400">None assigned.</li>}
                        </ul>
                        <div className="flex gap-1">
                          <select
                            value={coachMembershipId}
                            onChange={(e) => setCoachMembershipId(e.target.value)}
                            className="glass-input w-full rounded px-1.5 py-1 text-[11px]"
                          >
                            <option value="">Pick member…</option>
                            {members.map((m) => (
                              <option key={m.membershipId} value={m.membershipId}>
                                {m.userId} ({m.roleKeys.join(',') || 'no role'})
                              </option>
                            ))}
                          </select>
                          <button onClick={() => assignCoach(b.id)} className="btn-premium rounded px-2 text-white">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Roster */}
                      <div>
                        <p className="mb-1 text-xs font-semibold text-slate-300">Roster</p>
                        <ul className="mb-2 space-y-1">
                          {roster
                            .filter((r) => r.status === 'active')
                            .map((r) => (
                              <li key={r.enrollmentId} className="flex items-center justify-between text-xs text-slate-300">
                                <span>{enrollments.find((e) => e.id === r.enrollmentId)?.rollNumber ?? r.enrollmentId}</span>
                                <button onClick={() => removeFromRoster(b.id, r.enrollmentId)} className="text-slate-400 hover:text-red-400">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </li>
                            ))}
                          {roster.filter((r) => r.status === 'active').length === 0 && <li className="text-xs text-slate-400">No students yet.</li>}
                        </ul>
                        <div className="flex gap-1">
                          <select
                            value={rosterEnrollmentId}
                            onChange={(e) => setRosterEnrollmentId(e.target.value)}
                            className="glass-input w-full rounded px-1.5 py-1 text-[11px]"
                          >
                            <option value="">Pick student…</option>
                            {enrollments.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.rollNumber ?? e.studentUserId}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => addToRoster(b.id)} className="btn-premium rounded px-2 text-white">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Sessions */}
                      <div>
                        <p className="mb-1 text-xs font-semibold text-slate-300">Upcoming sessions</p>
                        <ul className="max-h-40 space-y-1 overflow-y-auto">
                          {sessions.map((s) => (
                            <li key={s.id} className="flex items-center justify-between text-xs text-slate-300">
                              <span>{new Date(s.startsAt).toLocaleString()}</span>
                              <div className="flex items-center gap-1">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusBadgeClass(s.status)}`}>{s.status}</span>
                                {s.status === 'scheduled' && (
                                  <button onClick={() => cancelSession(b.id, s.id)} className="text-slate-400 hover:text-red-400">
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                          {sessions.length === 0 && <li className="text-xs text-slate-400">No sessions materialized yet.</li>}
                        </ul>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Batch join requests — students requesting to join a batch they browsed
            on the student portal (migration 0011); RLS already scopes this list
            to batches the caller manages. */}
        <section className="glass-panel rounded-xl p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <UserPlus className="h-4 w-4 text-indigo-400" /> Batch join requests
          </h2>
          {joinRequests.length === 0 ? (
            <p className="text-sm text-slate-400">No pending requests.</p>
          ) : (
            <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
              {joinRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between p-3 text-sm">
                  <span className="text-slate-200">
                    <span className="font-medium">{r.studentDisplayName ?? 'Student'}</span> wants to join{' '}
                    <span className="font-medium">{r.batchName ?? r.batchId}</span>
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => decideJoinRequest(r.id, 'approved')}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => decideJoinRequest(r.id, 'rejected')}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Holidays */}
        <section className="glass-panel rounded-xl p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Holidays</h2>
          <div className="mb-3 flex gap-2">
            <input
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              className="glass-input rounded-lg px-3 py-1.5 text-sm"
            />
            <input
              value={holidayLabel}
              onChange={(e) => setHolidayLabel(e.target.value)}
              placeholder="e.g. Republic Day"
              className="glass-input w-48 rounded-lg px-3 py-1.5 text-sm"
            />
            <button
              onClick={addHoliday}
              disabled={!holidayDate || !holidayLabel.trim()}
              className="btn-premium flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add holiday
            </button>
          </div>
          {holidays.length === 0 ? (
            <p className="text-sm text-slate-400">No holidays set.</p>
          ) : (
            <ul className="glass-panel divide-y divide-white/10 rounded-xl overflow-hidden">
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between p-3 text-sm">
                  <span className="text-slate-200">
                    {new Date(h.onDate).toLocaleDateString()} — {h.label} {h.branchId ? `(${branchName(h.branchId)})` : '(org-wide)'}
                  </span>
                  <button onClick={() => removeHoliday(h.id)} className="text-slate-400 hover:text-red-400">
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

function MyAvailabilitySection() {
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<AvailabilitySlot[]>('/api/v1/me/staff/availability').then(setSlots).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function addSlot() {
    if (!slots) return;
    setBusy(true);
    setError(null);
    try {
      const next = [...slots.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })), { dayOfWeek, startTime, endTime }];
      const updated = await api<AvailabilitySlot[]>('/api/v1/me/staff/availability', { method: 'PUT', body: JSON.stringify({ slots: next }) });
      setSlots(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function removeSlot(id: string) {
    if (!slots) return;
    setError(null);
    try {
      const next = slots.filter((s) => s.id !== id).map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime }));
      const updated = await api<AvailabilitySlot[]>('/api/v1/me/staff/availability', { method: 'PUT', body: JSON.stringify({ slots: next }) });
      setSlots(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <section className="glass-panel rounded-xl p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <CalendarPlus className="h-4 w-4 text-indigo-400" /> My availability
      </h2>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {slots === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {slots.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300">
              {DAY_NAMES[s.dayOfWeek]} {s.startTime}–{s.endTime}
              <button onClick={() => removeSlot(s.id)} className="text-slate-500 hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {slots.length === 0 && <li className="text-sm text-slate-400">No availability set yet.</li>}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(Number(e.target.value))}
          className="glass-input rounded-lg px-2 py-1.5 text-sm"
        >
          {DAY_NAMES.slice(1).map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="glass-input rounded-lg px-2 py-1.5 text-sm"
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="glass-input rounded-lg px-2 py-1.5 text-sm"
        />
        <button
          disabled={busy}
          onClick={addSlot}
          className="btn-premium flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add slot
        </button>
      </div>
    </section>
  );
}
