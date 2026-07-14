'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Users,
  Plus,
  Search,
  X,
  RefreshCw,
  FileText,
  Upload,
  Download,
  Award,
  AlertCircle,
  Star,
  Check,
  CreditCard,
  ShieldAlert,
  FileCheck,
  Activity,
  Link2,
  Eye,
  MoreVertical,
  Edit2,
  PauseCircle,
  PlayCircle,
  Ban,
  Archive,
  KeyRound,
  BellRing,
  FileWarning,
  StickyNote,
  History,
  GraduationCap,
  ListChecks,
  PanelRightClose,
  CalendarPlus,
  MessageSquare,
  ChevronDown,
  Phone,
  Mail,
  MapPin,
  ArrowUp,
  ArrowDown,
  Briefcase,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { CoachOnboardingWizard, type CoachEditData } from '@/components/CoachOnboardingWizard';
import CustomSelect from '../components/CustomSelect';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface CoachItem {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  coach_profile: {
    experience_years: number;
    service_types: string[];
    class_types: string[];
    languages_known: string[];
    qualification: string | null;
    certifications_summary: string | null;
    joining_date: string;
    bio: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
    area: string | null;
    address: string | null;
    gender: string | null;
    date_of_birth: string | null;
    account_status: string;
    status_reason: string | null;
    document_request_note: string | null;
    document_request_at: string | null;
    public_profile_slug: string | null;
    achievements: string[];
    gallery_urls: string[];
    avg_rating: number;
    retention_rate: number;
    conversion_rate: number;
    satisfaction_score: number;
    created_at: string;
    age_groups: string[];
    skill_levels: string[];
    coach_categories: {
      is_primary: boolean;
      subcategory: { name: string; slug: string; category: { name: string; slug: string; icon: string | null } | null } | null;
    }[];
    service_areas: { area: { name: string; city: string } | null }[];
    service_communities: { community: { name: string } | null }[];
    pricing_policies: { policy_type: string; enabled: boolean; is_default: boolean }[];
    availability: { id: string }[];
    financial: {
      salary_type: string; fixed_salary: number; per_class_rate: number; revenue_share_pct: number;
      bank_name: string | null; bank_account_number: string | null; bank_ifsc_code: string | null;
      upi_id: string | null; pan_number: string | null;
    } | null;
    documents: { document_type: string; verification_status: string }[];
  } | null;
  batch_assignments: {
    id: string;
    status: string;
    assigned_days: number[] | null;
    batch: {
      id: string;
      name: string;
      start_time: string;
      end_time: string;
      days_of_week: number[];
      class: { name: string } | null;
    };
  }[];
}

interface BatchOption {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  class: { name: string } | null;
}

interface CoachDocument {
  id: string;
  coach_id: string;
  document_type: string;
  document_name: string;
  file_url: string;
  expiry_date: string | null;
  verification_status: string;
  rejection_reason: string | null;
}

interface CoachPayout {
  id: string;
  period_start: string;
  period_end: string;
  base_salary_earned: number;
  class_sessions_conducted: number;
  class_rate_earned: number;
  revenue_share_earned: number;
  incentives: number;
  deductions: number;
  net_payout: number;
  status: string;
  paid_at: string | null;
  transaction_reference: string | null;
}

interface CoachAvailability {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
}

interface CoachNote {
  id: string;
  note: string;
  created_at: string;
  author: { first_name: string; last_name: string } | null;
}

interface TimelineEntry {
  id: string;
  action_type: string;
  description: string;
  created_at: string;
  actor: { first_name: string; last_name: string } | null;
}

interface StudentLite {
  id: string;
  first_name: string;
  last_name: string;
}

interface CoachStats {
  pendingPayoutTotal: number;
  pendingPayoutCoachCount: number;
  expiringDocsCount: number;
  pendingDocVerificationCount: number;
  missingBankDetailsCount: number;
}

// ─── Status taxonomy (display-only restyle — DB values are unchanged) ─────────

// Semantic color convention, kept consistent across the app: Registration/informational
// = blue, Active = green, Pending (needs someone's action) = amber/orange,
// Inactive/terminal = gray, Suspended/Rejected (blocked) = red.
const STATUS_DISPLAY: Record<string, { label: string; color: string; dot: string; pill: string }> = {
  'Onboarding': { label: 'Registration Started', color: 'text-blue-400', dot: 'bg-blue-400', pill: 'bg-blue-500/10 border border-blue-500/20 text-blue-400' },
  'Document Upload Pending': { label: 'Documents Pending', color: 'text-orange-400', dot: 'bg-orange-400', pill: 'bg-orange-500/10 border border-orange-500/20 text-orange-400' },
  'Pending Verification': { label: 'Verification Pending', color: 'text-amber-400', dot: 'bg-amber-400', pill: 'bg-amber-500/10 border border-amber-500/20 text-amber-400' },
  'Active': { label: 'Active', color: 'text-emerald-400', dot: 'bg-emerald-400', pill: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' },
  'Paused': { label: 'Paused', color: 'text-amber-400', dot: 'bg-amber-400', pill: 'bg-amber-500/10 border border-amber-500/20 text-amber-400' },
  'Suspended': { label: 'Suspended', color: 'text-red-400', dot: 'bg-red-400', pill: 'bg-red-500/10 border border-red-500/20 text-red-400' },
  'Rejected': { label: 'Rejected', color: 'text-red-400', dot: 'bg-red-400', pill: 'bg-red-500/10 border border-red-500/20 text-red-400' },
  'Inactive': { label: 'Deactivated', color: 'text-slate-400', dot: 'bg-slate-400', pill: 'bg-slate-500/10 border border-slate-500/20 text-slate-400' },
  'On Leave': { label: 'On Leave', color: 'text-violet-400', dot: 'bg-violet-400', pill: 'bg-violet-500/10 border border-violet-500/20 text-violet-400' },
  'Terminated': { label: 'Terminated', color: 'text-slate-400', dot: 'bg-slate-400', pill: 'bg-slate-500/10 border border-slate-500/20 text-slate-400' },
  'Archived': { label: 'Archived', color: 'text-slate-400', dot: 'bg-slate-400', pill: 'bg-slate-500/10 border border-slate-500/20 text-slate-400' },
};
const getStatusDisplay = (status: string) => STATUS_DISPLAY[status] ?? { label: status, color: 'text-slate-400', dot: 'bg-slate-400', pill: 'bg-slate-500/10 border border-slate-500/20 text-slate-400' };

const PENDING_STATUSES = ['Onboarding', 'Document Upload Pending', 'Pending Verification'];

// Mirrors the server-side check in PUT /api/v1/coaches (action: 'approve') —
// a Government ID document must exist before a coach can be approved/reactivated.
const hasGovtIdDocument = (coach: CoachItem) => (coach.coach_profile?.documents ?? []).some(d => d.document_type === 'Government ID');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
};

function formatTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

