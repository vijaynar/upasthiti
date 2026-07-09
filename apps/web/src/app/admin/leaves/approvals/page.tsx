'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase';
import {
  Calendar,
  Briefcase,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  ArrowLeft,
  Eye,
  ChevronRight,
  X,
  Sparkles,
  Cross
} from 'lucide-react';

interface LeaveRequest {
  id: string;
  coach_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  leave_type: 'Casual Leave' | 'Sick Leave' | 'Earned Leave';
  created_at: string;
  updated_at: string;
  admin_comment: string | null;
  coaches: {
    id: string;
    coach_categories: { is_primary: boolean; subcategory: { name: string } | null }[] | null;
    users: {
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      avatar_url: string | null;
    };
  } | null;
}

export default function LeaveApprovalsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [coachesList, setCoachesList] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  
  // Filter/Search states
  const [activeTab, setActiveTab] = useState<'Pending' | 'Approved' | 'Rejected' | 'All'>('Pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterCoach, setFilterCoach] = useState('All');

  // Review form states
  const [adminComment, setAdminComment] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const supabase = createBrowserClient();

  const loadApprovalsData = async (isRef = false) => {
    if (isRef) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      // Fetch user tenant info
      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id, role')
        .eq('id', user.id)
        .single();

      if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
        router.push('/admin/dashboard');
        return;
      }

      const tenantId = profile.tenant_id;

      // Load all requests for this tenant
      const { data: leaves, error: leavesErr } = await supabase
        .from('coach_leaves')
        .select(`
          id,
          coach_id,
          tenant_id,
          start_date,
          end_date,
          reason,
          status,
          leave_type,
          created_at,
          updated_at,
          admin_comment,
          coaches (
            id,
            coach_categories(is_primary, subcategory:subcategories(name)),
            users (
              id,
              first_name,
              last_name,
              email,
              avatar_url
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (leavesErr) throw leavesErr;
      const parsedRequests = (leaves || []) as unknown as LeaveRequest[];
      setRequests(parsedRequests);

      // Load all active coaches in the tenant for dropdown filter
      const { data: coachesData, error: coachesErr } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('tenant_id', tenantId)
        .eq('role', 'coach');

      if (coachesErr) throw coachesErr;
      setCoachesList(coachesData || []);

      // Set default selected request (first pending request)
      if (parsedRequests.length > 0) {
        const firstPending = parsedRequests.find(r => r.status === 'Pending');
        if (firstPending) {
          setSelectedRequest(firstPending);
        } else if (!selectedRequest) {
          setSelectedRequest(parsedRequests[0]);
        } else {
          // Sync selected request with fresh data
          const updatedSelected = parsedRequests.find(r => r.id === selectedRequest.id);
          setSelectedRequest(updatedSelected || parsedRequests[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load approvals data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadApprovalsData();
  }, []);

  const handleReviewLeave = async (leaveId: string, action: 'Approved' | 'Rejected') => {
    setReviewing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('coach_leaves')
        .update({
          status: action,
          approved_by: user.id,
          admin_comment: adminComment.trim() || null
        })
        .eq('id', leaveId);

      if (error) throw error;
      alert(`Leave request marked as ${action.toLowerCase()} successfully!`);
      setAdminComment('');
      
      // Reload and refresh dashboard state
      await loadApprovalsData(true);
    } catch (err) {
      console.error('Failed to review leave:', err);
      alert('Failed to update leave request status.');
    } finally {
      setReviewing(false);
    }
  };

  // Helper formatting functions
  const getLeaveTypeIcon = (type: string) => {
    switch (type) {
      case 'Sick Leave':
        return <Cross className="w-3.5 h-3.5 text-emerald-400" />;
      case 'Earned Leave':
        return <Briefcase className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Calendar className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  const getLeaveTypeClass = (type: string) => {
    switch (type) {
      case 'Sick Leave':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Earned Leave':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    }
  };

  const calculateDays = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const diffTime = Math.abs(e.getTime() - s.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const formatDuration = (start: string, end: string) => {
    const days = calculateDays(start, end);
    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    };
    if (start === end) {
      return `${formatDate(start)} (1 Day)`;
    }
    return `${formatDate(start)} - ${formatDate(end)} (${days} Days)`;
  };

  const formatAppliedDate = (ts: string) => {
    if (!ts) return 'N/A';
    const d = new Date(ts);
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${date} ${time}`;
  };

  // Compute stat card numbers dynamically
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const pending = requests.filter(r => r.status === 'Pending').length;
    
    const approvedThisMonth = requests.filter(r => {
      const d = new Date(r.created_at);
      return r.status === 'Approved' && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;

    const rejectedThisMonth = requests.filter(r => {
      const d = new Date(r.created_at);
      return r.status === 'Rejected' && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;

    const totalThisMonth = requests.filter(r => {
      const d = new Date(r.created_at);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;

    return { pending, approvedThisMonth, rejectedThisMonth, totalThisMonth };
  }, [requests]);

  // Compute real average response time for reviewed requests
  const avgResponseTime = useMemo(() => {
    const reviewedRequests = requests.filter(r => r.status === 'Approved' || r.status === 'Rejected');
    if (reviewedRequests.length === 0) return '0.0 Days';

    const totalMs = reviewedRequests.reduce((acc, r) => {
      const created = new Date(r.created_at).getTime();
      const updated = new Date(r.updated_at || r.created_at).getTime();
      return acc + Math.max(0, updated - created);
    }, 0);

    const avgDays = totalMs / (1000 * 60 * 60 * 24);
    if (avgDays < 0.1) {
      const avgHours = totalMs / (1000 * 60 * 60);
      if (avgHours < 0.1) {
        return 'Instant';
      }
      return `${avgHours.toFixed(1)} Hours`;
    }
    return `${avgDays.toFixed(1)} Days`;
  }, [requests]);

  // Compute previous leaves for active selection
  const previousLeaves = useMemo(() => {
    if (!selectedRequest) return { casual: 0, sick: 0, earned: 0 };
    const thisYear = new Date().getFullYear();
    const coachId = selectedRequest.coach_id;

    const getCount = (type: string) => {
      return requests
        .filter(r => r.coach_id === coachId && r.status === 'Approved' && r.leave_type === type && new Date(r.start_date).getFullYear() === thisYear)
        .reduce((sum, r) => sum + calculateDays(r.start_date, r.end_date), 0);
    };

    return {
      casual: getCount('Casual Leave'),
      sick: getCount('Sick Leave'),
      earned: getCount('Earned Leave'),
    };
  }, [selectedRequest, requests]);

  // Filter requests based on tab + search + dropdown selectors
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // 1. Tab filter
      if (activeTab === 'Pending' && r.status !== 'Pending') return false;
      if (activeTab === 'Approved' && r.status !== 'Approved') return false;
      if (activeTab === 'Rejected' && r.status !== 'Rejected') return false;

      // 2. Search query (coach name or reason)
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const fullName = `${r.coaches?.users?.first_name || ''} ${r.coaches?.users?.last_name || ''}`.toLowerCase();
        const reason = (r.reason || '').toLowerCase();
        if (!fullName.includes(query) && !reason.includes(query)) return false;
      }

      // 3. Leave Type filter
      if (filterType !== 'All' && r.leave_type !== filterType) return false;

      // 4. Coach filter
      if (filterCoach !== 'All' && r.coach_id !== filterCoach) return false;

      return true;
    });
  }, [requests, activeTab, searchQuery, filterType, filterCoach]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/dashboard"
            className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors hover:bg-white/[0.04]"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold tracking-widest uppercase mb-1">
              <Sparkles className="w-4 h-4" /> Administration
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-display">
              Leave Approval
            </h1>
            <p className="text-xs text-slate-400 mt-1">Review and approve or reject leave requests from coaches.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-slate-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
            {new Date().toLocaleDateString([], {month:'long', day:'numeric', year:'numeric'})} (Today)
          </span>
          <button
            onClick={() => loadApprovalsData(true)}
            className="btn-secondary h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Pending Requests */}
        <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center justify-between relative overflow-hidden group">
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Pending Requests</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.pending}</div>
            <span className="text-[9px] text-indigo-400 block font-semibold">Requires your action</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 glow-indigo">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Approved This Month */}
        <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center justify-between relative overflow-hidden group">
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Approved (This Month)</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.approvedThisMonth}</div>
            <span className="text-[9px] text-emerald-400 block font-semibold">Total leaves approved</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 glow-emerald">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Rejected This Month */}
        <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center justify-between relative overflow-hidden group">
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Rejected (This Month)</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.rejectedThisMonth}</div>
            <span className="text-[9px] text-red-400 block font-semibold">Total leaves rejected</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 glow-red">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        {/* Total Leaves */}
        <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center justify-between relative overflow-hidden group">
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Total Leaves (This Month)</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalThisMonth}</div>
            <span className="text-[9px] text-blue-400 block font-semibold">All leave requests</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 glow-blue">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Average Response Time */}
        <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center justify-between relative overflow-hidden group col-span-2 lg:col-span-1">
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Avg. Response Time</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{avgResponseTime}</div>
            <span className="text-[9px] text-amber-500 block font-semibold">Average approval time</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 glow-amber">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Content Split Layout */}
      {loading ? (
        <div className="py-24 text-center glass-panel rounded-3xl border border-white/5">
          <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin glow-indigo mx-auto mb-4" />
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Loading Leave Approvals...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          
          {/* Left Side: Table & Filters */}
          <div className="xl:col-span-2 glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
            
            {/* Tabs & Filters */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="flex gap-4">
                  {(['Pending', 'Approved', 'Rejected', 'All'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`relative pb-3 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer
                        ${activeTab === tab ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      {tab} {tab === 'Pending' ? `(${stats.pending})` : ''}
                      {activeTab === tab && (
                        <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full glow-indigo animate-in fade-in" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtering Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by coach name or reason..."
                    className="w-full h-9 pl-9 pr-3 rounded-xl glass-input text-xs"
                  />
                </div>
                
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="h-9 px-3 rounded-xl glass-input text-xs min-w-[130px]"
                >
                  <option value="All" className="bg-slate-900">All Leave Types</option>
                  <option value="Casual Leave" className="bg-slate-900">Casual Leave</option>
                  <option value="Sick Leave" className="bg-slate-900">Sick Leave</option>
                  <option value="Earned Leave" className="bg-slate-900">Earned Leave</option>
                </select>

                <select
                  value={filterCoach}
                  onChange={(e) => setFilterCoach(e.target.value)}
                  className="h-9 px-3 rounded-xl glass-input text-xs min-w-[130px]"
                >
                  <option value="All" className="bg-slate-900">All Coaches</option>
                  {coachesList.map(c => (
                    <option key={c.id} value={c.id} className="bg-slate-900">
                      {c.first_name} {c.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Requests List Table */}
            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-[9px] font-extrabold text-slate-500 uppercase tracking-widest">
                    <th className="py-3 px-4">Coach</th>
                    <th className="py-3 px-4">Leave Type</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Applied On</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 italic">No leave requests match filter criteria.</td>
                    </tr>
                  ) : (
                    filteredRequests.map((r) => {
                      const isActive = selectedRequest?.id === r.id;
                      const coachName = `${r.coaches?.users?.first_name || 'Unknown'} ${r.coaches?.users?.last_name || 'Coach'}`;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setSelectedRequest(r)}
                          className={`group cursor-pointer transition-colors duration-150
                            ${isActive ? 'bg-indigo-500/5' : 'hover:bg-white/[0.01]'}`}
                        >
                          <td className="py-3.5 px-4 font-semibold">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center bg-white/5 text-xs font-bold text-slate-300 overflow-hidden">
                                {r.coaches?.users?.avatar_url ? (
                                  <img src={r.coaches.users.avatar_url} alt={coachName} className="w-full h-full object-cover" />
                                ) : (
                                  coachName.split(' ').map(n=>n[0]).join('')
                                )}
                              </div>
                              <div>
                                <div className="text-slate-900 dark:text-white font-bold text-xs">{coachName}</div>
                                <div className="text-[10px] text-slate-500 font-semibold">{r.coaches?.coach_categories?.find(cc => cc.is_primary)?.subcategory?.name || 'Coach'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className={`p-1 rounded-lg border ${getLeaveTypeClass(r.leave_type)}`}>
                                {getLeaveTypeIcon(r.leave_type)}
                              </span>
                              <span className="font-semibold text-slate-300">{r.leave_type}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-medium">
                            {formatDuration(r.start_date, r.end_date)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-mono text-[10px]">
                            {formatAppliedDate(r.created_at)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold border uppercase inline-block
                              ${r.status === 'Approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
                                r.status === 'Rejected' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 
                                r.status === 'Cancelled' ? 'bg-slate-500/10 border-slate-500/20 text-slate-400' : 
                                'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRequest(r);
                                }}
                                className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-[10px] text-slate-500 font-semibold">
              Showing {filteredRequests.length} of {requests.length} requests
            </div>

          </div>

          {/* Right Side: Request Details Drawer */}
          <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6 relative xl:sticky xl:top-6 min-h-[400px]">
            
            {selectedRequest ? (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Header detail */}
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white font-display">Leave Request Details</h3>
                  <button
                    onClick={() => setSelectedRequest(null)}
                    className="p-1.5 rounded-lg border border-white/5 hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Coach Profile Card */}
                <div className="flex items-center gap-3.5 bg-white/[0.01] p-3 rounded-2xl border border-white/5">
                  <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/5 text-base font-bold text-indigo-300 overflow-hidden">
                    {selectedRequest.coaches?.users?.avatar_url ? (
                      <img
                        src={selectedRequest.coaches.users.avatar_url}
                        alt={`${selectedRequest.coaches.users.first_name} ${selectedRequest.coaches.users.last_name}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      `${selectedRequest.coaches?.users?.first_name?.[0] || ''}${selectedRequest.coaches?.users?.last_name?.[0] || ''}`
                    )}
                  </div>
                  <div>
                    <h4 className="text-slate-900 dark:text-white font-bold text-sm">
                      {selectedRequest.coaches?.users?.first_name || 'Unknown'} {selectedRequest.coaches?.users?.last_name || 'Coach'}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-semibold">{selectedRequest.coaches?.coach_categories?.find(cc => cc.is_primary)?.subcategory?.name || 'Coach'}</p>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5">{selectedRequest.coaches?.users?.email}</p>
                  </div>
                </div>

                {/* Details Fields */}
                <div className="space-y-3.5 text-xs text-slate-400">
                  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.03]">
                    <span className="font-bold uppercase text-[9px] tracking-wide">Leave Type</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`p-1 rounded-lg border ${getLeaveTypeClass(selectedRequest.leave_type)}`}>
                        {getLeaveTypeIcon(selectedRequest.leave_type)}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white text-[11px]">{selectedRequest.leave_type}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.03]">
                    <span className="font-bold uppercase text-[9px] tracking-wide">Duration</span>
                    <span className="font-semibold text-slate-200">{formatDuration(selectedRequest.start_date, selectedRequest.end_date)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.03]">
                    <span className="font-bold uppercase text-[9px] tracking-wide">Applied On</span>
                    <span className="font-mono text-slate-300">{formatAppliedDate(selectedRequest.created_at)}</span>
                  </div>

                  <div className="space-y-1.5 py-1.5">
                    <span className="font-bold uppercase text-[9px] tracking-wide block">Reason</span>
                    <p className="p-3 bg-white/[0.01] border border-white/5 rounded-xl text-slate-300 leading-relaxed max-h-[100px] overflow-y-auto">
                      {selectedRequest.reason}
                    </p>
                  </div>

                  {selectedRequest.admin_comment && (
                    <div className="space-y-1.5 py-1.5">
                      <span className="font-bold uppercase text-[9px] tracking-wide text-indigo-400 block">Admin Comment/Feedback</span>
                      <p className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-slate-300 italic">
                        {selectedRequest.admin_comment}
                      </p>
                    </div>
                  )}
                </div>

                {/* Previous Leaves Summary */}
                <div className="space-y-3 pt-2">
                  <h5 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Previous Leaves (This Year)</h5>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-purple-500/5 border border-purple-500/10 p-2.5 rounded-xl">
                      <div className="text-base font-black text-purple-400">{previousLeaves.casual} Days</div>
                      <div className="text-[8px] text-slate-500 font-extrabold uppercase mt-0.5">Casual</div>
                    </div>
                    <div className="bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-xl">
                      <div className="text-base font-black text-emerald-400">{previousLeaves.sick} Days</div>
                      <div className="text-[8px] text-slate-500 font-extrabold uppercase mt-0.5">Sick</div>
                    </div>
                    <div className="bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-xl">
                      <div className="text-base font-black text-amber-400">{previousLeaves.earned} Days</div>
                      <div className="text-[8px] text-slate-500 font-extrabold uppercase mt-0.5">Earned</div>
                    </div>
                  </div>
                </div>

                {/* Actions Form */}
                {selectedRequest.status === 'Pending' ? (
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="space-y-1.5">
                      <label className="text-[9px] text-slate-400 font-extrabold block uppercase tracking-wider">Comments (Optional)</label>
                      <textarea
                        value={adminComment}
                        onChange={(e) => setAdminComment(e.target.value)}
                        placeholder="Add feedback or reasons for this approval/rejection..."
                        rows={3}
                        className="w-full p-3 rounded-xl glass-input text-xs"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleReviewLeave(selectedRequest.id, 'Rejected')}
                        disabled={reviewing}
                        className="h-10 rounded-xl border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-bold text-xs cursor-pointer transition-colors duration-150 disabled:opacity-40"
                      >
                        Reject Request
                      </button>
                      <button
                        onClick={() => handleReviewLeave(selectedRequest.id, 'Approved')}
                        disabled={reviewing}
                        className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer transition-colors duration-150 disabled:opacity-40 glow-emerald"
                      >
                        Approve Request
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-4 border-t border-white/5 text-center py-2 bg-white/[0.01] border border-white/5 rounded-2xl text-[11px] font-semibold text-slate-500">
                    This request has already been processed and is <span className="uppercase font-bold text-slate-400">{selectedRequest.status}</span>.
                  </div>
                )}

              </div>
            ) : (
              <div className="h-[350px] flex flex-col items-center justify-center text-center text-slate-500 py-12">
                <Clock className="w-10 h-10 text-slate-600 mb-3 animate-pulse" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">No Request Selected</h4>
                <p className="text-[10px] text-slate-500 max-w-[200px] mt-1">Select a request from the list to view its details and action it.</p>
              </div>
            )}

          </div>

        </div>
      )}
    </div>
  );
}
