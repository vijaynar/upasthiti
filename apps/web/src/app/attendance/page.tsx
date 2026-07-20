'use client';

// Attendance console (Doc 07 §8, Doc 04 §5 "Attendance"/"Review queue"/"Face
// enrollment" rows) — staff view for the active workspace: pick a batch and
// session, mark/override attendance, run a live face check-in scan, resolve
// the low-confidence review queue, enroll a face sample, and self check-in.
// Mirrors /scheduling's plain-fetch client component style.
//
// Face enrollment is a two-actor flow by design (Doc 04 §5: Parent's row is
// "consent only", not enrollment capture) — a guardian grants biometric
// consent on /family and shows the resulting consentId to staff here, who
// then captures the actual sample (requires attendance.face.enroll, which
// guardians never hold).

import { useEffect, useState } from 'react';
import { CalendarCheck, Camera, Check, ScanFace, UserPlus, X } from 'lucide-react';
import { FaceScanner } from './face-scanner';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body.data as T;
}

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

interface Batch {
  id: string;
  branchId: string;
  name: string;
  status: 'active' | 'archived';
}

interface ClassSession {
  id: string;
  batchId: string;
  sessionDate: string;
  startsAt: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'holiday';
}

interface BatchEnrollment {
  enrollmentId: string;
  batchId: string;
  status: 'active' | 'left';
}

interface Enrollment {
  id: string;
  studentUserId: string;
  branchId: string;
  rollNumber: string | null;
}

interface AttendanceEvent {
  id: string;
  enrollmentId: string;
  status: AttendanceStatus;
  method: string;
  confidence: number | null;
  recordedAt: string;
}

interface ReviewQueueItem {
  id: string;
  classSessionId: string;
  candidateEnrollmentId: string | null;
  confidence: number;
  status: 'pending' | 'confirmed' | 'rejected';
}

interface Member {
  membershipId: string;
  userId: string;
  branchId: string | null;
}

const STATUS_LABELS: Record<AttendanceStatus, string> = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' };
const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  late: 'bg-amber-100 text-amber-700',
  absent: 'bg-red-100 text-red-700',
  excused: 'bg-neutral-200 text-neutral-700',
};

