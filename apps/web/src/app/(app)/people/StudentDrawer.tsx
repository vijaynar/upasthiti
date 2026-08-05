'use client';

// Right-side detail drawer for a single student — Overview / Details /
// Payments / Performance / Notes tabs + a Quick Actions grid. Payments and
// Performance are read-only history pulled from the existing finance/
// progress endpoints (recording a new charge/payment/metric already has a
// home on their own console pages — /finance, /progress — so this links out
// rather than duplicating those forms). "Mark Attendance" likewise links to
// /attendance. "Enroll Face Bio" opens the dedicated Register Face Key page
// (people/[enrollmentId]/face-enroll) since live camera capture isn't
// something a side-drawer can reasonably host.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Banknote,
  Bell,
  Calendar,
  ClipboardList,
  Eye,
  FileText,
  Pencil,
  Phone,
  ScanFace,
  StickyNote,
  TrendingUp,
  UserMinus,
  X,
} from 'lucide-react';
import { ageFromDob, api, formatMinor, type DetailedEnrollment, type EnrollmentStatus, type FaceBioStatusEntry, type FeeStatusEntry } from './types';

export type Tab = 'overview' | 'details' | 'payments' | 'performance' | 'notes';

const STATUSES: EnrollmentStatus[] = ['active', 'paused', 'completed', 'cancelled'];

interface Charge {
  id: string;
  kind: string;
  description: string;
  amountMinor: number;
  currency: string;
  dueOn: string;
  status: string;
}

interface Payment {
  id: string;
  method: string;
  amountMinor: number;
  currency: string;
  status: string;
}

interface ProgressEntry {
  id: string;
  metricKey: string;
  value: number;
  note: string | null;
  recordedOn: string;
}

interface Note {
  id: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function StatusBadge({ status }: { status: EnrollmentStatus }) {
  const styles: Record<EnrollmentStatus, string> = {
    active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    paused: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    completed: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    cancelled: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  };
  return <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold capitalize ${styles[status]}`}>{status}</span>;
}

function QuickAction({ icon: Icon, label, onClick, tone = 'default' }: { icon: typeof Eye; label: string; onClick: () => void; tone?: 'default' | 'danger' }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition hover:bg-white/10 ${
        tone === 'danger' ? 'border-red-500/20 text-red-300' : 'border-white/10 text-slate-300'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="text-[10px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

export function StudentDrawer({
  orgId,
  enrollment,
  feeStatus,
  faceBio,
  initialTab = 'overview',
  onClose,
  onChanged,
}: {
  orgId: string;
  enrollment: DetailedEnrollment;
  feeStatus: FeeStatusEntry | undefined;
  faceBio: FaceBioStatusEntry | undefined;
  initialTab?: Tab;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const age = ageFromDob(enrollment.studentDob);
  const profile = enrollment.profile as { guardianName?: string; guardianPhone?: string };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-panel flex h-full w-full max-w-md flex-col border-l border-white/10" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-500/20 text-sm font-black text-indigo-300 border border-indigo-500/30">
              {enrollment.studentAvatarPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={enrollment.studentAvatarPath} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(enrollment.studentDisplayName)
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{enrollment.studentDisplayName}</h3>
              <p className="text-xs text-slate-400">
                {enrollment.rollNumber ? `${enrollment.rollNumber} · ` : ''}
                {enrollment.batches.map((b) => b.batchName).join(', ') || 'No batch'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 px-5 text-xs font-semibold text-slate-400">
          {(['overview', 'details', 'payments', 'performance', 'notes'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2.5 capitalize transition ${
                tab === t ? 'border-indigo-500 text-indigo-300' : 'drawer-tab-inactive border-transparent hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'overview' && (
            <OverviewTab
              enrollment={enrollment}
              age={age}
              profile={profile}
              feeStatus={feeStatus}
              faceBio={faceBio}
              onQuickAction={setTab}
              orgId={orgId}
              onChanged={onChanged}
            />
          )}
          {tab === 'details' && <DetailsTab orgId={orgId} enrollment={enrollment} onChanged={onChanged} />}
          {tab === 'payments' && <PaymentsTab orgId={orgId} enrollment={enrollment} feeStatus={feeStatus} />}
          {tab === 'performance' && <PerformanceTab orgId={orgId} enrollment={enrollment} />}
          {tab === 'notes' && <NotesTab orgId={orgId} enrollment={enrollment} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  enrollment,
  age,
  profile,
  feeStatus,
  faceBio,
  onQuickAction,
  orgId,
  onChanged,
}: {
  enrollment: DetailedEnrollment;
  age: number | null;
  profile: { guardianName?: string; guardianPhone?: string };
  feeStatus: FeeStatusEntry | undefined;
  faceBio: FaceBioStatusEntry | undefined;
  onQuickAction: (tab: Tab) => void;
  orgId: string;
  onChanged: () => void;
}) {
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendReminder() {
    setBusy(true);
    setReminderMsg(null);
    try {
      await api(`/api/v1/orgs/${orgId}/notifications/send`, {
        method: 'POST',
        body: JSON.stringify({
          recipientUserIds: [enrollment.studentUserId],
          templateKey: 'fee_reminder',
          channel: 'email',
          language: 'en',
          variables: { amountDueMinor: feeStatus?.amountDueMinor ?? 0, dueOn: feeStatus?.nextDueOn ?? '' },
          refType: 'enrollment',
          refId: enrollment.id,
        }),
      });
      setReminderMsg('Reminder queued.');
    } catch (err) {
      setReminderMsg(err instanceof Error ? err.message : 'Could not queue the reminder.');
    } finally {
      setBusy(false);
    }
  }

  async function removeFromBatch() {
    const batch = enrollment.batches[0];
    if (!batch) return;
    try {
      await api(`/api/v1/orgs/${orgId}/batches/${batch.batchId}/roster/${enrollment.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setReminderMsg(err instanceof Error ? err.message : 'Could not remove from batch.');
    }
  }

