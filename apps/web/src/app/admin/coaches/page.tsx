'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  UserCog,
  Users,
  Plus,
  Search,
  Edit2,
  X,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sparkles,
  IndianRupee,
  FileText,
  Upload,
  Download,
  Award,
  Clock,
  AlertCircle,
  Trash2,
  UserX,
  UserCheck,
  Calendar,
  Globe,
  MapPin,
  Wifi,
  Star,
  Check,
  CreditCard,
  Landmark,
  ShieldAlert,
  FileCheck,
  Activity,
  Link2,
  User,
  Phone,
  Mail,
  Lock,
  ArrowLeft,
  ArrowRight,
  Camera,
  Eye,
  EyeOff
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { CoachOnboardingWizard } from '@/components/CoachOnboardingWizard';
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
    account_status: string;
    public_profile_slug: string | null;
    achievements: string[];
    gallery_urls: string[];
    avg_rating: number;
    retention_rate: number;
    conversion_rate: number;
    satisfaction_score: number;
    created_at: string;
    coach_categories: {
      is_primary: boolean;
      subcategory: { name: string; slug: string; category: { name: string; slug: string; icon: string | null } | null } | null;
    }[];
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
};

const ONBOARD_STEPS = [
  { id: 1, name: 'Personal Information', desc: 'Basic details' },
  { id: 2, name: 'Professional Profile', desc: 'Skills & experience' },
  { id: 3, name: 'Location', desc: 'Where they are based' },
  { id: 4, name: 'Account Security', desc: 'Verification settings' },
  { id: 5, name: 'Review & Submit', desc: 'Verify and onboard' },
];

const SERVICE_TYPES_ONBOARD = [
  'Personal Training', 'Group Training', 'Online Coaching', 'Offline Coaching'
];

const CLASS_TYPES_ONBOARD = [
  'Regular Classes', 'Crash Course', 'Tournament Coaching', 'Summer Camp'
];

const LANGUAGES_ONBOARD = [
  'English', 'Hindi', 'Kannada', 'Telugu', 'Tamil', 'Malayalam', 'Marathi', 'Gujarati'
];