export default function AttendancePage() {
  const [orgId, setOrgId] = useState<string | null | undefined>(undefined);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [batchId, setBatchId] = useState('');
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [roster, setRoster] = useState<BatchEnrollment[]>([]);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);

  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);

  const [enrollEnrollmentId, setEnrollEnrollmentId] = useState('');
  const [enrollConsentId, setEnrollConsentId] = useState('');
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollBusy, setEnrollBusy] = useState(false);

  useEffect(() => {
    api<{ activeOrgId: string | null }>('/api/v1/me/workspace').then((w) => setOrgId(w.activeOrgId));
    api<{ id: string }>('/api/v1/me').then((p) => setSelfUserId(p.id)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!orgId) return;
    api<Batch[]>(`/api/v1/orgs/${orgId}/batches`).then((bs) => {
      setBatches(bs);
      setBatchId((prev) => prev || bs[0]?.id || '');
    }).catch((err) => setError(err.message));
    api<Enrollment[]>(`/api/v1/orgs/${orgId}/enrollments`).then(setEnrollments).catch(() => {});
    api<Member[]>(`/api/v1/orgs/${orgId}/members`).then(setMembers).catch(() => {});
    loadReviewQueue();
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !batchId) return;
    api<ClassSession[]>(`/api/v1/orgs/${orgId}/batches/${batchId}/sessions`)
      .then((ss) => {
        setSessions(ss);
        setSessionId((prev) => (ss.some((s) => s.id === prev) ? prev : ss.find((s) => s.status === 'scheduled')?.id || ss[0]?.id || ''));
      })
      .catch((err) => setError(err.message));
    api<BatchEnrollment[]>(`/api/v1/orgs/${orgId}/batches/${batchId}/roster`).then(setRoster).catch((err) => setError(err.message));
  }, [orgId, batchId]);

  useEffect(() => {
    if (!orgId || !batchId || !sessionId) return;
    loadEvents();
  }, [orgId, batchId, sessionId]);

  function loadEvents() {
    if (!batchId || !sessionId) return;
    api<AttendanceEvent[]>(`/api/v1/orgs/${orgId}/batches/${batchId}/sessions/${sessionId}/attendance`).then(setEvents).catch((err) => setError(err.message));
  }

  function loadReviewQueue() {
    if (!orgId) return;
    api<ReviewQueueItem[]>(`/api/v1/orgs/${orgId}/attendance/review-queue?status=pending`).then(setReviewQueue).catch(() => {});
  }

  async function mark(enrollmentId: string, status: AttendanceStatus) {
    if (!orgId || !batchId || !sessionId) return;
    setError(null);
    const existing = events.find((e) => e.enrollmentId === enrollmentId);
    try {
      if (existing) {
        await api(`/api/v1/orgs/${orgId}/batches/${batchId}/sessions/${sessionId}/attendance/override`, {
          method: 'POST',
          body: JSON.stringify({ enrollmentId, status }),
        });
      } else {
        await api(`/api/v1/orgs/${orgId}/batches/${batchId}/sessions/${sessionId}/attendance`, {
          method: 'POST',
          body: JSON.stringify({ enrollmentId, status, method: 'manual' }),
        });
      }
      loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function handleScan(embedding: number[]) {
    if (!orgId || !batchId || !sessionId) return;
    setScanBusy(true);
    setNotice(null);
    setError(null);
    try {
      const outcome = await api<
        | { outcome: 'recorded'; event: AttendanceEvent }
        | { outcome: 'queued_for_review'; reviewQueueId: string; confidence: number | null }
        | { outcome: 'no_match' }
      >(`/api/v1/orgs/${orgId}/batches/${batchId}/sessions/${sessionId}/attendance/face-check-in`, {
        method: 'POST',
        body: JSON.stringify({ embedding }),
      });
      if (outcome.outcome === 'recorded') {
        const student = enrollments.find((e) => e.id === outcome.event.enrollmentId);
        setNotice(`Marked ${student?.rollNumber ?? outcome.event.enrollmentId} present (${Math.round((outcome.event.confidence ?? 0) * 100)}% match).`);
        loadEvents();
      } else if (outcome.outcome === 'queued_for_review') {
        setNotice(`Low-confidence match (${Math.round((outcome.confidence ?? 0) * 100)}%) sent to the review queue.`);
        loadReviewQueue();
      } else {
        setNotice('No match found — use manual check-in.');
      }
      setScannerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Face check-in failed.');
    } finally {
      setScanBusy(false);
    }
  }

  async function resolveReview(id: string, decision: 'confirmed' | 'rejected') {
    if (!orgId) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/attendance/review-queue/${id}/resolve`, { method: 'POST', body: JSON.stringify({ decision }) });
      loadReviewQueue();
      loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  async function submitEnrollment(embedding: number[]) {
    if (!orgId || !enrollEnrollmentId || !enrollConsentId.trim()) return;
    setEnrollBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/attendance/face-enrollments`, {
        method: 'POST',
        body: JSON.stringify({ enrollmentId: enrollEnrollmentId, consentId: enrollConsentId.trim(), embedding }),
      });
      setNotice('Face enrolled.');
      setEnrollOpen(false);
      setEnrollConsentId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed.');
    } finally {
      setEnrollBusy(false);
    }
  }

  async function selfCheckIn() {
    if (!orgId || !selfUserId) return;
    const membership = members.find((m) => m.userId === selfUserId);
    if (!membership) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/attendance/staff-check-in`, {
        method: 'POST',
        body: JSON.stringify({ branchId: membership.branchId ?? batches.find((b) => b.id === batchId)?.branchId, membershipId: membership.membershipId, kind: 'check_in', method: 'manual' }),
      });
      setNotice('Checked in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Self check-in failed.');
    }
  }

  if (orgId === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  if (orgId === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="max-w-sm space-y-2 rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <CalendarCheck className="mx-auto h-8 w-8 text-neutral-300" />
          <h1 className="text-lg font-semibold text-neutral-900">Attendance</h1>
          <p className="text-sm text-neutral-500">Pick an active workspace first.</p>
        </div>
      </div>
    );
  }

  const activeRoster = roster.filter((r) => r.status === 'active');
  const rollLabel = (enrollmentId: string) => enrollments.find((e) => e.id === enrollmentId)?.rollNumber ?? enrollmentId;

  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-1 text-lg font-semibold text-neutral-900">Attendance</h1>
            <p className="text-sm text-neutral-500">Mark, scan, and review attendance for the active workspace.</p>
          </div>
          <button onClick={selfCheckIn} className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100">
            <Check className="h-3.5 w-3.5" /> Self check-in
          </button>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

        {/* Batch / session picker */}
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Batch</label>
              <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500">
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Session</label>
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500">
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.startsAt).toLocaleString()} ({s.status})
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setScannerOpen((v) => !v)}
              disabled={!sessionId}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
            >
              <ScanFace className="h-3.5 w-3.5" /> {scannerOpen ? 'Close scanner' : 'Face check-in'}
            </button>
          </div>

          {scannerOpen && (
            <div className="mt-4 border-t border-neutral-100 pt-4">
              <FaceScanner onCapture={handleScan} busy={scanBusy} />
            </div>
          )}
        </section>

        {/* Roster */}
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Roster</h2>
          {activeRoster.length === 0 ? (
            <p className="text-sm text-neutral-500">No students on this batch&apos;s roster.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
              {activeRoster.map((r) => {
                const evt = events.find((e) => e.enrollmentId === r.enrollmentId);
                return (
                  <li key={r.enrollmentId} className="flex items-center justify-between gap-3 p-3">
                    <span className="text-sm text-neutral-800">{rollLabel(r.enrollmentId)}</span>
                    <div className="flex items-center gap-1.5">
                      {evt && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[evt.status]}`}>{STATUS_LABELS[evt.status]}</span>}
                      {(['present', 'late', 'absent', 'excused'] as AttendanceStatus[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => mark(r.enrollmentId, s)}
                          className={`rounded px-1.5 py-1 text-[10px] font-medium ${evt?.status === s ? STATUS_COLORS[s] : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Review queue */}
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Review queue</h2>
          {reviewQueue.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing pending review.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
              {reviewQueue.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    {item.candidateEnrollmentId ? rollLabel(item.candidateEnrollmentId) : 'Unmatched'} — {Math.round(item.confidence * 100)}% confidence
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => resolveReview(item.id, 'confirmed')} className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700">
                      <Check className="h-3 w-3" /> Confirm
                    </button>
                    <button onClick={() => resolveReview(item.id, 'rejected')} className="flex items-center gap-1 rounded bg-neutral-200 px-2 py-1 text-[10px] font-medium text-neutral-700 hover:bg-neutral-300">
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Face enrollment */}
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Face enrollment</h2>
            <button onClick={() => setEnrollOpen((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-neutral-600 hover:underline">
              <UserPlus className="h-3.5 w-3.5" /> {enrollOpen ? 'Close' : 'Enroll a student'}
            </button>
          </div>
          <p className="mb-3 text-xs text-neutral-500">
            A guardian must first grant biometric consent (on their Family page) and share the consent ID with you — enrollment requires an active{' '}
            <code>biometric_face</code> consent for the same student, enforced by the database.
          </p>
          {enrollOpen && (
            <div className="space-y-3 rounded-lg border border-neutral-100 bg-neutral-50 p-3">
              <div className="flex flex-wrap gap-2">
                <select value={enrollEnrollmentId} onChange={(e) => setEnrollEnrollmentId(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none">
                  <option value="">Pick student…</option>
                  {enrollments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.rollNumber ?? e.studentUserId}
                    </option>
                  ))}
                </select>
                <input
                  value={enrollConsentId}
                  onChange={(e) => setEnrollConsentId(e.target.value)}
                  placeholder="consent ID from guardian"
                  className="w-64 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                />
              </div>
              {enrollEnrollmentId && enrollConsentId.trim() ? (
                <FaceScanner onCapture={submitEnrollment} busy={enrollBusy} />
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-neutral-400">
                  <Camera className="h-3.5 w-3.5" /> Pick a student and enter a consent ID to enable the camera.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
