'use client';

// Students console (Doc 07 §6, Doc 04 §5 "Students & profiles" row) — org
// staff view of enrollments in the active workspace: stat cards, a
// filterable/searchable roster table, a right-side detail drawer, and an
// Add/Invite Student popup. See AddStudentModal.tsx and StudentDrawer.tsx
// for those pieces; types.ts holds the shapes shared across all three files.
//
// No backend search/pagination exists on the enrollments list (see the
// /enrollments route) — this fetches the whole roster once and does
// search/filter/pagination client-side, same posture as every other list
// page in this app (batches, staff, join-requests all do the same).

import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Bell,
  Calendar,
  CheckCircle2,
  Eye,
  GraduationCap,
  Pencil,
  ScanFace,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useWorkspace } from '@/lib/workspace';
import { AddStudentModal } from './AddStudentModal';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';
import { StudentDrawer, type Tab as DrawerTab } from './StudentDrawer';
import {
  ageFromDob,
  api,
  type Branch,
  type DetailedEnrollment,
  type FaceBioStatusEntry,
  type FeeStatus,
  type FeeStatusEntry,
  type JoinRequest,
} from './types';

const PAGE_SIZE = 10;
type TabKey = 'all' | 'active' | 'new_requests' | 'inactive' | 'alumni';