const COACH_TYPES = [
  'Yoga Coach', 'Fitness Coach', 'Badminton Coach', 'Football Coach',
  'Gymnastics Coach', 'Cricket Coach', 'Tennis Instructor', 'Basketball Coach',
  'Table Tennis Coach', 'Running Coach', 'Skating Coach', 'Swimming Coach',
  'Rock Climbing Trainer', 'Dance Trainer', 'Zumba Trainer', 'Music Teacher',
  'Other Custom Coach'
];

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

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent: string }) {
  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 hover:border-white/20 transition-all duration-300">
      <div className={`p-2.5 sm:p-3 rounded-xl ${accent} flex-shrink-0 self-start sm:self-auto`}>{icon}</div>
      <div>
        <p className="text-slate-400 text-[10px] sm:text-xs font-semibold uppercase tracking-wide leading-tight">{label}</p>
        <p className="text-slate-100 text-xl sm:text-2xl font-bold mt-0.5 sm:mt-1">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Active': 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    'Inactive': 'bg-red-500/10 border-red-500/20 text-red-400',
    'Onboarding': 'bg-slate-500/10 border-slate-500/20 text-slate-400',
    'Document Upload Pending': 'bg-rose-500/10 border-rose-500/20 text-rose-400',
    'Pending Verification': 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  };
  const dotColor: Record<string, string> = {
    'Active': 'bg-emerald-400',
    'Inactive': 'bg-red-400',
    'Onboarding': 'bg-slate-400',
    'Document Upload Pending': 'bg-rose-400',
    'Pending Verification': 'bg-amber-400',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${map[status] ?? 'bg-slate-500/10 border-slate-500/20 text-slate-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor[status] ?? 'bg-slate-400'}`} />
      {status}
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

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function CoachesPage() {
  const supabase = createBrowserClient();
  const { mode } = useTheme();

  // ── State ──
  const [coaches, setCoaches] = useState<CoachItem[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({}); // coachId -> activeTab string
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Tab Details State caches
  const [docCache, setDocCache] = useState<Record<string, CoachDocument[]>>({});
  const [payoutCache, setPayoutCache] = useState<Record<string, CoachPayout[]>>({});
  const [availCache, setAvailCache] = useState<Record<string, CoachAvailability[]>>({});

  // Modals & Forms State
  const [showOnboard, setShowOnboard] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showBatches, setShowBatches] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<CoachItem | null>(null);
  const [formLoading, setFormLoading] = useState(false);

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


  const loadCoaches = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', userId).single();
      const tid = profile?.tenant_id;
      setTenantId(tid);

      // Fetch coaches using endpoint (enables server calculations)
      const res = await fetch('/api/v1/coaches?includeInactive=true');
      if (!res.ok) throw new Error('API fetch failed');
      const data = await res.json();
      setCoaches(data.data || []);

      // Fetch active batches
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

  const handleTabChange = (coachId: string, tab: string) => {
    setActiveTabs(prev => ({ ...prev, [coachId]: tab }));
    if (tab === 'documents') loadDocCache(coachId);
    if (tab === 'payroll') loadPayoutCache(coachId);
    if (tab === 'schedule') loadAvailCache(coachId);
  };

  // ── Document Operations ──
  const handleDocUpload = async (coachId: string) => {
    if (!docFile) return;
    setFormLoading(true);
    try {
      const ext = docFile.name.split('.').pop();
      const path = `coach-documents/doc_${coachId}_${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
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
        const err = await res.json();
        throw new Error(err.error ?? err.message ?? 'Update failed');
      }
      toastMessage(`Document ${status.toLowerCase()} successfully.`);
      setRejectingDocId(null);
      setRejectionReason('');
      await loadDocCache(coachId);
    } catch (e: any) {
      toastMessage(e.message, 'error');
    }
  };

  const handleToggleActive = async (coach: CoachItem, actionType: 'deactivate' | 'approve') => {
    try {
      const res = await fetch('/api/v1/coaches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: coach.id, action: actionType }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? err.message ?? 'Failed action');
      }
      toastMessage(`Coach status updated successfully.`);
      await loadCoaches();
    } catch (err: any) {
      toastMessage(err.message, 'error');
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

  // ── Computed filters ──
  const filteredCoaches = coaches.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.coach_profile?.coach_categories ?? []).some(cc => (cc.subcategory?.name ?? '').toLowerCase().includes(q))
    );
  });

  const activeCount = coaches.filter((c) => c.coach_profile?.account_status === 'Active').length;
  const inactiveCount = coaches.filter((c) => c.coach_profile?.account_status !== 'Active').length;

  return (
    <div className="min-h-screen bg-[#060814] text-slate-100 p-6 lg:p-8 space-y-8 animate-in fade-in duration-300">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <UserCog className="w-5 h-5 text-indigo-400" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-100">Coach Management</h1>
          </div>
          <p className="text-slate-400 text-sm ml-12">
            Onboard, verify credentials, track ratings, audit availability, and generate payout matrices.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 flex items-center gap-2 transition-all duration-150"
          >
            <Link2 className="w-4 h-4" />
            Generate Invite URL
          </button>
          <button
            onClick={() => {
              setShowOnboard(true);
            }}
            className="btn-premium flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Onboard New Coach
          </button>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5 text-indigo-400" />}
          label="Active Verified Coaches"
          value={loading ? '—' : activeCount}
          accent="bg-indigo-500/10 border border-indigo-500/20"
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-amber-400" />}
          label="Pending Review Queues"
          value={loading ? '—' : inactiveCount}
          accent="bg-amber-500/10 border border-amber-500/20"
        />
        <StatCard
          icon={<Activity className="w-5 h-5 text-emerald-400" />}
          label="Coaches Total Roster"
          value={loading ? '—' : coaches.length}
          accent="bg-emerald-500/10 border border-emerald-500/20"
        />
      </div>

      {/* ── Coach Directory Panel ── */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h2 className="text-slate-100 font-semibold text-sm">Professional Roster</h2>
            <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              {filteredCoaches.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search coaches by name, skill..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input rounded-xl pl-9 pr-4 py-2 text-sm w-full sm:w-72"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
            <span>Parsing team logs...</span>
          </div>
        ) : filteredCoaches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
            <ShieldAlert className="w-10 h-10 text-slate-700" />
            <p className="text-sm">No coaches found in index.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-slate-950/20">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3.5">Coach</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3.5">Expertise & Experience</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3.5">Languages</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3.5">Joining Date</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3.5">Employment Status</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCoaches.map((coach) => {
                  const isExpanded = expandedRow === coach.id;
                  const activeTab = activeTabs[coach.id] || 'overview';
                  return (
                    <React.Fragment key={coach.id}>
                      <tr
                        onClick={() => {
                          setExpandedRow(isExpanded ? null : coach.id);
                          if (!isExpanded) handleTabChange(coach.id, 'overview');
                        }}
                        className={`border-b border-white/5 cursor-pointer transition-all ${
                          isExpanded ? 'bg-indigo-500/5' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <AvatarCircle url={coach.avatar_url} first={coach.first_name} last={coach.last_name} />
                            <div>
                              <p className="font-semibold text-slate-100 text-xs sm:text-sm">{coach.first_name} {coach.last_name}</p>
                              <p className="text-slate-400 text-xs">{coach.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-200 text-xs font-medium">
                              {coach.coach_profile?.coach_categories?.find(cc => cc.is_primary)?.subcategory?.name ?? '—'}
                            </span>
                            <span className="text-slate-500 text-[10px]">{coach.coach_profile?.experience_years} Years Experience</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-300">
                          {coach.coach_profile?.languages_known.join(', ') ?? '—'}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-300">
                          {coach.coach_profile?.joining_date ? new Date(coach.coach_profile.joining_date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={coach.coach_profile?.account_status ?? 'Inactive'} />
                        </td>
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2">
                            {coach.coach_profile?.account_status !== 'Active' ? (
                              <button
                                onClick={() => handleToggleActive(coach, 'approve')}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold flex items-center gap-1"
                              >
                                <FileCheck className="w-3.5 h-3.5" /> Approve Activation
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleActive(coach, 'deactivate')}
                                className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[11px] font-semibold"
                              >
                                Deactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Master tabs view */}
                      {isExpanded && (
                        <tr className="bg-indigo-500/[0.02] border-b border-white/5">
                          <td colSpan={6} className="p-0">
                            <div className="p-6 space-y-6">
                              {/* Expanded Tabs Navigator */}
                              <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
                                {[
                                  { key: 'overview', label: 'Overview' },
                                  { key: 'documents', label: 'Mandatory Documents' },
                                  { key: 'schedule', label: 'Schedule & Batches' },
                                  { key: 'payroll', label: 'Payroll & Bank' },
                                  { key: 'reviews', label: 'Performance Reviews' }
                                ].map(tab => (
                                  <button
                                    key={tab.key}
                                    onClick={() => handleTabChange(coach.id, tab.key)}
                                    className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                      activeTab === tab.key
                                        ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                                        : 'border-transparent text-slate-400 hover:text-slate-200'
                                    }`}
                                  >
                                    {tab.label}
                                  </button>
                                ))}
                              </div>

                              {/* TAB CONTENT: Overview */}
                              {activeTab === 'overview' && (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
                                  <div className="lg:col-span-2 space-y-4">
                                    <div className="glass-panel p-5 rounded-2xl space-y-3">
                                      <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Biography</p>
                                      <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">{coach.coach_profile?.bio ?? 'Biography not updated.'}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="glass-panel p-4 rounded-xl space-y-1">
                                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Qualifications</span>
                                        <p className="text-slate-200 text-xs">{coach.coach_profile?.qualification ?? '—'}</p>
                                      </div>
                                      <div className="glass-panel p-4 rounded-xl space-y-1">
                                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Certifications Summary</span>
                                        <p className="text-slate-200 text-xs">{coach.coach_profile?.certifications_summary ?? '—'}</p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="space-y-4">
                                    <div className="glass-panel p-5 rounded-2xl space-y-3.5">
                                      <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Metrics Analytics</p>
                                      <div className="space-y-2">
                                        <div className="flex justify-between text-xs p-2 rounded-lg bg-white/[0.02]">
                                          <span className="text-slate-500">Student Retention Rate</span>
                                          <span className="text-slate-200 font-bold">{coach.coach_profile?.retention_rate ?? 0}%</span>
                                        </div>
                                        <div className="flex justify-between text-xs p-2 rounded-lg bg-white/[0.02]">
                                          <span className="text-slate-500">Satisfaction Score</span>
                                          <span className="text-emerald-400 font-bold">{coach.coach_profile?.satisfaction_score ?? 0}%</span>
                                        </div>
                                        <div className="flex justify-between text-xs p-2 rounded-lg bg-white/[0.02]">
                                          <span className="text-slate-500">Lead Conversion Rate</span>
                                          <span className="text-slate-200 font-bold">{coach.coach_profile?.conversion_rate ?? 0}%</span>
                                        </div>
                                        <div className="flex justify-between text-xs p-2 rounded-lg bg-white/[0.02]">
                                          <span className="text-slate-500">Average Rating</span>
                                          <span className="text-indigo-400 font-bold flex items-center gap-0.5"><Star className="w-3 h-3 fill-indigo-400" /> {coach.coach_profile?.avg_rating ?? '0.00'}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* TAB CONTENT: Documents */}
                              {activeTab === 'documents' && (
                                <div className="space-y-5 animate-in fade-in duration-200">
                                  {/* Upload dialog */}
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
                                      onClick={() => handleDocUpload(coach.id)}
                                      disabled={formLoading || !docFile}
                                      className="btn-premium rounded-xl py-2 text-xs font-semibold disabled:opacity-50"
                                    >
                                      Upload Document
                                    </button>
                                  </div>

                                  {/* Document lists */}
                                  <div className="space-y-2">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Linked Documents</p>
                                    {!docCache[coach.id] || docCache[coach.id].length === 0 ? (
                                      <p className="text-slate-600 text-xs py-4 text-center">No mandatory documents uploaded yet.</p>
                                    ) : (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {docCache[coach.id].map(doc => (
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
                                                    onClick={() => verifyDocument(coach.id, doc.id, 'Verified')}
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

                                  {/* Rejection comment drawer modal */}
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
                                        <button onClick={() => verifyDocument(coach.id, rejectingDocId, 'Rejected', rejectionReason)} className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold">Confirm Rejection</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* TAB CONTENT: Schedule */}
                              {activeTab === 'schedule' && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
                                  <div className="space-y-4">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Batches</p>
                                    {coach.batch_assignments.length === 0 ? (
                                      <p className="text-slate-600 text-xs py-4 text-center">No batches assigned to this instructor.</p>
                                    ) : (
                                      <div className="space-y-2">
                                        {coach.batch_assignments.map(a => (
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
                                    {!availCache[coach.id] || availCache[coach.id].length === 0 ? (
                                      <p className="text-slate-600 text-xs py-4 text-center">No weekly availability slots logged yet.</p>
                                    ) : (
                                      <div className="grid grid-cols-2 gap-2">
                                        {availCache[coach.id].map(slot => (
                                          <div key={slot.id} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between text-xs">
                                            <span className="text-indigo-400 font-semibold">{DAY_LABELS[slot.day_of_week]}</span>
                                            <span className="text-slate-300">{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* TAB CONTENT: Payroll */}
                              {activeTab === 'payroll' && (
                                <div className="space-y-6 animate-in fade-in duration-200">
                                  {/* Payroll recalculator drawer */}
                                  <div className="glass-panel p-5 rounded-2xl space-y-4 border-indigo-500/10">
                                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Payout Calculator (On-Demand)</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end">
                                      <div>
                                        <label className="block text-[11px] text-slate-500 mb-1">Period Start</label>
                                        <input
                                          type="date"
                                          value={payrollPeriod.start}
                                          onChange={(e) => setPayrollPeriod(p => ({ ...p, start: e.target.value }))}
                                          className="glass-input rounded-xl px-3 py-1.5 text-xs w-full"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] text-slate-500 mb-1">Period End</label>
                                        <input
                                          type="date"
                                          value={payrollPeriod.end}
                                          onChange={(e) => setPayrollPeriod(p => ({ ...p, end: e.target.value }))}
                                          className="glass-input rounded-xl px-3 py-1.5 text-xs w-full"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] text-slate-500 mb-1">Incentives (₹)</label>
                                        <input
                                          type="number"
                                          value={payrollPeriod.incentives}
                                          onChange={(e) => setPayrollPeriod(p => ({ ...p, incentives: Number(e.target.value) }))}
                                          className="glass-input rounded-xl px-3 py-1.5 text-xs w-full"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] text-slate-500 mb-1">Deductions (₹)</label>
                                        <input
                                          type="number"
                                          value={payrollPeriod.deductions}
                                          onChange={(e) => setPayrollPeriod(p => ({ ...p, deductions: Number(e.target.value) }))}
                                          className="glass-input rounded-xl px-3 py-1.5 text-xs w-full"
                                        />
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => triggerRecalculate(coach.id)}
                                      disabled={formLoading}
                                      className="btn-premium rounded-xl py-2 px-5 text-xs font-semibold flex items-center justify-center gap-1.5"
                                    >
                                      <CreditCard className="w-3.5 h-3.5" /> Compile & Generate Payout Draft
                                    </button>
                                  </div>

                                  {/* historical payout records */}
                                  <div className="space-y-3">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payout Audit History</p>
                                    {!payoutCache[coach.id] || payoutCache[coach.id].length === 0 ? (
                                      <p className="text-slate-600 text-xs py-4 text-center">No payout ledgers compiled yet for this billing cycle.</p>
                                    ) : (
                                      <div className="space-y-2">
                                        {payoutCache[coach.id].map(pay => (
                                          <div key={pay.id} className="glass-panel p-4 rounded-xl border border-white/5 grid grid-cols-2 md:grid-cols-5 gap-4 items-center">
                                            <div>
                                              <p className="text-slate-500 text-[10px] uppercase font-bold">Billing Cycle</p>
                                              <p className="text-slate-200 text-xs font-bold">{new Date(pay.period_start).toLocaleDateString()} - {new Date(pay.period_end).toLocaleDateString()}</p>
                                            </div>
                                            <div>
                                              <p className="text-slate-500 text-[10px] uppercase font-bold">Sessions Mapped</p>
                                              <p className="text-slate-200 text-xs">{pay.class_sessions_conducted} Conducted</p>
                                            </div>
                                            <div>
                                              <p className="text-slate-500 text-[10px] uppercase font-bold">Incentives / Deductions</p>
                                              <p className="text-slate-300 text-xs">₹{pay.incentives} / -₹{pay.deductions}</p>
                                            </div>
                                            <div>
                                              <p className="text-slate-500 text-[10px] uppercase font-bold">Net Payout</p>
                                              <p className="text-emerald-400 text-xs font-bold">₹{Number(pay.net_payout).toLocaleString('en-IN')}</p>
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

                              {/* TAB CONTENT: Reviews & star generator */}
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

                                  {/* Review Modal Dialog */}
                                  {showReviewModal && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
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
                                          onClick={() => submitCoachReview(coach.id)}
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
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Onboard Modal ── */}
      {showOnboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-3xl shadow-2xl">
            <CoachOnboardingWizard
              isAdminMode={true}
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