  return (
    <div className="space-y-5">
      <dl className="space-y-3 text-sm">
        <Row label="Batch" value={enrollment.batches.map((b) => b.batchName).join(', ') || '—'} />
        <Row label="Age" value={age !== null ? `${age} yrs` : '—'} />
        <Row label="Parent / Guardian" value={profile.guardianName || '—'} />
        {profile.guardianPhone && (
          <Row
            label=""
            value={
              <a href={`tel:${profile.guardianPhone}`} className="flex items-center gap-1.5 text-indigo-300">
                <Phone className="h-3.5 w-3.5" /> {profile.guardianPhone}
              </a>
            }
          />
        )}
        <Row label="Joined On" value={new Date(enrollment.startedOn).toLocaleDateString()} />
        <Row label="Status" value={<StatusBadge status={enrollment.status} />} />
        <Row label="Fee Status" value={feeStatus ? feeStatus.feeStatus.replace('_', ' ') : '—'} />
        <Row label="Face Bio" value={faceBio?.enrolled ? 'Enrolled' : 'Missing'} />
      </dl>

      {reminderMsg && <p className="text-xs text-slate-400">{reminderMsg}</p>}

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Quick Actions</p>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction icon={Eye} label="View Profile" onClick={() => onQuickAction('overview')} />
          <QuickAction icon={Pencil} label="Edit Details" onClick={() => onQuickAction('details')} />
          <QuickAction icon={Calendar} label="Mark Attendance" onClick={() => { window.location.href = '/attendance'; }} />
          <QuickAction icon={ClipboardList} label="Payment History" onClick={() => onQuickAction('payments')} />
          <QuickAction icon={Bell} label="Send Payment Reminder" onClick={sendReminder} />
          <QuickAction icon={ScanFace} label="Enroll Face Bio" onClick={() => { window.location.href = `/people/${enrollment.id}/face-enroll`; }} />
          <QuickAction icon={UserMinus} label="Remove from Batch" onClick={removeFromBatch} tone="danger" />
          <QuickAction icon={StickyNote} label="Add Note" onClick={() => onQuickAction('notes')} />
        </div>
        {busy && <p className="mt-2 text-[11px] text-slate-500">Sending…</p>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {label && <dt className="text-xs font-semibold text-slate-500">{label}</dt>}
      <dd className={`text-right text-slate-200 ${!label ? 'ml-auto' : ''}`}>{value}</dd>
    </div>
  );
}

function DetailsTab({ orgId, enrollment, onChanged }: { orgId: string; enrollment: DetailedEnrollment; onChanged: () => void }) {
  const profile = enrollment.profile as { guardianName?: string; guardianPhone?: string };
  const [rollNumber, setRollNumber] = useState(enrollment.rollNumber ?? '');
  const [status, setStatus] = useState<EnrollmentStatus>(enrollment.status);
  const [guardianName, setGuardianName] = useState(profile.guardianName ?? '');
  const [guardianPhone, setGuardianPhone] = useState(profile.guardianPhone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api(`/api/v1/orgs/${orgId}/enrollments/${enrollment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          rollNumber: rollNumber.trim() || null,
          profile: { ...enrollment.profile, guardianName: guardianName.trim() || undefined, guardianPhone: guardianPhone.trim() || undefined },
        }),
      });
      setSaved(true);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Name, date of birth, and phone come from the student&apos;s own account and can only be edited by them — this form covers what staff manage
        directly.
      </p>
      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-400">{error}</div>}
      <Field label="Roll number">
        <input value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} className="glass-input w-full rounded-lg px-3 py-1.5 text-sm" />
      </Field>
      <Field label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value as EnrollmentStatus)} className="glass-input w-full rounded-lg px-3 py-1.5 text-sm">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Parent / Guardian name">
        <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className="glass-input w-full rounded-lg px-3 py-1.5 text-sm" />
      </Field>
      <Field label="Parent / Guardian phone">
        <input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="glass-input w-full rounded-lg px-3 py-1.5 text-sm" />
      </Field>
      <button disabled={busy} onClick={save} className="btn-premium w-full rounded-lg py-2 text-xs font-bold disabled:opacity-50">
        {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function PaymentsTab({ orgId, enrollment, feeStatus }: { orgId: string; enrollment: DetailedEnrollment; feeStatus: FeeStatusEntry | undefined }) {
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);

  useEffect(() => {
    api<Charge[]>(`/api/v1/orgs/${orgId}/finance/charges?enrollmentId=${enrollment.id}`).then(setCharges).catch(() => setCharges([]));
    api<Payment[]>(`/api/v1/orgs/${orgId}/finance/payments?payerUserId=${enrollment.studentUserId}`).then(setPayments).catch(() => setPayments([]));
  }, [orgId, enrollment.id, enrollment.studentUserId]);

  return (
    <div className="space-y-5">
      {feeStatus && feeStatus.feeStatus !== 'no_dues' && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          <p className="text-xs text-slate-500">Currently due</p>
          <p className="text-lg font-bold text-white">{formatMinor(feeStatus.amountDueMinor)}</p>
          {feeStatus.nextDueOn && <p className="text-xs text-slate-400">Due on {new Date(feeStatus.nextDueOn).toLocaleDateString()}</p>}
        </div>
      )}

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <Banknote className="h-3 w-3" /> Charges
        </p>
        {charges === null ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : charges.length === 0 ? (
          <p className="text-xs text-slate-500">No charges yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
                <span className="text-slate-300">{c.description}</span>
                <span className="text-right">
                  <span className="block font-semibold text-slate-100">{formatMinor(c.amountMinor, c.currency)}</span>
                  <span className="text-slate-500 capitalize">{c.status.replace('_', ' ')}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Payments</p>
        {payments === null ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : payments.length === 0 ? (
          <p className="text-xs text-slate-500">No payments recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
                <span className="capitalize text-slate-300">{p.method.replace('_', ' ')}</span>
                <span className="text-right">
                  <span className="block font-semibold text-slate-100">{formatMinor(p.amountMinor, p.currency)}</span>
                  <span className="text-slate-500 capitalize">{p.status.replace('_', ' ')}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/finance" className="block text-center text-xs font-semibold text-indigo-300 hover:text-indigo-200">
        Record a charge or payment in Finance →
      </Link>
    </div>
  );
}

function PerformanceTab({ orgId, enrollment }: { orgId: string; enrollment: DetailedEnrollment }) {
  const [entries, setEntries] = useState<ProgressEntry[] | null>(null);

  useEffect(() => {
    api<ProgressEntry[]>(`/api/v1/orgs/${orgId}/progress/entries?enrollmentId=${enrollment.id}`)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [orgId, enrollment.id]);

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <TrendingUp className="h-3 w-3" /> Logged metrics
      </p>
      {entries === null ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-slate-500">No progress logged for this student yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
              <span className="capitalize text-slate-300">{e.metricKey.replace(/_/g, ' ')}</span>
              <span className="text-right">
                <span className="block font-semibold text-slate-100">{e.value}</span>
                <span className="text-slate-500">{new Date(e.recordedOn).toLocaleDateString()}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/progress" className="block text-center text-xs font-semibold text-indigo-300 hover:text-indigo-200">
        Log progress in the Progress console →
      </Link>
    </div>
  );
}

function NotesTab({ orgId, enrollment }: { orgId: string; enrollment: DetailedEnrollment }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function load() {
    api<Note[]>(`/api/v1/orgs/${orgId}/enrollments/${enrollment.id}/notes`)
      .then(setNotes)
      .catch(() => setNotes([]));
  }

  useEffect(load, [orgId, enrollment.id]);
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function addNote() {
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/enrollments/${enrollment.id}/notes`, { method: 'POST', body: JSON.stringify({ body: draft.trim() }) });
      setDraft('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the note.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note about this student…"
          rows={3}
          className="glass-input w-full rounded-lg px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button disabled={busy || !draft.trim()} onClick={addNote} className="btn-premium rounded-lg px-4 py-1.5 text-xs font-bold disabled:opacity-50">
          <FileText className="mr-1.5 inline h-3.5 w-3.5" /> Add Note
        </button>
      </div>

      {notes === null ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-slate-500">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs">
              <p className="text-slate-200">{n.body}</p>
              <p className="mt-1.5 text-[10px] text-slate-500">
                {n.authorDisplayName} · {new Date(n.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