function toastMessage(msg: string, type: 'success' | 'error' = 'success') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl text-sm font-medium shadow-lg border animate-in fade-in duration-300 ${
    type === 'success'
      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
      : 'bg-red-500/10 border-red-500/20 text-red-400'
  }`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// Profile completion — see plan §7c. "Agreement" is intentionally omitted:
// there's no e-signature/agreement-acceptance concept anywhere in the schema.
function computeCompletion(coach: CoachItem, docs?: { document_type: string; verification_status: string }[]) {
  const p = coach.coach_profile;
  const effectiveDocs = docs ?? p?.documents ?? [];
  const items = [
    { label: 'Personal Info', done: !!(coach.phone && p?.gender && p?.date_of_birth && p?.address) },
    { label: 'Qualifications', done: !!(p?.qualification && p?.certifications_summary) },
    {
      label: 'Documents',
      done: ['Government ID', 'Certification'].every(
        type => effectiveDocs.some(d => d.document_type === type && d.verification_status === 'Verified')
      ),
    },
    { label: 'Bank Details', done: !!(p?.financial?.bank_account_number && p?.financial?.bank_ifsc_code) },
    { label: 'Emergency Contact', done: false }, // not collected by this wizard yet — see plan deferrals
  ];
  const doneCount = items.filter(i => i.done).length;
  return { pct: Math.round((doneCount / items.length) * 100), items };
}

function StatCard({ icon, label, value, accent, trend }: { icon: React.ReactNode; label: string; value: string | number; accent: string; trend?: { text: string; direction: 'up' | 'down' | 'flat' } }) {
  const trendColor = trend?.direction === 'up' ? 'text-emerald-400' : trend?.direction === 'down' ? 'text-rose-400' : 'text-slate-500';
  return (
    <div className="glass-panel rounded-2xl p-4 border border-white/5 hover:border-white/20 transition-all duration-300">
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-slate-400 text-xs font-semibold">{label}</p>
        <div className={`p-1.5 rounded-lg ${accent} flex-shrink-0`}>{icon}</div>
      </div>
      <p className="text-slate-100 text-2xl font-bold">{value}</p>
      {trend && (
        <p className={`text-[11px] font-medium mt-1 flex items-center gap-1 ${trendColor}`}>
          {trend.direction === 'up' && <ArrowUp className="w-3 h-3" />}
          {trend.direction === 'down' && <ArrowDown className="w-3 h-3" />}
          {trend.text}
        </p>
      )}
    </div>
  );
}

function StatusChip({ status, dotOnly = false }: { status: string; dotOnly?: boolean }) {
  const d = getStatusDisplay(status);
  if (dotOnly) {
    return (
      <span className={`flex items-center gap-1.5 min-w-0 text-xs font-medium ${d.color}`} title={d.label}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.dot}`} />
        <span className="truncate">{d.label}</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${d.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${d.dot}`} />
      {d.label}
    </span>
  );
}

function AvatarCircle({ url, first, last, size = 'md' }: { url: string | null; first: string; last: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-16 h-16 text-lg' }[size];
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={`${first} ${last}`} className={`${sizeClass} rounded-full object-cover flex-shrink-0 border border-white/10`} />
    );
  }
  return (
    <div className={`${sizeClass} rounded-full flex-shrink-0 bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold`}>
      {initials(first, last)}
    </div>
  );
}

function CompletionBar({ pct, items }: { pct: number; items: { label: string; done: boolean }[] }) {
  const barColor = pct === 100 ? 'bg-emerald-400' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400';
  const ref = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  return (
    <div
      ref={ref}
      className="relative w-full max-w-[72px]"
      onMouseEnter={() => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltipPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 190) });
      }}
      onMouseLeave={() => setTooltipPos(null)}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-300 font-semibold">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {tooltipPos && (
        <div
          className="fixed z-50 w-44 glass-panel rounded-xl p-3 border border-white/10 shadow-2xl space-y-1.5"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          {items.map(i => (
            <div key={i.label} className="flex items-center gap-1.5 text-[11px]">
              {i.done ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <X className="w-3 h-3 text-rose-400 shrink-0" />}
              <span className={i.done ? 'text-slate-300' : 'text-slate-500'}>{i.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reason modal (Reject / Pause / Suspend / Archive / Request Documents) ────

interface ReasonModalState {
  coach: CoachItem;
  kind: 'reject' | 'pause' | 'suspend' | 'archive' | 'request-documents';
}

const REASON_MODAL_COPY: Record<ReasonModalState['kind'], { title: string; placeholder: string; confirmLabel: string; confirmClass: string }> = {
  reject: { title: 'Reject Coach Application', placeholder: 'Explain why this application is being rejected...', confirmLabel: 'Confirm Rejection', confirmClass: 'bg-rose-600 hover:bg-rose-500' },
  pause: { title: 'Pause Coach', placeholder: 'Reason for pausing this coach (they can still log in and view their dashboard/payments)...', confirmLabel: 'Confirm Pause', confirmClass: 'bg-amber-600 hover:bg-amber-500' },
  suspend: { title: 'Suspend Coach', placeholder: 'Reason for suspending this coach (login will be blocked)...', confirmLabel: 'Confirm Suspension', confirmClass: 'bg-red-600 hover:bg-red-500' },
  archive: { title: 'Archive Coach', placeholder: 'Reason for archiving this coach (terminal — moves them off the active roster)...', confirmLabel: 'Confirm Archive', confirmClass: 'bg-zinc-600 hover:bg-zinc-500' },
  'request-documents': { title: 'Request Documents', placeholder: 'Which documents are missing / what should the coach re-upload?', confirmLabel: 'Log Request', confirmClass: 'bg-indigo-600 hover:bg-indigo-500' },
};

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function CoachesPage() {
  const supabase = createBrowserClient();
  const { mode } = useTheme();

  // ── State ──
  const [coaches, setCoaches] = useState<CoachItem[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [stats, setStats] = useState<CoachStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Quick View — docked right-panel summary shown when a row is clicked
  // (replaces the "Today's Tasks" panel in that same column while selected).
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);

  // Full-detail overlay drawer (all tabs) — opened from "View Full Profile"
  // inside the Quick View panel, or "Assign Batches" from the actions menu.
  const [drawerCoachId, setDrawerCoachId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Tab Details State caches
  const [docCache, setDocCache] = useState<Record<string, CoachDocument[]>>({});
  const [payoutCache, setPayoutCache] = useState<Record<string, CoachPayout[]>>({});
  const [availCache, setAvailCache] = useState<Record<string, CoachAvailability[]>>({});
  const [noteCache, setNoteCache] = useState<Record<string, CoachNote[]>>({});
  const [timelineCache, setTimelineCache] = useState<Record<string, TimelineEntry[]>>({});
  const [studentsCache, setStudentsCache] = useState<Record<string, StudentLite[]>>({});

  // Modals & Forms State
  const [showOnboard, setShowOnboard] = useState(false);
  const [editingCoach, setEditingCoach] = useState<CoachItem | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  // Actions menu (3-dot kebab) — same pattern as admin/announcements
  const [openMenuCoachId, setOpenMenuCoachId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number; openUp: boolean } | null>(null);

  // Pagination — keeps the roster table to a fixed height instead of an
  // ever-growing scroll as the coach list grows.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Table sorting — clicking a header toggles asc/desc; clicking a new column resets to asc.
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Reason modal (Reject/Pause/Suspend/Archive/Request Documents)
  const [reasonModal, setReasonModal] = useState<ReasonModalState | null>(null);
  const [reasonText, setReasonText] = useState('');

  // New note draft (Notes tab)
  const [newNote, setNewNote] = useState('');

  // Assign-to-batch draft (Schedule & Batches tab)
  const [assignBatchId, setAssignBatchId] = useState('');

  // Upload/Verification dialog states
  const [uploadingDocType, setUploadingDocType] = useState<string>('Government ID');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);

  // Payout calculation form states
  const [payrollPeriod, setPayrollPeriod] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
    incentives: 0,
    deductions: 0
  });

  // Rating and review generator state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    discipline: 5,
    communication: 5,
    studentFeedback: 5,
    attendance: 5,
    teachingQuality: 5,
    professionalism: 5,
    comments: ''
  });

  // ── Filters ──
  const [statusFilter, setStatusFilter] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [minExperience, setMinExperience] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sportFilter, cityFilter, languageFilter, minExperience, pageSize]);

  const loadCoaches = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', userId).single();
      const tid = profile?.tenant_id;
      setTenantId(tid);

      const res = await fetch('/api/v1/coaches?includeInactive=true');
      if (!res.ok) throw new Error('API fetch failed');
      const data = await res.json();
      setCoaches(data.data || []);

      const { data: batchData } = await supabase
        .from('batches')
        .select('id, name, start_time, end_time, days_of_week, class:classes(name)')
        .eq('tenant_id', tid)
        .eq('is_active', true)
        .order('name', { ascending: true });

      setBatches((batchData ?? []).map((b: any) => ({
        ...b,
        class: Array.isArray(b.class) ? b.class[0] ?? null : b.class,
      })));

      const statsRes = await fetch('/api/v1/coaches/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.data ?? null);
      }
    } catch (err: any) {
      console.error(err);
      toastMessage(`Failed to load: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadCoaches();
  }, [loadCoaches]);

  // Dynamic tab cache loaders
  const loadDocCache = async (coachId: string) => {
    try {
      const res = await fetch(`/api/v1/coaches/documents?coachId=${coachId}`);
      if (res.ok) {
        const data = await res.json();
        setDocCache(prev => ({ ...prev, [coachId]: data.data || [] }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadPayoutCache = async (coachId: string) => {
    try {
      const res = await fetch(`/api/v1/coaches/payroll?coachId=${coachId}`);
      if (res.ok) {
        const data = await res.json();
        setPayoutCache(prev => ({ ...prev, [coachId]: data.data || [] }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadAvailCache = async (coachId: string) => {
    try {
      const res = await fetch(`/api/v1/coaches/availability?coachId=${coachId}`);
      if (res.ok) {
        const data = await res.json();
        setAvailCache(prev => ({ ...prev, [coachId]: data.data || [] }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadNoteCache = async (coachId: string) => {
    try {
      const res = await fetch(`/api/v1/coaches/notes?coachId=${coachId}`);
      if (res.ok) {
        const data = await res.json();
        setNoteCache(prev => ({ ...prev, [coachId]: data.data || [] }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadTimelineCache = async (coachId: string) => {
    try {
      const res = await fetch(`/api/v1/coaches/audit-log?coachId=${coachId}`);
      if (res.ok) {
        const data = await res.json();
        setTimelineCache(prev => ({ ...prev, [coachId]: data.data || [] }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadStudentsCache = async (coach: CoachItem) => {
    try {
      const batchIds = Array.from(new Set(coach.batch_assignments.map(a => a.batch?.id).filter(Boolean)));
      if (batchIds.length === 0) {
        setStudentsCache(prev => ({ ...prev, [coach.id]: [] }));
        return;
      }
      const results = await Promise.all(
        batchIds.map(batchId => fetch(`/api/v1/students?batchId=${batchId}`).then(r => r.ok ? r.json() : { data: [] }))
      );
      const merged = new Map<string, StudentLite>();
      results.forEach(r => (r.data ?? []).forEach((s: any) => merged.set(s.id, { id: s.id, first_name: s.first_name, last_name: s.last_name })));
      setStudentsCache(prev => ({ ...prev, [coach.id]: Array.from(merged.values()) }));
    } catch (e) {
      console.error(e);
    }
  };

  const selectCoach = (coach: CoachItem) => {
    setSelectedCoachId(coach.id);
    setOpenMenuCoachId(null);
  };

  const openDrawer = (coach: CoachItem) => {
    setDrawerCoachId(coach.id);
    setActiveTab('overview');
    setOpenMenuCoachId(null);
  };

  const handleTabChange = (coach: CoachItem, tab: string) => {
    setActiveTab(tab);
    if (tab === 'documents') loadDocCache(coach.id);
    if (tab === 'payroll') loadPayoutCache(coach.id);
    if (tab === 'schedule') loadAvailCache(coach.id);
    if (tab === 'notes') loadNoteCache(coach.id);
    if (tab === 'timeline') loadTimelineCache(coach.id);
    if (tab === 'students') loadStudentsCache(coach);
  };

  // ── Document Operations ──
  const handleDocUpload = async (coachId: string) => {
    if (!docFile) return;
    setFormLoading(true);
    try {
      const ext = docFile.name.split('.').pop();
      const path = `coach-documents/doc_${coachId}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('coach-documents')
        .upload(path, docFile, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('coach-documents').getPublicUrl(path);

      const res = await fetch('/api/v1/coaches/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId,
          documentType: uploadingDocType,
          documentName: docFile.name,
          fileUrl: urlData.publicUrl,
        })
      });

      if (!res.ok) throw new Error('API save failed');
      toastMessage('Document uploaded. Verification pending.');
      setDocFile(null);
      await loadDocCache(coachId);
    } catch (e: any) {
      toastMessage(e.message ?? 'Upload failed', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  const verifyDocument = async (coachId: string, docId: string, status: 'Verified' | 'Rejected', reason?: string) => {
    try {
      const res = await fetch('/api/v1/coaches/documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId, status, rejectionReason: reason })
      });
      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.error ?? errBody.message ?? 'Update failed');
      }
      toastMessage(`Document ${status.toLowerCase()} successfully.`);
      setRejectingDocId(null);
      setRejectionReason('');
      await loadDocCache(coachId);
    } catch (e: any) {
      toastMessage(e.message, 'error');
    }
  };

  // ── Coach lifecycle actions ──
  const runCoachAction = async (coachId: string, body: Record<string, unknown>, successMsg: string) => {
    try {
      const res = await fetch('/api/v1/coaches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId, ...body }),
      });
      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.error ?? errBody.message ?? 'Action failed');
      }
      toastMessage(successMsg);
      await loadCoaches();
      return true;
    } catch (err: any) {
      toastMessage(err.message, 'error');
      return false;
    }
  };

  const handleApprove = (coach: CoachItem) => runCoachAction(coach.id, { action: 'approve' }, 'Coach approved and activated.');
  const handleResume = (coach: CoachItem) => runCoachAction(coach.id, { action: 'reactivate' }, 'Coach resumed to Active.');
  const handleDeactivate = (coach: CoachItem) => runCoachAction(coach.id, { action: 'deactivate' }, 'Coach deactivated.');
  const handleResetPassword = (coach: CoachItem) => {
    setOpenMenuCoachId(null);
    runCoachAction(coach.id, { action: 'reset-password' }, 'Password reset email triggered.');
  };
  const handleSendReminder = (coach: CoachItem) => {
    setOpenMenuCoachId(null);
    runCoachAction(
      coach.id,
      { action: 'request-documents', documentRequestNote: `Reminder logged for ${coach.first_name} ${coach.last_name} to complete onboarding.` },
      'Reminder logged (in-app only — no email/SMS provider configured).'
    );
  };

  const submitReasonModal = async () => {
    if (!reasonModal) return;
    const reason = reasonText.trim();
    if (!reason) return;
    const { coach, kind } = reasonModal;
    const fieldByKind: Record<ReasonModalState['kind'], string> = {
      reject: 'rejectionReason',
      pause: 'pauseReason',
      suspend: 'suspendReason',
      archive: 'archiveReason',
      'request-documents': 'documentRequestNote',
    };
    const actionByKind: Record<ReasonModalState['kind'], string> = {
      reject: 'reject',
      pause: 'pause',
      suspend: 'suspend',
      archive: 'archive',
      'request-documents': 'request-documents',
    };
    const successMsg: Record<ReasonModalState['kind'], string> = {
      reject: 'Coach application rejected.',
      pause: 'Coach paused.',
      suspend: 'Coach suspended.',
      archive: 'Coach archived.',
      'request-documents': 'Document request logged.',
    };
    const ok = await runCoachAction(coach.id, { action: actionByKind[kind], [fieldByKind[kind]]: reason }, successMsg[kind]);
    if (ok) {
      setReasonModal(null);
      setReasonText('');
    }
  };

  const handleAddNote = async (coachId: string) => {
    const note = newNote.trim();
    if (!note) return;
    try {
      const res = await fetch('/api/v1/coaches/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId, note }),
      });
      if (!res.ok) throw new Error('Failed to add note');
      setNewNote('');
      await loadNoteCache(coachId);
    } catch (e: any) {
      toastMessage(e.message, 'error');
    }
  };

  const handleAssignBatch = async (coachId: string) => {
    if (!assignBatchId) return;
    try {
      const res = await fetch('/api/v1/coaches/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId, batchId: assignBatchId }),
      });
      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.error ?? errBody.message ?? 'Assignment failed');
      }
      toastMessage('Batch assigned.');
      setAssignBatchId('');
      await loadCoaches();
    } catch (e: any) {
      toastMessage(e.message, 'error');
    }
  };

  // ── Payouts recalculator ──
  const triggerRecalculate = async (coachId: string) => {
    setFormLoading(true);
    try {
      const res = await fetch('/api/v1/coaches/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId,
          periodStart: payrollPeriod.start,
          periodEnd: payrollPeriod.end,
          incentives: payrollPeriod.incentives,
          deductions: payrollPeriod.deductions
        })
      });
      if (!res.ok) throw new Error('Failed compilation');
      toastMessage('Payroll recalculated successfully!');
      await loadPayoutCache(coachId);
    } catch (e: any) {
      toastMessage(e.message, 'error');
    } finally {
      setFormLoading(false);
    }
  };

  // ── Ratings Submit ──
  const submitCoachReview = async (coachId: string) => {
    setFormLoading(true);
    try {
      const overall = ((reviewForm.discipline + reviewForm.communication + reviewForm.studentFeedback +
        reviewForm.attendance + reviewForm.teachingQuality + reviewForm.professionalism) / 6).toFixed(2);

      const { error } = await supabase.from('coach_reviews').insert({
        coach_id: coachId,
        tenant_id: tenantId,
        rated_by: (await supabase.auth.getUser()).data.user?.id,
        discipline: reviewForm.discipline,
        communication: reviewForm.communication,
        student_feedback: reviewForm.studentFeedback,
        attendance: reviewForm.attendance,
        teaching_quality: reviewForm.teachingQuality,
        professionalism: reviewForm.professionalism,
        overall_rating: Number(overall),
        review_period: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
        comments: reviewForm.comments
      });

      if (error) throw error;
      toastMessage('Monthly performance score locked!');
      setShowReviewModal(false);
      await loadCoaches();
    } catch (e: any) {
      toastMessage(e.message, 'error');
    } finally {
      setFormLoading(false);
    }
  };

  // ── Computed: filters + derived stats ──
  const allLanguages = Array.from(new Set(coaches.flatMap(c => c.coach_profile?.languages_known ?? []))).sort();
  const allCities = Array.from(new Set(coaches.map(c => c.coach_profile?.city).filter(Boolean) as string[])).sort();
  const allSports = Array.from(new Set(coaches.flatMap(c => c.coach_profile?.coach_categories.map(cc => cc.subcategory?.category?.name).filter(Boolean) ?? []))).sort() as string[];

  const filteredCoaches = coaches.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.coach_profile?.coach_categories ?? []).some(cc => (cc.subcategory?.name ?? '').toLowerCase().includes(q));
    if (!matchesSearch) return false;

    const p = c.coach_profile;
    if (statusFilter && p?.account_status !== statusFilter) return false;
    if (sportFilter && !p?.coach_categories.some(cc => cc.subcategory?.category?.name === sportFilter)) return false;
    if (cityFilter && p?.city !== cityFilter) return false;
    if (languageFilter && !p?.languages_known.includes(languageFilter)) return false;
    if (minExperience && (p?.experience_years ?? 0) < Number(minExperience)) return false;
    return true;
  });

  const getExpertiseName = (c: CoachItem) =>
    c.coach_profile?.coach_categories?.find(cc => cc.is_primary)?.subcategory?.category?.name
      ?? c.coach_profile?.coach_categories?.find(cc => cc.is_primary)?.subcategory?.name ?? '';

  const sortedCoaches = sortKey ? [...filteredCoaches].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name':
        cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
        break;
      case 'expertise':
        cmp = getExpertiseName(a).localeCompare(getExpertiseName(b));
        break;
      case 'experience':
        cmp = (a.coach_profile?.experience_years ?? 0) - (b.coach_profile?.experience_years ?? 0);
        break;
      case 'city':
        cmp = (a.coach_profile?.city ?? '').localeCompare(b.coach_profile?.city ?? '');
        break;
      case 'joining_date':
        cmp = (a.coach_profile?.joining_date ?? '').localeCompare(b.coach_profile?.joining_date ?? '');
        break;
      case 'status':
        cmp = getStatusDisplay(a.coach_profile?.account_status ?? 'Inactive').label.localeCompare(getStatusDisplay(b.coach_profile?.account_status ?? 'Inactive').label);
        break;
      case 'profile':
        cmp = computeCompletion(a, docCache[a.id]).pct - computeCompletion(b, docCache[b.id]).pct;
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  }) : filteredCoaches;

  const totalPages = Math.max(1, Math.ceil(sortedCoaches.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedCoaches = sortedCoaches.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const needsActionCount = coaches.filter((c) => PENDING_STATUSES.includes(c.coach_profile?.account_status ?? '')).length;
  const verificationReadyCount = coaches.filter((c) => c.coach_profile?.account_status === 'Pending Verification').length;
  const todayDow = ((new Date().getDay() + 6) % 7) + 1; // JS 0=Sun -> our 1=Mon..7=Sun
  const activeTodayCount = coaches.filter((c) =>
    c.coach_profile?.account_status === 'Active' &&
    c.batch_assignments.some(a => a.batch?.days_of_week?.includes(todayDow))
  ).length;
  const activeTotalCount = coaches.filter((c) => c.coach_profile?.account_status === 'Active').length;
  const incompleteProfilesCount = coaches.filter((c) => computeCompletion(c, docCache[c.id]).pct < 100).length;

  // Only real, derivable deltas are shown — no fabricated "vs last week" numbers.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const newThisWeekCount = coaches.filter((c) => (c.coach_profile?.joining_date ?? '') >= sevenDaysAgo).length;

  const drawerCoach = coaches.find(c => c.id === drawerCoachId) ?? null;

  // ── Actions menu item visibility per current status (plan §7g) ──
  const getMenuActions = (coach: CoachItem) => {
    const status = coach.coach_profile?.account_status ?? '';
    const items: { key: string; label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[] = [
      { key: 'view', label: 'View Profile', icon: <Eye className="w-3.5 h-3.5" />, onClick: () => selectCoach(coach) },
      { key: 'edit', label: 'Edit', icon: <Edit2 className="w-3.5 h-3.5" />, onClick: () => { setEditingCoach(coach); setOpenMenuCoachId(null); } },
    ];
    if (['Onboarding', 'Document Upload Pending', 'Pending Verification', 'Rejected', 'Inactive', 'Suspended', 'Terminated', 'Archived'].includes(status) && hasGovtIdDocument(coach)) {
      items.push({ key: 'approve', label: 'Approve', icon: <FileCheck className="w-3.5 h-3.5 text-emerald-400" />, onClick: () => { setOpenMenuCoachId(null); handleApprove(coach); } });
    }
    if (PENDING_STATUSES.includes(status)) {
      items.push({ key: 'reject', label: 'Reject', icon: <X className="w-3.5 h-3.5 text-rose-400" />, onClick: () => { setOpenMenuCoachId(null); setReasonModal({ coach, kind: 'reject' }); }, danger: true });
      items.push({ key: 'request-docs', label: 'Request Documents', icon: <FileWarning className="w-3.5 h-3.5" />, onClick: () => { setOpenMenuCoachId(null); setReasonModal({ coach, kind: 'request-documents' }); } });
      items.push({ key: 'remind', label: 'Send Reminder', icon: <BellRing className="w-3.5 h-3.5" />, onClick: () => handleSendReminder(coach) });
    }
    items.push({ key: 'reset-pw', label: 'Reset Password', icon: <KeyRound className="w-3.5 h-3.5" />, onClick: () => handleResetPassword(coach) });
    if (status === 'Active') {
      items.push({ key: 'assign', label: 'Assign Batches', icon: <CalendarPlus className="w-3.5 h-3.5" />, onClick: () => { openDrawer(coach); handleTabChange(coach, 'schedule'); } });
      items.push({ key: 'pause', label: 'Pause', icon: <PauseCircle className="w-3.5 h-3.5 text-amber-400" />, onClick: () => { setOpenMenuCoachId(null); setReasonModal({ coach, kind: 'pause' }); } });
      items.push({ key: 'suspend', label: 'Suspend', icon: <Ban className="w-3.5 h-3.5 text-red-400" />, onClick: () => { setOpenMenuCoachId(null); setReasonModal({ coach, kind: 'suspend' }); } });
      items.push({ key: 'deactivate', label: 'Deactivate', icon: <X className="w-3.5 h-3.5 text-red-400" />, onClick: () => { setOpenMenuCoachId(null); handleDeactivate(coach); }, danger: true });
    }
    if (status === 'Paused') {
      items.push({ key: 'resume', label: 'Resume', icon: <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />, onClick: () => { setOpenMenuCoachId(null); handleResume(coach); } });
      items.push({ key: 'suspend', label: 'Suspend', icon: <Ban className="w-3.5 h-3.5 text-red-400" />, onClick: () => { setOpenMenuCoachId(null); setReasonModal({ coach, kind: 'suspend' }); } });
      items.push({ key: 'deactivate', label: 'Deactivate', icon: <X className="w-3.5 h-3.5 text-red-400" />, onClick: () => { setOpenMenuCoachId(null); handleDeactivate(coach); }, danger: true });
    }
    if (status === 'Suspended') {
      items.push({ key: 'resume', label: 'Resume', icon: <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />, onClick: () => { setOpenMenuCoachId(null); handleResume(coach); } });
    }
    if (status !== 'Archived') {
      items.push({ key: 'archive', label: 'Archive', icon: <Archive className="w-3.5 h-3.5" />, onClick: () => { setOpenMenuCoachId(null); setReasonModal({ coach, kind: 'archive' }); }, danger: true });
    }
    return items;
  };

  // ── Quick View panel's 2x2 action grid — up to 4 slots, adapted to the
  // coach's current status so every button is always a valid transition.
  const getQuickActions = (coach: CoachItem) => {
    const status = coach.coach_profile?.account_status ?? '';
    const actions: { key: string; label: string; icon: React.ReactNode; accent: string; onClick: () => void }[] = [];
    if (PENDING_STATUSES.includes(status)) {
      if (hasGovtIdDocument(coach)) {
        actions.push({ key: 'approve', label: 'Approve Coach', icon: <FileCheck className="w-4 h-4" />, accent: 'bg-emerald-500/10 text-emerald-400', onClick: () => handleApprove(coach) });
      }
      actions.push({ key: 'request-docs', label: 'Request Documents', icon: <FileWarning className="w-4 h-4" />, accent: 'bg-orange-500/10 text-orange-400', onClick: () => setReasonModal({ coach, kind: 'request-documents' }) });
      actions.push({ key: 'remind', label: 'Send Message', icon: <MessageSquare className="w-4 h-4" />, accent: 'bg-purple-500/10 text-purple-400', onClick: () => handleSendReminder(coach) });
    } else if (status === 'Active') {
      actions.push({ key: 'pause', label: 'Pause Coach', icon: <PauseCircle className="w-4 h-4" />, accent: 'bg-amber-500/10 text-amber-400', onClick: () => setReasonModal({ coach, kind: 'pause' }) });
      actions.push({ key: 'assign', label: 'Assign Batches', icon: <CalendarPlus className="w-4 h-4" />, accent: 'bg-indigo-500/10 text-indigo-400', onClick: () => { openDrawer(coach); handleTabChange(coach, 'schedule'); } });
      actions.push({ key: 'reset-pw', label: 'Reset Password', icon: <KeyRound className="w-4 h-4" />, accent: 'bg-purple-500/10 text-purple-400', onClick: () => handleResetPassword(coach) });
    } else if (status === 'Paused' || status === 'Suspended') {
      actions.push({ key: 'resume', label: 'Resume Coach', icon: <PlayCircle className="w-4 h-4" />, accent: 'bg-emerald-500/10 text-emerald-400', onClick: () => handleResume(coach) });
      actions.push({ key: 'deactivate', label: 'Deactivate', icon: <Ban className="w-4 h-4" />, accent: 'bg-red-500/10 text-red-400', onClick: () => handleDeactivate(coach) });
      actions.push({ key: 'reset-pw', label: 'Reset Password', icon: <KeyRound className="w-4 h-4" />, accent: 'bg-purple-500/10 text-purple-400', onClick: () => handleResetPassword(coach) });
    } else {
      if (hasGovtIdDocument(coach)) {
        actions.push({ key: 'approve', label: 'Reactivate', icon: <FileCheck className="w-4 h-4" />, accent: 'bg-emerald-500/10 text-emerald-400', onClick: () => handleApprove(coach) });
      }
      actions.push({ key: 'reset-pw', label: 'Reset Password', icon: <KeyRound className="w-4 h-4" />, accent: 'bg-purple-500/10 text-purple-400', onClick: () => handleResetPassword(coach) });
    }
    actions.push({ key: 'view-full', label: 'View Profile', icon: <Eye className="w-4 h-4" />, accent: 'bg-white/5 text-slate-300', onClick: () => openDrawer(coach) });
    return actions.slice(0, 4);
  };

  const activeFilterCount = [statusFilter, sportFilter, cityFilter, languageFilter, minExperience].filter(Boolean).length;

  const selectedCoach = coaches.find(c => c.id === selectedCoachId) ?? null;

  return (
    <div className="min-h-screen bg-[#060814] text-slate-100 p-6 lg:p-8 space-y-6 animate-in fade-in duration-300">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Coach Management</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Manage onboarding, verification, and performance of all coaches.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 flex items-center gap-2 transition-all duration-150"
          >
            <Link2 className="w-4 h-4" />
            Generate Invite URL
          </button>
          <button
            onClick={() => setShowOnboard(true)}
            className="btn-premium flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Onboard New Coach
          </button>
        </div>
      </div>

      {/* ── Stats Grid (6 cards) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={<Users className="w-4 h-4 text-indigo-400" />} label="Total Coaches" value={loading ? '—' : coaches.length} accent="bg-indigo-500/10 border border-indigo-500/20"
          trend={loading ? undefined : newThisWeekCount > 0 ? { text: `${newThisWeekCount} this week`, direction: 'up' } : { text: 'No new coaches this week', direction: 'flat' }} />
        <StatCard icon={<AlertCircle className="w-4 h-4 text-rose-400" />} label="Needs Action" value={loading ? '—' : needsActionCount} accent="bg-rose-500/10 border border-rose-500/20"
          trend={loading ? undefined : { text: verificationReadyCount > 0 ? `${verificationReadyCount} ready for review` : 'None ready for review', direction: 'flat' }} />
        <StatCard icon={<FileText className="w-4 h-4 text-orange-400" />} label="Pending Documents" value={loading || !stats ? '—' : stats.pendingDocVerificationCount} accent="bg-orange-500/10 border border-orange-500/20"
          trend={loading || !stats ? undefined : { text: stats.expiringDocsCount > 0 ? `${stats.expiringDocsCount} expiring soon` : 'None expiring soon', direction: 'flat' }} />
        <StatCard icon={<ShieldAlert className="w-4 h-4 text-amber-400" />} label="Pending Verification" value={loading ? '—' : verificationReadyCount} accent="bg-amber-500/10 border border-amber-500/20"
          trend={loading ? undefined : verificationReadyCount > 0 ? { text: 'Awaiting admin decision', direction: 'flat' } : { text: 'No change', direction: 'flat' }} />
        <StatCard icon={<Activity className="w-4 h-4 text-emerald-400" />} label="Today's Active" value={loading ? '—' : activeTodayCount} accent="bg-emerald-500/10 border border-emerald-500/20"
          trend={loading ? undefined : { text: `of ${activeTotalCount} active coaches`, direction: 'flat' }} />
        <StatCard icon={<CreditCard className="w-4 h-4 text-indigo-400" />} label="Payout Pending" value={loading || !stats ? '—' : `₹${stats.pendingPayoutTotal.toLocaleString('en-IN')}`} accent="bg-indigo-500/10 border border-indigo-500/20"
          trend={loading || !stats ? undefined : stats.pendingPayoutCoachCount > 0 ? { text: `${stats.pendingPayoutCoachCount} coach${stats.pendingPayoutCoachCount === 1 ? '' : 'es'}`, direction: 'flat' } : { text: 'No pending payouts', direction: 'flat' }} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          {/* ── Filters bar ── */}
          <div className="glass-panel rounded-2xl border border-white/5 p-3.5 space-y-2.5">
            {/* Row 1: search, full width */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search coaches by name, email, or skill..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="glass-input rounded-xl pl-9 pr-4 py-2 text-sm w-full"
              />
            </div>

            {/* Row 2: dropdown filters (left) + Clear (right) */}
            <div className="flex flex-wrap gap-2 items-center">
              <CustomSelect value={statusFilter} onChange={setStatusFilter} placeholder="Status" className="w-36" active={!!statusFilter}
                options={Object.keys(STATUS_DISPLAY).map(s => ({ value: s, label: STATUS_DISPLAY[s].label }))} />
              <CustomSelect value={sportFilter} onChange={setSportFilter} placeholder="Sport" className="w-32" active={!!sportFilter}
                options={allSports.map(s => ({ value: s, label: s }))} />
              <CustomSelect value={cityFilter} onChange={setCityFilter} placeholder="City" className="w-32" active={!!cityFilter}
                options={allCities.map(c => ({ value: c, label: c }))} />
              <button
                onClick={() => setShowMoreFilters(v => !v)}
                className="px-2.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white border border-white/10 bg-white/5 hover:bg-white/10 flex items-center gap-1"
              >
                More Filters <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
              </button>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setStatusFilter(''); setSportFilter(''); setCityFilter(''); setLanguageFilter(''); setMinExperience(''); }}
                  className="ml-auto px-2.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Clear all
                </button>
              )}
            </div>

            {/* Active-filter chips — each is individually removable */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {statusFilter && (
                  <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                    Status: {STATUS_DISPLAY[statusFilter]?.label ?? statusFilter}
                    <button onClick={() => setStatusFilter('')} className="hover:text-white"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {sportFilter && (
                  <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                    Sport: {sportFilter}
                    <button onClick={() => setSportFilter('')} className="hover:text-white"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {cityFilter && (
                  <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                    City: {cityFilter}
                    <button onClick={() => setCityFilter('')} className="hover:text-white"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {languageFilter && (
                  <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                    Language: {languageFilter}
                    <button onClick={() => setLanguageFilter('')} className="hover:text-white"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {minExperience && (
                  <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                    Min Exp: {minExperience}+ yrs
                    <button onClick={() => setMinExperience('')} className="hover:text-white"><X className="w-3 h-3" /></button>
                  </span>
                )}
              </div>
            )}

            {showMoreFilters && (
              <div className="flex flex-wrap gap-2 items-center pt-2.5 border-t border-white/5">
                <CustomSelect value={languageFilter} onChange={setLanguageFilter} placeholder="Language" className="w-32" active={!!languageFilter}
                  options={allLanguages.map(l => ({ value: l, label: l }))} />
                <input type="number" min={0} placeholder="Min Exp (yrs)" value={minExperience} onChange={(e) => setMinExperience(e.target.value)} className="glass-input rounded-xl px-3 py-2 text-xs w-28" />
              </div>
            )}
          </div>

          {/* ── Coach Directory Panel ── */}
          <div id="coach-roster-table" className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                <span>Loading coaches...</span>
              </div>
            ) : filteredCoaches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
                <ShieldAlert className="w-10 h-10 text-slate-700" />
                <p className="text-sm">No coaches match the current filters.</p>
              </div>
            ) : (
              <div>
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[11%]" />
                    <col className="w-[8%]" />
                    <col className="w-[9%]" />
                    <col className="w-[10%]" />
                    <col className="w-[16%]" />
                    <col className="w-[12%]" />
                    <col className="w-[4%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-white/5 bg-slate-950/20">
                      {([
                        { key: 'name', label: 'Coach' },
                        { key: 'expertise', label: 'Expertise' },
                        { key: 'experience', label: 'Experience' },
                        { key: 'city', label: 'City' },
                        { key: 'joining_date', label: 'Joining Date' },
                        { key: 'status', label: 'Status' },
                        { key: 'profile', label: 'Profile' },
                      ] as const).map(col => (
                        <th key={col.key} className="text-left text-[11px] font-semibold text-slate-400 tracking-wide px-3 py-2.5">
                          <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-slate-200 transition-colors">
                            {col.label}
                            {sortKey === col.key ? (
                              sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />
                            ) : (
                              <ArrowUp className="w-3 h-3 opacity-20" />
                            )}
                          </button>
                        </th>
                      ))}
                      <th className="text-left text-[11px] font-semibold text-slate-400 tracking-wide px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCoaches.map((coach) => {
                      const completion = computeCompletion(coach, docCache[coach.id]);
                      const isSelected = selectedCoachId === coach.id;
                      const sportIcon = coach.coach_profile?.coach_categories?.find(cc => cc.is_primary)?.subcategory?.category?.icon;
                      return (
                        <tr
                          key={coach.id}
                          onClick={() => selectCoach(coach)}
                          className={`border-b border-white/5 cursor-pointer transition-all ${isSelected ? 'bg-indigo-500/5' : 'hover:bg-white/[0.02]'}`}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <AvatarCircle url={coach.avatar_url} first={coach.first_name} last={coach.last_name} size="sm" />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-100 text-xs truncate" title={`${coach.first_name} ${coach.last_name}`}>{coach.first_name} {coach.last_name}</p>
                                <p className="text-slate-400 text-[11px] truncate" title={coach.email}>{coach.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-300">
                            <span className="flex items-center gap-1.5 min-w-0" title={getExpertiseName(coach) || undefined}>
                              {sportIcon && <span className="text-sm leading-none shrink-0">{sportIcon}</span>}
                              <span className="truncate">{getExpertiseName(coach) || '—'}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-300 truncate">{coach.coach_profile?.experience_years} Years</td>
                          <td className="px-3 py-2.5 text-xs text-slate-300 truncate" title={coach.coach_profile?.city ?? undefined}>{coach.coach_profile?.city ?? '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-300 truncate">
                            {coach.coach_profile?.joining_date ? new Date(coach.coach_profile.joining_date).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusChip status={coach.coach_profile?.account_status ?? 'Inactive'} dotOnly />
                          </td>
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <CompletionBar pct={completion.pct} items={completion.items} />
                          </td>
                          <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => {
                                if (openMenuCoachId === coach.id) {
                                  setOpenMenuCoachId(null);
                                  return;
                                }
                                const rect = e.currentTarget.getBoundingClientRect();
                                const openUp = rect.bottom + 240 > window.innerHeight;
                                setMenuPos({ top: openUp ? rect.top : rect.bottom, right: window.innerWidth - rect.right, openUp });
                                setOpenMenuCoachId(coach.id);
                              }}
                              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openMenuCoachId === coach.id && menuPos && (
                              <>
                                <div className="fixed inset-0 z-30" onClick={() => setOpenMenuCoachId(null)} />
                                <div
                                  className="fixed w-56 bg-slate-900 border border-white/10 rounded-xl py-1 z-40 shadow-2xl animate-in fade-in duration-150"
                                  style={{
                                    right: menuPos.right,
                                    top: menuPos.openUp ? undefined : menuPos.top + 4,
                                    bottom: menuPos.openUp ? window.innerHeight - menuPos.top + 4 : undefined,
                                  }}
                                >
                                  {getMenuActions(coach).map(item => (
                                    <button
                                      key={item.key}
                                      onClick={item.onClick}
                                      className={`w-full px-3 py-1.5 text-left text-xs font-medium flex items-center gap-2 whitespace-nowrap hover:bg-white/5 ${
                                        item.danger ? 'text-rose-400 hover:text-rose-300' : 'text-slate-300 hover:text-white'
                                      }`}
                                    >
                                      {item.icon} {item.label}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <span>
                Showing {filteredCoaches.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredCoaches.length)} of {filteredCoaches.length} coaches
              </span>
              <div className="flex items-center gap-3">
                <CustomSelect
                  value={String(pageSize)}
                  onChange={(v) => setPageSize(Number(v))}
                  className="w-32"
                  options={[{ value: '10', label: '10 per page' }, { value: '25', label: '25 per page' }, { value: '50', label: '50 per page' }]}
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === 'ellipsis' ? (
                        <span key={`e${i}`} className="px-1 text-slate-600">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                            p === currentPage ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-300' : 'text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column: Quick View (selected coach) or Today's Tasks ── */}
        <div className="hidden xl:block sticky top-6 space-y-4">
          {selectedCoach ? (
            <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-5 border-b border-white/10 flex items-start justify-between">
                <div>
                  <p className="font-bold text-slate-100 text-sm">{selectedCoach.first_name} {selectedCoach.last_name}</p>
                  <div className="mt-1.5"><StatusChip status={selectedCoach.coach_profile?.account_status ?? 'Inactive'} /></div>
                </div>
                <button onClick={() => setSelectedCoachId(null)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <AvatarCircle url={selectedCoach.avatar_url} first={selectedCoach.first_name} last={selectedCoach.last_name} size="lg" />
                  <div className="min-w-0">
                    <p className="text-slate-100 text-sm font-semibold flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                      {selectedCoach.coach_profile?.coach_categories?.find(cc => cc.is_primary)?.subcategory?.name ?? '—'}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-slate-400">
                  <p className="flex items-center gap-1.5 truncate"><Mail className="w-3.5 h-3.5 shrink-0" /> {selectedCoach.email}</p>
                  {selectedCoach.phone && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 shrink-0" /> {selectedCoach.phone}</p>}
                  {selectedCoach.coach_profile?.city && (
                    <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 shrink-0" /> {[selectedCoach.coach_profile.city, selectedCoach.coach_profile.state].filter(Boolean).join(', ')}</p>
                  )}
                </div>
              </div>

              <div className="p-5 space-y-3 border-b border-white/10">
                {(() => {
                  const completion = computeCompletion(selectedCoach, docCache[selectedCoach.id]);
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-indigo-400 uppercase tracking-wide">Profile Completion</p>
                        <span className="text-xs font-bold text-slate-100">{completion.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${completion.pct === 100 ? 'bg-emerald-400' : completion.pct >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${completion.pct}%` }} />
                      </div>
                      <div className="space-y-1.5 pt-1">
                        {completion.items.map(i => (
                          <div key={i.label} className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">{i.label}</span>
                            <span className={`font-semibold ${i.done ? 'text-emerald-400' : 'text-amber-400'}`}>{i.done ? 'Completed' : 'Pending'}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="p-5 space-y-3">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-wide">Quick Actions</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {getQuickActions(selectedCoach).map(action => (
                    <button
                      key={action.key}
                      onClick={action.onClick}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-white/5 hover:border-white/20 hover:bg-white/5 transition-all"
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center ${action.accent}`}>{action.icon}</span>
                      <span className="text-[10px] font-semibold text-slate-300 text-center leading-tight">{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-5 pt-0">
                <button
                  onClick={() => openDrawer(selectedCoach)}
                  className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  View Full Profile <PanelRightClose className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-2xl border border-white/5 p-5 space-y-4">
              <h3 className="text-slate-100 font-semibold text-sm flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-indigo-400" /> Today's Tasks
              </h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center p-2.5 rounded-xl bg-white/[0.02]">
                  <span className="text-slate-400">Approve Coaches</span>
                  <span className="font-bold text-rose-400">{needsActionCount}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 rounded-xl bg-white/[0.02]">
                  <span className="text-slate-400">Verify Documents</span>
                  <span className="font-bold text-amber-400">{stats?.pendingDocVerificationCount ?? '—'}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 rounded-xl bg-white/[0.02]">
                  <span className="text-slate-400">Renew Certificates</span>
                  <span className="font-bold text-orange-400">{stats?.expiringDocsCount ?? '—'}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 rounded-xl bg-white/[0.02]">
                  <span className="text-slate-400">Bank Verification</span>
                  <span className="font-bold text-purple-400">{stats?.missingBankDetailsCount ?? '—'}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 pt-1">Select a coach from the table to see their quick-view profile here.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Right-hand Drawer (replaces inline row expansion) ── */}
      {drawerCoach && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerCoachId(null)} />
          <div className="relative w-full max-w-2xl h-full bg-[#0a0d1c] border-l border-white/10 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="sticky top-0 z-10 bg-[#0a0d1c]/95 backdrop-blur border-b border-white/10 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AvatarCircle url={drawerCoach.avatar_url} first={drawerCoach.first_name} last={drawerCoach.last_name} size="lg" />
                <div>
                  <p className="font-bold text-slate-100">{drawerCoach.first_name} {drawerCoach.last_name}</p>
                  <p className="text-slate-400 text-xs">{drawerCoach.email}</p>
                  <div className="mt-1"><StatusChip status={drawerCoach.coach_profile?.account_status ?? 'Inactive'} /></div>
                </div>
              </div>
              <button onClick={() => setDrawerCoachId(null)} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white">
                <PanelRightClose className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Tabs Navigator */}
              <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
                {[
                  { key: 'overview', label: 'Overview' },
                  { key: 'documents', label: 'Mandatory Documents' },
                  { key: 'schedule', label: 'Schedule & Batches' },
                  { key: 'payroll', label: 'Payroll & Bank' },
                  { key: 'reviews', label: 'Performance Reviews' },
                  { key: 'timeline', label: 'Timeline' },
                  { key: 'notes', label: 'Notes' },
                  { key: 'students', label: 'Students' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(drawerCoach, tab.key)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      activeTab === tab.key
                        ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* TAB: Overview */}
              {activeTab === 'overview' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {drawerCoach.coach_profile?.status_reason && ['Rejected', 'Paused', 'Suspended', 'Archived'].includes(drawerCoach.coach_profile.account_status) && (
                    <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                      drawerCoach.coach_profile.account_status === 'Paused'
                        ? 'border-amber-500/20 bg-amber-500/5 text-amber-300'
                        : 'border-rose-500/20 bg-rose-500/5 text-rose-300'
                    }`}>
                      <span className="font-bold uppercase tracking-wide text-[10px] block mb-1">{drawerCoach.coach_profile.account_status} Reason</span>
                      {drawerCoach.coach_profile.status_reason}
                    </div>
                  )}
                  {drawerCoach.coach_profile?.document_request_note && (
                    <div className="p-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 text-xs leading-relaxed">
                      <span className="font-bold uppercase tracking-wide text-[10px] block mb-1">Documents Requested</span>
                      {drawerCoach.coach_profile.document_request_note}
                    </div>
                  )}

                  <div className="glass-panel p-5 rounded-2xl space-y-3">
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Biography</p>
                    <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">{drawerCoach.coach_profile?.bio ?? 'Biography not updated.'}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass-panel p-4 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Qualifications</span>
                      <p className="text-slate-200 text-xs">{drawerCoach.coach_profile?.qualification ?? '—'}</p>
                    </div>
                    <div className="glass-panel p-4 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Certifications Summary</span>
                      <p className="text-slate-200 text-xs">{drawerCoach.coach_profile?.certifications_summary ?? '—'}</p>
                    </div>
                    <div className="glass-panel p-4 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Gender / DOB</span>
                      <p className="text-slate-200 text-xs">{drawerCoach.coach_profile?.gender ?? '—'} / {drawerCoach.coach_profile?.date_of_birth ? new Date(drawerCoach.coach_profile.date_of_birth).toLocaleDateString() : '—'}</p>
                    </div>
                    <div className="glass-panel p-4 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Phone</span>
                      <p className="text-slate-200 text-xs">{drawerCoach.phone ?? '—'}</p>
                    </div>
                    <div className="glass-panel p-4 rounded-xl space-y-1 col-span-2">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Location</span>
                      <p className="text-slate-200 text-xs">
                        {[drawerCoach.coach_profile?.address, drawerCoach.coach_profile?.area, drawerCoach.coach_profile?.city, drawerCoach.coach_profile?.state, drawerCoach.coach_profile?.country].filter(Boolean).join(', ') || '—'}
                      </p>
                    </div>
                    <div className="glass-panel p-4 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Service / Class Types</span>
                      <p className="text-slate-200 text-xs">{(drawerCoach.coach_profile?.service_types ?? []).join(', ') || '—'} · {(drawerCoach.coach_profile?.class_types ?? []).join(', ') || '—'}</p>
                    </div>
                    <div className="glass-panel p-4 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Age Groups / Skill Levels</span>
                      <p className="text-slate-200 text-xs">{(drawerCoach.coach_profile?.age_groups ?? []).join(', ') || '—'} · {(drawerCoach.coach_profile?.skill_levels ?? []).join(', ') || '—'}</p>
                    </div>
                    <div className="glass-panel p-4 rounded-xl space-y-1 col-span-2">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Service Areas / Communities</span>
                      <p className="text-slate-200 text-xs">
                        {(drawerCoach.coach_profile?.service_areas ?? []).map(sa => sa.area?.name).filter(Boolean).join(', ') || '—'}
                        {(drawerCoach.coach_profile?.service_communities ?? []).length > 0 && (
                          <> · {(drawerCoach.coach_profile?.service_communities ?? []).map(sc => sc.community?.name).filter(Boolean).join(', ')}</>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="glass-panel p-5 rounded-2xl space-y-3.5">
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Metrics Analytics</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs p-2 rounded-lg bg-white/[0.02]">
                        <span className="text-slate-500">Student Retention Rate</span>
                        <span className="text-slate-200 font-bold">{drawerCoach.coach_profile?.retention_rate ?? 0}%</span>
                      </div>
                      <div className="flex justify-between text-xs p-2 rounded-lg bg-white/[0.02]">
                        <span className="text-slate-500">Satisfaction Score</span>
                        <span className="text-emerald-400 font-bold">{drawerCoach.coach_profile?.satisfaction_score ?? 0}%</span>
                      </div>
                      <div className="flex justify-between text-xs p-2 rounded-lg bg-white/[0.02]">
                        <span className="text-slate-500">Lead Conversion Rate</span>
                        <span className="text-slate-200 font-bold">{drawerCoach.coach_profile?.conversion_rate ?? 0}%</span>
                      </div>
                      <div className="flex justify-between text-xs p-2 rounded-lg bg-white/[0.02]">
                        <span className="text-slate-500">Average Rating</span>
                        <span className="text-indigo-400 font-bold flex items-center gap-0.5"><Star className="w-3 h-3 fill-indigo-400" /> {drawerCoach.coach_profile?.avg_rating ?? '0.00'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: Documents */}
              {activeTab === 'documents' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="glass-panel p-5 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 items-end border-indigo-500/10">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Document Type</label>
                      <select
                        value={uploadingDocType}
                        onChange={(e) => setUploadingDocType(e.target.value)}
                        className="glass-input rounded-xl px-3 py-2 text-xs w-full bg-[#060814]"
                      >
                        <option value="Government ID">Government ID (Aadhaar/PAN/Passport)</option>
                        <option value="Resume">Professional Resume</option>
                        <option value="Employment Contract">Employment Contract</option>
                        <option value="Certification">Sports Certification</option>
                        <option value="Other">Other Document</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Select File (PDF, JPEG, PNG)</label>
                      <input
                        type="file"
                        onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                        className="glass-input rounded-xl px-3 py-1.5 text-xs w-full"
                      />
                    </div>
                    <button
                      onClick={() => handleDocUpload(drawerCoach.id)}
                      disabled={formLoading || !docFile}
                      className="btn-premium rounded-xl py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      Upload Document
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Linked Documents</p>
                    {!docCache[drawerCoach.id] || docCache[drawerCoach.id].length === 0 ? (
                      <p className="text-slate-600 text-xs py-4 text-center">No mandatory documents uploaded yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {docCache[drawerCoach.id].map(doc => (
                          <div key={doc.id} className="glass-panel p-4 rounded-xl border border-white/5 flex justify-between gap-4">
                            <div className="space-y-1">
                              <p className="text-slate-200 text-xs font-bold">{doc.document_type}</p>
                              <p className="text-slate-500 text-[10px] truncate max-w-[200px]">{doc.document_name}</p>
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold mt-1 ${
                                doc.verification_status === 'Verified' ? 'bg-emerald-500/10 text-emerald-400' :
                                doc.verification_status === 'Rejected' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                              }`}>
                                {doc.verification_status}
                              </span>
                              {doc.rejection_reason && (
                                <p className="text-red-400 text-[10px] mt-1 italic">Reason: {doc.rejection_reason}</p>
                              )}
                            </div>
                            <div className="flex flex-col gap-2 justify-between items-end">
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-indigo-400 hover:text-indigo-300 text-xs font-semibold flex items-center gap-1 border border-white/10"
                              >
                                <Download className="w-3 h-3" /> View / DL
                              </a>

                              {doc.verification_status === 'Pending' && (
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => verifyDocument(drawerCoach.id, doc.id, 'Verified')}
                                    className="p-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                                    title="Approve verification"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setRejectingDocId(doc.id)}
                                    className="p-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400"
                                    title="Reject document"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {rejectingDocId && (
                    <div className="glass-panel p-4 rounded-xl border border-red-500/20 space-y-3">
                      <p className="text-red-400 text-xs font-bold">Document Rejection Reason</p>
                      <textarea
                        rows={2}
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Explain why the document is rejected (e.g. Expired, Incomplete scan)..."
                        className="glass-input rounded-xl px-3 py-2 text-xs w-full resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setRejectingDocId(null)} className="px-3 py-1 rounded-lg text-slate-400 hover:text-slate-200 text-xs">Cancel</button>
                        <button onClick={() => verifyDocument(drawerCoach.id, rejectingDocId, 'Rejected', rejectionReason)} className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold">Confirm Rejection</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Schedule */}
              {activeTab === 'schedule' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {drawerCoach.coach_profile?.account_status === 'Active' && (
                    <div className="glass-panel p-4 rounded-2xl border-indigo-500/10 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                      <div className="flex-1">
                        <label className="block text-[11px] text-slate-500 mb-1">Assign to Batch</label>
                        <CustomSelect
                          value={assignBatchId}
                          onChange={setAssignBatchId}
                          placeholder="Select a batch..."
                          options={batches.map(b => ({ value: b.id, label: `${b.name}${b.class?.name ? ` · ${b.class.name}` : ''}` }))}
                        />
                      </div>
                      <button
                        onClick={() => handleAssignBatch(drawerCoach.id)}
                        disabled={!assignBatchId}
                        className="btn-premium rounded-xl py-2 px-4 text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 justify-center"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" /> Assign
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Batches</p>
                      {drawerCoach.batch_assignments.length === 0 ? (
                        <p className="text-slate-600 text-xs py-4 text-center">No batches assigned to this instructor.</p>
                      ) : (
                        <div className="space-y-2">
                          {drawerCoach.batch_assignments.map(a => (
                            <div key={a.id} className="glass-panel p-3.5 rounded-xl border border-white/5 flex justify-between items-center">
                              <div>
                                <p className="text-slate-200 text-xs font-semibold">{a.batch?.name}</p>
                                <p className="text-slate-500 text-[10px]">
                                  {a.batch?.class?.name} · {a.batch?.start_time ? `${formatTime(a.batch.start_time)} – ${formatTime(a.batch.end_time)}` : ''}
                                </p>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 uppercase">
                                {a.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Weekly Slots Availability</p>
                      {!availCache[drawerCoach.id] || availCache[drawerCoach.id].length === 0 ? (
                        <p className="text-slate-600 text-xs py-4 text-center">No weekly availability slots logged yet.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {availCache[drawerCoach.id].map(slot => (
                            <div key={slot.id} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between text-xs">
                              <span className="text-indigo-400 font-semibold">{DAY_LABELS[slot.day_of_week]}</span>
                              <span className="text-slate-300">{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: Payroll & Bank */}
              {activeTab === 'payroll' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="glass-panel p-5 rounded-2xl space-y-3 border-indigo-500/10">
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Payment & Pricing</p>
                    {(drawerCoach.coach_profile?.pricing_policies ?? []).some(p => p.enabled) ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(drawerCoach.coach_profile?.pricing_policies ?? []).filter(p => p.enabled).map(p => (
                          <span key={p.policy_type} className="px-2 py-1 rounded-lg font-semibold text-xs bg-indigo-500/10 text-indigo-300">
                            {p.policy_type.replace(/_/g, ' ')}{p.is_default ? ' (Default)' : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No pricing method configured yet.</p>
                    )}
                  </div>

                  <div className="glass-panel p-5 rounded-2xl space-y-4 border-indigo-500/10">
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Payout Calculator (On-Demand)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Period Start</label>
                        <input type="date" value={payrollPeriod.start} onChange={(e) => setPayrollPeriod(p => ({ ...p, start: e.target.value }))} className="glass-input rounded-xl px-3 py-1.5 text-xs w-full" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Period End</label>
                        <input type="date" value={payrollPeriod.end} onChange={(e) => setPayrollPeriod(p => ({ ...p, end: e.target.value }))} className="glass-input rounded-xl px-3 py-1.5 text-xs w-full" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Incentives (₹)</label>
                        <input type="number" value={payrollPeriod.incentives} onChange={(e) => setPayrollPeriod(p => ({ ...p, incentives: Number(e.target.value) }))} className="glass-input rounded-xl px-3 py-1.5 text-xs w-full" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Deductions (₹)</label>
                        <input type="number" value={payrollPeriod.deductions} onChange={(e) => setPayrollPeriod(p => ({ ...p, deductions: Number(e.target.value) }))} className="glass-input rounded-xl px-3 py-1.5 text-xs w-full" />
                      </div>
                    </div>
                    <button
                      onClick={() => triggerRecalculate(drawerCoach.id)}
                      disabled={formLoading}
                      className="btn-premium rounded-xl py-2 px-5 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Compile & Generate Payout Draft
                    </button>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payout Audit History</p>
                    {!payoutCache[drawerCoach.id] || payoutCache[drawerCoach.id].length === 0 ? (
                      <p className="text-slate-600 text-xs py-4 text-center">No payout ledgers compiled yet for this billing cycle.</p>
                    ) : (
                      <div className="space-y-2">
                        {payoutCache[drawerCoach.id].map(pay => (
                          <div key={pay.id} className="glass-panel p-4 rounded-xl border border-white/5 grid grid-cols-2 gap-3 items-center">
                            <div>
                              <p className="text-slate-500 text-[10px] uppercase font-bold">Billing Cycle</p>
                              <p className="text-slate-200 text-xs font-bold">{new Date(pay.period_start).toLocaleDateString()} - {new Date(pay.period_end).toLocaleDateString()}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-[10px] uppercase font-bold">Net Payout</p>
                              <p className="text-emerald-400 text-xs font-bold">₹{Number(pay.net_payout).toLocaleString('en-IN')}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-[10px] uppercase font-bold">Sessions</p>
                              <p className="text-slate-200 text-xs">{pay.class_sessions_conducted} Conducted</p>
                            </div>
                            <div className="text-right">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                pay.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400' :
                                pay.status === 'Processing' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'
                              }`}>
                                {pay.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: Reviews */}
              {activeTab === 'reviews' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Performance scorecard Reviews</p>
                    <button
                      onClick={() => setShowReviewModal(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Star className="w-3.5 h-3.5 fill-indigo-400" /> Log Monthly Review Score
                    </button>
                  </div>

                  <div className="glass-panel p-5 rounded-2xl text-center py-8 text-slate-500 border-white/5 space-y-2">
                    <Award className="w-8 h-8 mx-auto text-slate-700" />
                    <p className="text-xs">Log star evaluations to build chronological metrics growth chart.</p>
                  </div>

                  {showReviewModal && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                      <div className="relative glass-panel rounded-3xl w-full max-w-md p-6 space-y-5">
                        <div className="flex justify-between items-center border-b border-white/10 pb-3">
                          <h3 className="text-slate-100 font-semibold text-sm">Create Performance Evaluation</h3>
                          <button onClick={() => setShowReviewModal(false)} className="text-slate-400 hover:text-slate-200"><X className="w-4 h-4" /></button>
                        </div>

                        <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-2">
                          {[
                            { key: 'discipline', label: 'Discipline & Punctuality' },
                            { key: 'communication', label: 'Communication Competence' },
                            { key: 'studentFeedback', label: 'Student Response & Trust' },
                            { key: 'attendance', label: 'Schedule Attendance Compliance' },
                            { key: 'teachingQuality', label: 'Teaching Quality Skillset' },
                            { key: 'professionalism', label: 'Academy Professionalism' }
                          ].map(item => (
                            <div key={item.key} className="space-y-1.5">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-400">{item.label}</span>
                                <span className="text-indigo-400 font-bold">{(reviewForm as any)[item.key]} / 5</span>
                              </div>
                              <input
                                type="range"
                                min={1}
                                max={5}
                                step={1}
                                value={(reviewForm as any)[item.key]}
                                onChange={(e) => setReviewForm(prev => ({ ...prev, [item.key]: Number(e.target.value) }))}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                              />
                            </div>
                          ))}

                          <div className="space-y-1">
                            <label className="block text-[11px] text-slate-400">Comments & Recommendations</label>
                            <textarea
                              rows={2}
                              value={reviewForm.comments}
                              onChange={(e) => setReviewForm(prev => ({ ...prev, comments: e.target.value }))}
                              placeholder="Provide constructive feedback..."
                              className="glass-input rounded-xl px-3 py-2 text-xs w-full resize-none"
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => submitCoachReview(drawerCoach.id)}
                          disabled={formLoading}
                          className="btn-premium w-full rounded-xl py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <Star className="w-3.5 h-3.5" /> Lock Evaluation Scorecard
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Timeline */}
              {activeTab === 'timeline' && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Activity Timeline</p>
                  {!timelineCache[drawerCoach.id] || timelineCache[drawerCoach.id].length === 0 ? (
                    <p className="text-slate-600 text-xs py-4 text-center">No lifecycle activity logged yet.</p>
                  ) : (
                    <div className="space-y-3 relative pl-4 border-l border-white/10">
                      {timelineCache[drawerCoach.id].map(entry => (
                        <div key={entry.id} className="relative">
                          <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-[#0a0d1c]" />
                          <p className="text-slate-200 text-xs font-semibold">{entry.description}</p>
                          <p className="text-slate-500 text-[10px] mt-0.5">
                            {new Date(entry.created_at).toLocaleString()} {entry.actor ? `· ${entry.actor.first_name} ${entry.actor.last_name}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Notes */}
              {activeTab === 'notes' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><StickyNote className="w-3.5 h-3.5" /> Internal Notes</p>
                  <div className="glass-panel p-4 rounded-2xl space-y-3 border-indigo-500/10">
                    <textarea
                      rows={2}
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add an internal note (only visible to admins)..."
                      className="glass-input rounded-xl px-3 py-2 text-xs w-full resize-none"
                    />
                    <button onClick={() => handleAddNote(drawerCoach.id)} disabled={!newNote.trim()} className="btn-premium rounded-xl py-1.5 px-4 text-xs font-semibold disabled:opacity-50">
                      Add Note
                    </button>
                  </div>
                  {!noteCache[drawerCoach.id] || noteCache[drawerCoach.id].length === 0 ? (
                    <p className="text-slate-600 text-xs py-4 text-center">No notes yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {noteCache[drawerCoach.id].map(n => (
                        <div key={n.id} className="glass-panel p-3.5 rounded-xl border border-white/5">
                          <p className="text-slate-200 text-xs">{n.note}</p>
                          <p className="text-slate-500 text-[10px] mt-1.5">
                            {new Date(n.created_at).toLocaleString()} {n.author ? `· ${n.author.first_name} ${n.author.last_name}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Students */}
              {activeTab === 'students' && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> Students in Assigned Batches</p>
                  {!studentsCache[drawerCoach.id] || studentsCache[drawerCoach.id].length === 0 ? (
                    <p className="text-slate-600 text-xs py-4 text-center">No students enrolled in this coach's batches yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {studentsCache[drawerCoach.id].map(s => (
                        <div key={s.id} className="glass-panel p-3 rounded-xl border border-white/5 text-xs text-slate-200">
                          {s.first_name} {s.last_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Reason Modal (Reject/Pause/Suspend/Archive/Request Documents) ── */}
      {reasonModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative glass-panel rounded-3xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-slate-100 font-semibold text-sm">{REASON_MODAL_COPY[reasonModal.kind].title}</h3>
              <button onClick={() => { setReasonModal(null); setReasonText(''); }} className="text-slate-400 hover:text-slate-200"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-400">{reasonModal.coach.first_name} {reasonModal.coach.last_name} ({reasonModal.coach.email})</p>
            <textarea
              rows={3}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={REASON_MODAL_COPY[reasonModal.kind].placeholder}
              className="glass-input rounded-xl px-3 py-2 text-xs w-full resize-none"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setReasonModal(null); setReasonText(''); }} className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs">Cancel</button>
              <button
                onClick={submitReasonModal}
                disabled={!reasonText.trim()}
                className={`px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50 ${REASON_MODAL_COPY[reasonModal.kind].confirmClass}`}
              >
                {REASON_MODAL_COPY[reasonModal.kind].confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Onboard Modal ── */}
      {showOnboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-3xl shadow-2xl">
            <CoachOnboardingWizard
              isAdminMode={true}
              mode="create"
              tenantId={tenantId ?? ''}
              onCancel={() => setShowOnboard(false)}
              onSuccess={() => {
                setShowOnboard(false);
                loadCoaches();
              }}
              theme={mode}
            />
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editingCoach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-3xl shadow-2xl">
            <CoachOnboardingWizard
              isAdminMode={true}
              mode="edit"
              editCoach={editingCoach as unknown as CoachEditData}
              tenantId={tenantId ?? ''}
              onCancel={() => setEditingCoach(null)}
              onSuccess={() => {
                setEditingCoach(null);
                loadCoaches();
              }}
              theme={mode}
            />
          </div>
        </div>
      )}

      {/* ── Generate Invite URL Modal ── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowInviteModal(false)}
          />
          <div className="relative glass-panel rounded-3xl w-full max-w-md p-6 space-y-5 animate-in fade-in duration-200">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <Link2 className="w-5 h-5 text-indigo-400" />
                <h3 className="text-slate-100 font-semibold text-sm">Academy Invite Link</h3>
              </div>
              <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-slate-400 text-xs leading-relaxed">
                Coaches joining through this dynamic invite link are automatically linked to your active academy tenant and queued in your verification roster.
              </p>

              <div className="space-y-2">
                <label className="block text-[11px] text-slate-500 font-bold uppercase tracking-wider">Onboarding Registration URL</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    type="text"
                    value={tenantId ? `${window.location.origin}/auth/register?tenantId=${tenantId}&role=coach` : 'Generating link...'}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full bg-[#060814]/40 text-slate-300 font-mono select-all"
                  />
                  <button
                    onClick={() => {
                      if (tenantId) {
                        navigator.clipboard.writeText(`${window.location.origin}/auth/register?tenantId=${tenantId}&role=coach`);
                        setCopiedLink(true);
                        toastMessage('Invite link copied to clipboard!');
                        setTimeout(() => setCopiedLink(false), 2000);
                      }
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 whitespace-nowrap min-w-[90px]"
                  >
                     {copiedLink ? 'Copied ✓' : 'Copy URL'}
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-500/[0.03] border border-indigo-500/10 flex gap-3 text-xs text-indigo-300 leading-relaxed">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>Coaches registering via this URL are initialized as <strong>Inactive</strong> and require document validation before access is enabled.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