export default function PeoplePage() {
  const { loading: workspaceLoading, activeOrg } = useWorkspace();
  const orgId = activeOrg?.organizationId ?? null;
  const orgSlug = activeOrg?.organizationSlug ?? null;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [enrollments, setEnrollments] = useState<DetailedEnrollment[] | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [feeStatusMap, setFeeStatusMap] = useState<Map<string, FeeStatusEntry>>(new Map());
  const [faceBioMap, setFaceBioMap] = useState<Map<string, FaceBioStatusEntry>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');
  const [feeFilter, setFeeFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [drawerEnrollmentId, setDrawerEnrollmentId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('overview');

  function openDrawer(id: string, tab: DrawerTab = 'overview') {
    setDrawerEnrollmentId(id);
    setDrawerTab(tab);
  }

  function loadRoster() {
    if (!orgId) return;
    api<DetailedEnrollment[]>(`/api/v1/orgs/${orgId}/enrollments?detailed=1`)
      .then(setEnrollments)
      .catch((err) => setError(err.message));
    api<FeeStatusEntry[]>(`/api/v1/orgs/${orgId}/finance/fee-status`)
      .then((rows) => setFeeStatusMap(new Map(rows.map((r) => [r.enrollmentId, r]))))
      .catch(() => {}); // non-fatal — coach may not have finance.charge.read
    api<FaceBioStatusEntry[]>(`/api/v1/orgs/${orgId}/attendance/face-bio-status`)
      .then((rows) => setFaceBioMap(new Map(rows.map((r) => [r.enrollmentId, r]))))
      .catch(() => {}); // non-fatal — coach may not have attendance.face.enroll
  }

  function loadJoinRequests() {
    if (!orgId) return;
    api<JoinRequest[]>(`/api/v1/orgs/${orgId}/join-requests`)
      .then((all) => setJoinRequests(all.filter((r) => r.status === 'pending')))
      .catch(() => {}); // non-fatal — coach may not have people.join_request.read
  }

  useEffect(() => {
    if (!orgId) return;
    api<Branch[]>(`/api/v1/orgs/${orgId}/branches`).then(setBranches).catch((err) => setError(err.message));
    loadRoster();
    loadJoinRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => setPage(1), [activeTab, search, batchFilter, feeFilter, ageFilter]);

  async function decide(reqId: string, decision: 'approved' | 'rejected') {
    if (!orgId) return;
    setDecidingId(reqId);
    try {
      await api(`/api/v1/orgs/${orgId}/join-requests/${reqId}/decide`, { method: 'POST', body: JSON.stringify({ decision }) });
      loadJoinRequests();
      if (decision === 'approved') loadRoster();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process the request.');
    } finally {
      setDecidingId(null);
    }
  }

  const distinctBatches = useMemo(() => {
    const names = new Set<string>();
    (enrollments ?? []).forEach((e) => e.batches.forEach((b) => names.add(b.batchName)));
    return Array.from(names).sort();
  }, [enrollments]);

  const stats = useMemo(() => {
    const list = enrollments ?? [];
    const active = list.filter((e) => e.status === 'active').length;
    const inactive = list.filter((e) => e.status === 'paused' || e.status === 'cancelled').length;
    const alumni = list.filter((e) => e.status === 'completed').length;
    const upcomingFees = list.filter((e) => {
      const f = feeStatusMap.get(e.id);
      return f && (f.feeStatus === 'pending' || f.feeStatus === 'overdue');
    }).length;
    return { total: list.length, batchCount: distinctBatches.length, active, inactive, alumni, newRequests: joinRequests.length, upcomingFees };
  }, [enrollments, feeStatusMap, joinRequests, distinctBatches]);

  const filteredEnrollments = useMemo(() => {
    let list = enrollments ?? [];
    if (activeTab === 'active') list = list.filter((e) => e.status === 'active');
    else if (activeTab === 'inactive') list = list.filter((e) => e.status === 'paused' || e.status === 'cancelled');
    else if (activeTab === 'alumni') list = list.filter((e) => e.status === 'completed');

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.studentDisplayName.toLowerCase().includes(q) || (e.rollNumber ?? '').toLowerCase().includes(q));
    }
    if (batchFilter !== 'all') list = list.filter((e) => e.batches.some((b) => b.batchName === batchFilter));
    if (feeFilter !== 'all') list = list.filter((e) => (feeStatusMap.get(e.id)?.feeStatus ?? 'no_dues') === feeFilter);
    if (ageFilter !== 'all') {
      list = list.filter((e) => {
        const age = ageFromDob(e.studentDob);
        if (age === null) return false;
        if (ageFilter === 'under12') return age < 12;
        if (ageFilter === '12to15') return age >= 12 && age <= 15;
        return age >= 16;
      });
    }
    return list;
  }, [enrollments, activeTab, search, batchFilter, feeFilter, ageFilter, feeStatusMap]);

  const totalPages = Math.max(1, Math.ceil(filteredEnrollments.length / PAGE_SIZE));
  const pageItems = filteredEnrollments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const allSelected = pageItems.length > 0 && pageItems.every((e) => prev.has(e.id));
      const next = new Set(prev);
      pageItems.forEach((e) => (allSelected ? next.delete(e.id) : next.add(e.id)));
      return next;
    });
  }

  async function applyBulkAction() {
    if (!orgId || !bulkAction || selectedIds.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      await Promise.all(
        Array.from(selectedIds).map((enrollmentId) =>
          api(`/api/v1/orgs/${orgId}/enrollments/${enrollmentId}`, { method: 'PATCH', body: JSON.stringify({ status: bulkAction }) })
        )
      );
      setSelectedIds(new Set());
      setBulkAction('');
      loadRoster();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk update failed.');
    } finally {
      setBulkBusy(false);
    }
  }

  // Row-menu quick actions — same API calls the drawer's Overview tab makes,
  // duplicated here (rather than reused) since the drawer's are closures over
  // its own local busy/error state, not something a table row can share.
  async function quickSendReminder(e: DetailedEnrollment) {
    if (!orgId) return;
    setError(null);
    try {
      const fee = feeStatusMap.get(e.id);
      await api(`/api/v1/orgs/${orgId}/notifications/send`, {
        method: 'POST',
        body: JSON.stringify({
          recipientUserIds: [e.studentUserId],
          templateKey: 'fee_reminder',
          channel: 'email',
          language: 'en',
          variables: { amountDueMinor: fee?.amountDueMinor ?? 0, dueOn: fee?.nextDueOn ?? '' },
          refType: 'enrollment',
          refId: e.id,
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not queue the reminder.');
    }
  }

  async function quickRemoveFromBatch(e: DetailedEnrollment) {
    if (!orgId) return;
    const batch = e.batches[0];
    if (!batch) {
      setError(`${e.studentDisplayName} isn't assigned to a batch.`);
      return;
    }
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/batches/${batch.batchId}/roster/${e.id}`, { method: 'DELETE' });
      loadRoster();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove from batch.');
    }
  }

  async function quickArchive(e: DetailedEnrollment) {
    if (!orgId) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/enrollments/${e.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
      loadRoster();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive this student.');
    }
  }

  const drawerEnrollment = enrollments?.find((e) => e.id === drawerEnrollmentId) ?? null;

  if (workspaceLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!orgId || !orgSlug) {
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
      <PageHeader
        badge="Team & Members"
        badgeIcon={GraduationCap}
        title="Students"
        description="Enrollments for the active workspace."
        action={
          <button onClick={() => setShowAddModal(true)} className="btn-premium flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold">
            <UserPlus className="h-4 w-4" /> Add / Invite Student
          </button>
        }
      />

      {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={Users} label="Total Students" value={stats.total} subtitle={`Across ${stats.batchCount} batch${stats.batchCount === 1 ? '' : 'es'}`} />
        <StatCard
          icon={UserPlus}
          label="New Requests"
          value={stats.newRequests}
          subtitle="Awaiting approval"
          linkLabel={stats.newRequests > 0 ? 'Review now' : undefined}
          onLinkClick={() => setActiveTab('new_requests')}
          tone="amber"
        />
        <StatCard
          icon={CheckCircle2}
          label="Active Students"
          value={stats.active}
          subtitle={stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}% of total` : '—'}
          tone="emerald"
        />
        <StatCard
          icon={UserX}
          label="Inactive Students"
          value={stats.inactive}
          subtitle={stats.total > 0 ? `${Math.round((stats.inactive / stats.total) * 100)}% of total` : '—'}
        />
        <StatCard icon={Wallet} label="Upcoming Fees" value={stats.upcomingFees} subtitle="Pending or overdue" tone="rose" />
      </div>

      {/* Search + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or roll number…"
            className="glass-input w-full rounded-xl py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="glass-input rounded-xl px-3 py-2 text-xs">
          <option value="all">All Batches</option>
          {distinctBatches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={feeFilter} onChange={(e) => setFeeFilter(e.target.value)} className="glass-input rounded-xl px-3 py-2 text-xs">
          <option value="all">All Fee Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="no_dues">No Dues</option>
        </select>
        <select value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)} className="glass-input rounded-xl px-3 py-2 text-xs">
          <option value="all">All Ages</option>
          <option value="under12">Under 12</option>
          <option value="12to15">12–15</option>
          <option value="16plus">16+</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-white/10">
        {(
          [
            ['all', `All Students (${stats.total})`],
            ['active', `Active (${stats.active})`],
            ['new_requests', `New Requests (${stats.newRequests})`],
            ['inactive', `Inactive (${stats.inactive})`],
            ['alumni', `Alumni (${stats.alumni})`],
          ] as [TabKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-xs font-semibold transition ${
              activeTab === key ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'new_requests' ? (
        <JoinRequestsList requests={joinRequests} decidingId={decidingId} onDecide={decide} />
      ) : enrollments === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : filteredEnrollments.length === 0 ? (
        <p className="text-sm text-slate-400">No students match these filters.</p>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs">
              <span className="font-semibold text-indigo-300">{selectedIds.size} selected</span>
              <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} className="glass-input rounded-lg px-2 py-1 text-xs">
                <option value="">Bulk Actions…</option>
                <option value="active">Mark Active</option>
                <option value="paused">Mark Inactive</option>
              </select>
              <button disabled={!bulkAction || bulkBusy} onClick={applyBulkAction} className="btn-premium rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-50">
                {bulkBusy ? 'Applying…' : 'Apply'}
              </button>
            </div>
          )}

          <div className="glass-panel overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="w-8 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={pageItems.length > 0 && pageItems.every((e) => selectedIds.has(e.id))}
                        onChange={toggleSelectAllOnPage}
                      />
                    </th>
                    <th className="px-3 py-3">Student</th>
                    <th className="px-3 py-3">Batch</th>
                    <th className="px-3 py-3">Age</th>
                    <th className="px-3 py-3">Fee Status</th>
                    <th className="px-3 py-3">Approval</th>
                    <th className="px-3 py-3">Face Bio Status</th>
                    <th className="px-3 py-3">Joined Date</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pageItems.map((e) => (
                    <StudentRow
                      key={e.id}
                      enrollment={e}
                      feeStatus={feeStatusMap.get(e.id)}
                      faceBio={faceBioMap.get(e.id)}
                      selected={selectedIds.has(e.id)}
                      onToggleSelect={() => toggleSelect(e.id)}
                      onOpen={(tab) => openDrawer(e.id, tab)}
                      onSendReminder={() => quickSendReminder(e)}
                      onRemoveFromBatch={() => quickRemoveFromBatch(e)}
                      onArchive={() => quickArchive(e)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-400">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filteredEnrollments.length)} of {filteredEnrollments.length} students
              </span>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-white/10 px-2 py-1 disabled:opacity-30">
                  ‹
                </button>
                <span className="px-2">
                  {page} / {totalPages}
                </span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-white/10 px-2 py-1 disabled:opacity-30">
                  ›
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showAddModal && (
        <AddStudentModal orgId={orgId} orgSlug={orgSlug} branches={branches} onClose={() => setShowAddModal(false)} onEnrolled={loadRoster} />
      )}

      {drawerEnrollment && (
        <StudentDrawer
          key={`${drawerEnrollment.id}-${drawerTab}`}
          orgId={orgId}
          enrollment={drawerEnrollment}
          feeStatus={feeStatusMap.get(drawerEnrollment.id)}
          faceBio={faceBioMap.get(drawerEnrollment.id)}
          initialTab={drawerTab}
          onClose={() => setDrawerEnrollmentId(null)}
          onChanged={loadRoster}
        />
      )}
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  linkLabel,
  onLinkClick,
  tone = 'default',
}: {
  icon: typeof Users;
  label: string;
  value: number;
  subtitle?: string;
  linkLabel?: string;
  onLinkClick?: () => void;
  tone?: 'default' | 'emerald' | 'amber' | 'rose';
}) {
  const toneClasses: Record<string, string> = {
    default: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl border ${toneClasses[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className="text-2xl font-black text-white">{value}</p>
      {linkLabel ? (
        <button onClick={onLinkClick} className="mt-1 text-[11px] font-semibold text-indigo-300 hover:text-indigo-200">
          {linkLabel}
        </button>
      ) : (
        subtitle && <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>
      )}
    </div>
  );
}

// ── Student row ──────────────────────────────────────────────────────────

function initials(name: string): string {
  return (
    name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

function feeStatusBadge(status: FeeStatus | undefined) {
  const map: Record<FeeStatus, string> = {
    no_dues: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    overdue: 'bg-red-500/15 text-red-300 border-red-500/30',
  };
  const key = status ?? 'no_dues';
  const label = key === 'no_dues' ? 'No Dues' : key[0].toUpperCase() + key.slice(1);
  return <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${map[key]}`}>{label}</span>;
}

function StudentRow({
  enrollment,
  feeStatus,
  faceBio,
  selected,
  onToggleSelect,
  onOpen,
  onSendReminder,
  onRemoveFromBatch,
  onArchive,
}: {
  enrollment: DetailedEnrollment;
  feeStatus: FeeStatusEntry | undefined;
  faceBio: FaceBioStatusEntry | undefined;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: (tab?: DrawerTab) => void;
  onSendReminder: () => void;
  onRemoveFromBatch: () => void;
  onArchive: () => void;
}) {
  const age = ageFromDob(enrollment.studentDob);
  const menuItems: ActionMenuItem[] = [
    { label: 'View Profile', icon: Eye, onClick: () => onOpen('overview') },
    { label: 'Edit Details', icon: Pencil, onClick: () => onOpen('details') },
    { label: 'Mark Attendance', icon: Calendar, onClick: () => { window.location.href = '/attendance'; } },
    { label: 'Enroll Face Bio', icon: ScanFace, onClick: () => { window.location.href = `/people/${enrollment.id}/face-enroll`; } },
    { label: 'Send Payment Reminder', icon: Bell, onClick: onSendReminder },
    { label: 'Remove from Batch', icon: UserMinus, onClick: onRemoveFromBatch, tone: 'danger', disabled: enrollment.batches.length === 0 },
    { label: 'Archive (Mark Alumni)', icon: Archive, onClick: onArchive, tone: 'danger', disabled: enrollment.status === 'completed' },
  ];
  return (
    <tr onClick={() => onOpen()} className="cursor-pointer hover:bg-white/5">
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggleSelect} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-indigo-500/30 bg-indigo-500/20 text-[10px] font-black text-indigo-300">
            {enrollment.studentAvatarPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={enrollment.studentAvatarPath} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(enrollment.studentDisplayName)
            )}
          </div>
          <div>
            <p className="font-semibold text-slate-100">{enrollment.studentDisplayName}</p>
            <p className="text-[11px] text-slate-500">{enrollment.rollNumber ?? enrollment.id.slice(0, 8)}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-slate-300">{enrollment.batches.map((b) => b.batchName).join(', ') || '—'}</td>
      <td className="px-3 py-3 text-slate-300">{age !== null ? age : '—'}</td>
      <td className="px-3 py-3">
        {feeStatusBadge(feeStatus?.feeStatus)}
        {feeStatus?.nextDueOn && (feeStatus.feeStatus === 'pending' || feeStatus.feeStatus === 'overdue') && (
          <p className="mt-0.5 text-[10px] text-slate-500">Due {new Date(feeStatus.nextDueOn).toLocaleDateString()}</p>
        )}
      </td>
      <td className="px-3 py-3">
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">Approved</span>
      </td>
      <td className="px-3 py-3">
        {faceBio?.enrolled ? (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">Enrolled</span>
        ) : (
          <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-0.5 text-[10px] font-bold text-red-300">Missing</span>
        )}
      </td>
      <td className="px-3 py-3 text-slate-400">{new Date(enrollment.startedOn).toLocaleDateString()}</td>
      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <ActionMenu items={menuItems} />
      </td>
    </tr>
  );
}

// ── Join requests list (New Requests tab) ─────────────────────────────────

function JoinRequestsList({
  requests,
  decidingId,
  onDecide,
}: {
  requests: JoinRequest[];
  decidingId: string | null;
  onDecide: (id: string, decision: 'approved' | 'rejected') => void;
}) {
  if (requests.length === 0) return <p className="text-sm text-slate-400">No pending join requests.</p>;

  return (
    <div className="glass-panel divide-y divide-white/5 overflow-hidden rounded-2xl">
      {requests.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100">{r.subjectDisplayName ?? r.subjectUserId}</p>
            <p className="text-xs text-slate-400">
              Wants to join as <span className="capitalize text-slate-300">{r.requestedRole.replace('_', ' ')}</span> ·{' '}
              {new Date(r.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              disabled={decidingId === r.id}
              onClick={() => onDecide(r.id, 'approved')}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50 active:scale-95"
            >
              <UserCheck className="h-3.5 w-3.5" />
              {decidingId === r.id ? '…' : 'Approve'}
            </button>
            <button
              disabled={decidingId === r.id}
              onClick={() => onDecide(r.id, 'rejected')}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-white/10 disabled:opacity-50 active:scale-95"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
