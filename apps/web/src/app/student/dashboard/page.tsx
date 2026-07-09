'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import CustomSelect from '../../admin/components/CustomSelect';
import { useCategoryTaxonomy } from '@/lib/useCategoryTaxonomy';
import { CategoryPicker, CategorySelection } from '@/components/CategoryPicker';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  IndianRupee,
  FileText,
  Eye,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  User,
  X,
  XCircle,
  TrendingUp,
  MapPin,
  FileImage,
  Award,
  Lock,
  ChevronRight,
  BookOpen,
  Star,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

interface AttendanceRecord {
  id: string;
  date: string;
  status: 'present' | 'late' | 'absent';
  check_in: string | null;
}

interface FineItem {
  id: string;
  amount: number;
  reason: string;
  status: 'unpaid' | 'pending_verification' | 'paid' | 'waived';
  issued_date: string;
  paid_date: string | null;
  payment_method: string | null;
  transaction_id: string | null;
  payment_proof_url: string | null;
  rejection_reason: string | null;
  waive_reason: string | null;
}

interface StudentDashboardData {
  student: {
    tenant_id: string;
    student_custom_id: string;
    joining_date: string;
    batch: {
      id: string;
      name: string;
      start_time: string;
      end_time: string;
      days_of_week: number[];
      class: {
        name: string;
      } | null;
    } | null;
  } | null;
  attendanceStats: {
    totalClasses: number;
    attendedCount: number;
    absentCount: number;
    lateCount: number;
    ratio: number;
  };
  attendanceList: AttendanceRecord[];
}

export default function StudentDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'batches' | 'coaches' | 'become-coach'>('dashboard');
  
  // Core Stats & Logs
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [fines, setFines] = useState<FineItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Student join request & removals states
  const [removalNotification, setRemovalNotification] = useState<any | null>(null);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinBatchId, setJoinBatchId] = useState('');
  const [joinRemark, setJoinRemark] = useState('');
  const [submittingJoin, setSubmittingJoin] = useState(false);

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinBatchId) return;
    setSubmittingJoin(true);
    try {
      const response = await fetch('/api/v1/students/join-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: joinBatchId,
          remark: joinRemark
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to submit join request');

      setShowJoinModal(false);
      setJoinBatchId('');
      setJoinRemark('');
      alert('Join request submitted successfully!');
      await loadDashboardData();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Connection error');
    } finally {
      setSubmittingJoin(false);
    }
  };
  const [refreshing, setRefreshing] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Discovery Lists
  const [batches, setBatches] = useState<any[]>([]);
  const [coachesList, setCoachesList] = useState<any[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [loadingCoaches, setLoadingCoaches] = useState(false);

  // Coach Onboarding Application Status
  const [coachProfile, setCoachProfile] = useState<any | null>(null);
  const [checkingCoach, setCheckingCoach] = useState(false);
  const [submittingCoach, setSubmittingCoach] = useState(false);
  const [coachDocs, setCoachDocs] = useState<any[]>([]);

  // Onboarding Form States
  const { categories: coachCategories } = useCategoryTaxonomy();
  const [categorySelection, setCategorySelection] = useState<CategorySelection>({
    categoryId: null,
    subcategoryIds: [],
    primarySubcategoryId: null,
    tagIds: [],
    ageGroups: [],
    skillLevels: [],
  });
  const [experienceYears, setExperienceYears] = useState('2');
  const [bio, setBio] = useState('');
  const [qualification, setQualification] = useState('');
  const [certifications, setCertifications] = useState('');
  const [languages, setLanguages] = useState('English, Hindi');
  const [serviceTypes, setServiceTypes] = useState<string[]>(['Offline']);
  const [classTypes, setClassTypes] = useState<string[]>(['Group Classes']);
  
  const [govIdFile, setGovIdFile] = useState<File | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [onboardSuccess, setOnboardSuccess] = useState(false);

  // Submit Proof Modal
  const [submittingFine, setSubmittingFine] = useState<FineItem | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'bank_transfer' | 'cash'>('upi');
  const [transactionId, setTransactionId] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Password Change States
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null);

  // Photo upload states
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ id: string; first_name: string; last_name: string; avatar_url: string | null } | null>(null);
  const [noStudentProfile, setNoStudentProfile] = useState(false);

  const supabase = createBrowserClient();

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError(null);
    setSecuritySuccess(null);

    if (newPassword.length < 8) {
      setSecurityError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setSecurityError('Passwords do not match.');
      return;
    }

    setSecurityLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSecuritySuccess('Password successfully updated!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setSecurityError(err.message || 'Failed to update password.');
    } finally {
      setSecurityLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    if (!userId) return;
    setPhotoUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filename = `avatar_${userId}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('student-portraits')
        .upload(filename, file, { contentType: file.type, upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from('student-portraits').getPublicUrl(filename);
      const { error: updateErr } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      if (updateErr) throw updateErr;
      setPhotoUrl(publicUrl);
      setUserProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : prev);
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      alert('Failed to upload photo: ' + err.message);
    } finally {
      setPhotoUploading(false);
    }
  };

  const loadDashboardData = async (isRef = false) => {
    if (isRef) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const uid = user.id;
      setUserId(uid);

      // 1. Fetch Student Metadata & Batch Info
      const { data: studentProfile, error: stuErr } = await supabase
        .from('students')
        .select(`
          tenant_id,
          student_custom_id, joining_date,
          batch:batches(
            id,
            name, start_time, end_time, days_of_week,
            class:classes(name)
          )
        `)
        .eq('id', uid)
        .maybeSingle();

      if (stuErr) throw stuErr;

      if (!studentProfile) {
        setNoStudentProfile(true);
        // Also fetch user profile for avatar
        const { data: userRec } = await supabase
          .from('users')
          .select('id, first_name, last_name, avatar_url, tenant_id')
          .eq('id', uid)
          .single();
        if (userRec) {
          setUserProfile(userRec);
          setPhotoUrl(userRec.avatar_url);
          setTenantId(userRec.tenant_id);
        }
        setLoading(false);
        return;
      }
      setNoStudentProfile(false);
      setTenantId(studentProfile.tenant_id);

      // Also fetch user profile for avatar
      const { data: userRec } = await supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url')
        .eq('id', uid)
        .single();
      if (userRec) {
        setUserProfile(userRec);
        setPhotoUrl(userRec.avatar_url);
      }

      // 2. Fetch student's attendance records
      const { data: attLogs, error: attErr } = await supabase
        .from('attendance_logs')
        .select('id, date, status, check_in')
        .eq('student_id', uid)
        .order('date', { ascending: false });

      if (attErr) throw attErr;

      // 3. Compute stats
      const totalCount = attLogs ? attLogs.length : 0;
      let present = 0;
      let late = 0;
      let absent = 0;

      if (attLogs) {
        attLogs.forEach((log: any) => {
          if (log.status === 'present') present++;
          else if (log.status === 'late') late++;
          else if (log.status === 'absent') absent++;
        });
      }

      const attended = present + late;
      const ratio = totalCount > 0 ? Math.round((attended / totalCount) * 100) : 100;

      // 4. Fetch Fines list
      const { data: finesData, error: fineErr } = await supabase
        .from('fines')
        .select('*')
        .eq('student_id', uid)
        .order('issued_date', { ascending: false });

      if (fineErr) throw fineErr;

      setData({
        student: studentProfile as any,
        attendanceStats: {
          totalClasses: totalCount,
          attendedCount: attended,
          absentCount: absent,
          lateCount: late,
          ratio,
        },
        attendanceList: (attLogs || []) as AttendanceRecord[],
      });

      setFines((finesData || []) as unknown as FineItem[]);

      // 5. Fetch removal notifications
      const { data: removals } = await supabase
        .from('student_removals')
        .select('id, remark, removed_at, batch:batches(name)')
        .eq('student_id', uid)
        .order('removed_at', { ascending: false });

      setRemovalNotification(removals && removals.length > 0 ? removals[0] : null);

      // 6. Fetch join requests
      const { data: requests } = await supabase
        .from('student_join_requests')
        .select('id, remark, status, created_at, batch:batches(name)')
        .eq('student_id', uid)
        .order('created_at', { ascending: false });

      setJoinRequests(requests || []);

      // 7. Check if user already applied to become a coach
      loadCoachStatus(uid);

    } catch (err) {
      console.error('Failed to load student dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadCoachStatus = async (uid: string) => {
    setCheckingCoach(true);
    try {
      const { data: cProfile } = await supabase
        .from('coaches')
        .select('*, coach_categories(is_primary, subcategory:subcategories(name))')
        .eq('id', uid)
        .maybeSingle();

      setCoachProfile(cProfile);

      if (cProfile) {
        // Fetch submitted documents
        const { data: docs } = await supabase
          .from('coach_documents')
          .select('*')
          .eq('coach_id', uid);
        setCoachDocs(docs || []);
      }
    } catch (err) {
      console.error('Failed to check coach status:', err);
    } finally {
      setCheckingCoach(false);
    }
  };

  const fetchBatches = async () => {
    setLoadingBatches(true);
    try {
      const { data: bData } = await supabase
        .from('batches')
        .select('id, name, start_time, end_time, days_of_week, max_capacity, is_active, class:classes(name, description)')
        .eq('is_active', true);
      setBatches(bData || []);
    } catch (err) {
      console.error('Failed to fetch classes:', err);
    } finally {
      setLoadingBatches(false);
    }
  };

  const fetchCoaches = async () => {
    setLoadingCoaches(true);
    try {
      const { data: cData } = await supabase
        .from('coaches')
        .select('id, experience_years, service_types, class_types, languages_known, bio, public_profile_slug, avg_rating, users(first_name, last_name, avatar_url), coach_categories(is_primary, subcategory:subcategories(name))')
        .eq('account_status', 'Active');
      setCoachesList(cData || []);
    } catch (err) {
      console.error('Failed to fetch coaches list:', err);
    } finally {
      setLoadingCoaches(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    fetchBatches();
  }, []);

  // Fetch contextual lists when tabs are switched
  useEffect(() => {
    if (activeTab === 'batches') {
      fetchBatches();
    } else if (activeTab === 'coaches') {
      fetchCoaches();
    }
  }, [activeTab]);

  const handleEnrollBatch = async (batchId: string) => {
    if (!userId) return;
    try {
      const confirmRegister = window.confirm('Are you sure you want to register for this class batch? This will update your active batch schedule.');
      if (!confirmRegister) return;

      const { error: enrollError } = await supabase
        .from('students')
        .update({ batch_id: batchId })
        .eq('id', userId);

      if (enrollError) throw enrollError;

      alert('Successfully registered and enrolled in batch!');
      loadDashboardData();
    } catch (err: any) {
      console.error('Enrollment failed:', err);
      alert('Registration failed: ' + err.message);
    }
  };

  const handleBecomeCoachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !tenantId) return;

    setOnboardError(null);
    setSubmittingCoach(true);

    try {
      // 1. Minimum validations
      if (!bio.trim() || bio.trim().length < 20) {
        throw new Error('Please enter a bio description of at least 20 characters.');
      }
      if (!govIdFile) {
        throw new Error('Please upload a Government ID verification file.');
      }
      if (!categorySelection.primarySubcategoryId) {
        throw new Error('Please select your coaching category and at least one specialty.');
      }

      // 2. Upload Government ID
      console.log('[Coach Apply] Uploading Government ID...');
      const govIdExt = govIdFile.name.split('.').pop();
      const govIdFilename = `doc_govid_${userId}_${Date.now()}.${govIdExt}`;
      const { error: govIdErr } = await supabase.storage
        .from('student-portraits')
        .upload(govIdFilename, govIdFile, { contentType: govIdFile.type });
      if (govIdErr) throw govIdErr;

      const { data: { publicUrl: govIdUrl } } = supabase.storage.from('student-portraits').getPublicUrl(govIdFilename);

      // 3. Upload Resume (if any)
      let resumeUrl = '';
      if (resumeFile) {
        console.log('[Coach Apply] Uploading Resume...');
        const resumeExt = resumeFile.name.split('.').pop();
        const resumeFilename = `doc_resume_${userId}_${Date.now()}.${resumeExt}`;
        const { error: resumeErr } = await supabase.storage
          .from('student-portraits')
          .upload(resumeFilename, resumeFile, { contentType: resumeFile.type });
        if (resumeErr) throw resumeErr;

        const { data: { publicUrl: rUrl } } = supabase.storage.from('student-portraits').getPublicUrl(resumeFilename);
        resumeUrl = rUrl;
      }

      // 4. Create public.coaches profile entry
      console.log('[Coach Apply] Inserting coach profile record...');
      const profileSlug = `${userProfile?.first_name || 'coach'}-${userProfile?.last_name || 'profile'}-${userId.slice(0, 4)}`.toLowerCase();
      
      const { error: profileErr } = await supabase
        .from('coaches')
        .insert({
          id: userId,
          tenant_id: tenantId,
          experience_years: parseInt(experienceYears) || 0,
          service_types: serviceTypes,
          class_types: classTypes,
          languages_known: languages.split(',').map(l => l.trim()),
          qualification: qualification || null,
          certifications_summary: certifications || null,
          bio: bio,
          age_groups: categorySelection.ageGroups,
          skill_levels: categorySelection.skillLevels,
          account_status: 'Pending Verification',
          public_profile_slug: profileSlug,
          avg_rating: 0.00
        });

      if (profileErr) throw profileErr;

      // 4b. Tag the coach with its category/subcategory/tag selections
      const resolvedSubcategoryIds = categorySelection.subcategoryIds.length > 0
        ? categorySelection.subcategoryIds
        : [categorySelection.primarySubcategoryId];
      await supabase.from('coach_categories').insert(
        resolvedSubcategoryIds.map(subcategoryId => ({
          coach_id: userId,
          subcategory_id: subcategoryId,
          is_primary: subcategoryId === categorySelection.primarySubcategoryId,
        }))
      );
      if (categorySelection.tagIds.length > 0) {
        await supabase.from('coach_tags').insert(
          categorySelection.tagIds.map(tagId => ({ coach_id: userId, tag_id: tagId }))
        );
      }

      // 5. Insert documents info
      console.log('[Coach Apply] Inserting document indices...');
      await supabase.from('coach_documents').insert({
        coach_id: userId,
        tenant_id: tenantId,
        document_type: 'Government ID',
        document_name: govIdFile.name,
        file_url: govIdUrl,
        verification_status: 'Pending'
      });

      if (resumeFile && resumeUrl) {
        await supabase.from('coach_documents').insert({
          coach_id: userId,
          tenant_id: tenantId,
          document_type: 'Resume',
          document_name: resumeFile.name,
          file_url: resumeUrl,
          verification_status: 'Pending'
        });
      }

      // 6. Update user role constraint in frontend & refetch
      console.log('[Coach Apply] Application submitted successfully.');
      setOnboardSuccess(true);
      loadCoachStatus(userId);
    } catch (err: any) {
      console.error('[Coach Onboarding] Submission failed:', err);
      setOnboardError(err.message || 'Failed to submit onboarding files.');
    } finally {
      setSubmittingCoach(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setScreenshotFile(e.target.files[0]);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingFine || !transactionId || !screenshotFile) return;

    setUploading(true);
    setUploadError(null);

    try {
      // Upload screenshot file
      const filename = `proof_${submittingFine.id}_${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('student-portraits')
        .upload(filename, screenshotFile, {
          contentType: screenshotFile.type,
          cacheControl: '3600',
        });

      if (uploadErr) throw uploadErr;

      // Obtain public url
      const { data: { publicUrl } } = supabase.storage
        .from('student-portraits')
        .getPublicUrl(filename);

      // Update fine record status
      const { error: updateErr } = await supabase
        .from('fines')
        .update({
          status: 'pending_verification',
          payment_method: paymentMethod,
          transaction_id: transactionId,
          payment_proof_url: publicUrl,
          rejection_reason: null,
        })
        .eq('id', submittingFine.id);

      if (updateErr) throw updateErr;

      // Reset states
      setSubmittingFine(null);
      setTransactionId('');
      setScreenshotFile(null);
      loadDashboardData();
      alert('Proof of payment submitted successfully for verification!');
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadError(err.message || 'Failed to submit payment details.');
    } finally {
      setUploading(false);
    }
  };

  // Helper: Get Day Name
  const getDayName = (dayNum: number) => {
    const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days[dayNum] || '';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin glow-indigo" />
        <p className="text-slate-400 text-xs font-semibold tracking-widest uppercase">
          Compiling student ledger stats...
        </p>
      </div>
    );
  }

  if (noStudentProfile) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 rounded-3xl bg-amber-500/5 border border-amber-500/20 text-center space-y-4 shadow-2xl backdrop-blur-md">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">No Student Profile Registered</h2>
        <p className="text-slate-400 text-xs leading-relaxed">
          You are currently accessing the **Student Portal**, but no student profile was found for your account ({userProfile?.first_name} {userProfile?.last_name}).
        </p>
        <p className="text-slate-500 text-[11px] leading-relaxed">
          If you have multiple roles (like Coach or Admin), you can switch back using the switcher dropdown in the top-right header workspace menu. Otherwise, please contact your administrator to associate a student ID with your account.
        </p>
      </div>
    );
  }

  if (!data) return null;

  const unpaidFinesList = fines.filter((f) => f.status === 'unpaid');
  const totalUnpaidINR = unpaidFinesList.reduce((sum, f) => sum + Number(f.amount), 0);

  return (
    <div className="space-y-8">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Avatar with upload */}
          <div className="relative group flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-indigo-500/10 border-2 border-indigo-500/30 overflow-hidden flex items-center justify-center text-indigo-300 font-black text-lg">
              {photoUrl
                ? <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" />
                : <span>{userProfile?.first_name?.[0] || 'S'}{userProfile?.last_name?.[0] || 'T'}</span>
              }
            </div>
            <label className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center">
              {photoUploading
                ? <RefreshCw className="w-5 h-5 text-white animate-spin" />
                : <Upload className="w-5 h-5 text-white" />
              }
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
            </label>
          </div>
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold tracking-widest uppercase mb-1">
              <Sparkles className="w-4 h-4" /> Student Portal Overview
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              Hello, {userProfile?.first_name || 'Student'}!
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Roll Ref: {data.student?.student_custom_id || 'Not Assigned'}
            </p>
          </div>
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={() => loadDashboardData(true)}
            className="btn-secondary h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Stats
          </button>
        </div>
      </div>

      {/* Tabs navigation panel */}
      <div className="flex border-b border-white/10 pb-px overflow-x-auto gap-6 no-scrollbar">
        {[
          { id: 'dashboard', label: 'My Dashboard', icon: Calendar },
          { id: 'batches', label: 'Register Classes', icon: BookOpen },
          { id: 'coaches', label: 'Meet coaches', icon: User },
          { id: 'become-coach', label: 'Become a Coach', icon: Award },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-4 text-xs font-extrabold tracking-wider uppercase transition-all duration-200 border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-400 font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: DASHBOARD ── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* Stats Cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group flex items-center gap-4 border-indigo-500/20">
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-indigo-500/5 blur-2xl" />
              <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 flex items-center justify-center font-black text-white text-lg glow-indigo">
                {data.attendanceStats.ratio}%
              </div>
              <div>
                <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wide">
                  Attendance Rating
                </span>
                <span className="text-xs font-extrabold text-indigo-300 mt-1 block">
                  {data.attendanceStats.ratio >= 85 ? 'Excellent Standings' : 'Improvement Required'}
                </span>
              </div>
            </div>

            <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Attended Sessions</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-white">{data.attendanceStats.attendedCount}</span>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Present: {data.attendanceStats.attendedCount - data.attendanceStats.lateCount} | Late: {data.attendanceStats.lateCount}
                </span>
              </div>
            </div>

            <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Absences Registered</span>
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                  <XCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-white">{data.attendanceStats.absentCount}</span>
                <span className="text-xs text-slate-500 block mt-1">Missed sessions</span>
              </div>
            </div>

            <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Outstanding Penalties</span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-white">₹{totalUnpaidINR.toLocaleString()}</span>
                <span className="text-xs text-slate-500 block mt-1">Pending payments</span>
              </div>
            </div>

          </div>

          {/* Active Schedule Panel */}
          {/* Active Schedule Panel / Removal Banner / Unassigned card */}
          {data.student?.batch ? (
            <div className="p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest block">My Enrolled Schedule</span>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    {data.student.batch.class?.name || 'Class Subject'} ({data.student.batch.name})
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Days: {data.student.batch.days_of_week.map(d => getDayName(d)).join(', ')} | Time: {data.student.batch.start_time.slice(0, 5)} - {data.student.batch.end_time.slice(0, 5)}
                  </p>
                </div>
              </div>
              <span className="inline-flex px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                Active Enrolled
              </span>
            </div>
          ) : removalNotification ? (
            <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 glow-red">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-red-400 font-extrabold uppercase tracking-widest block">Class Batch Removal Alert</span>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    Removed from batch {removalNotification.batch?.name || 'Class Subject'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Removed on: {new Date(removalNotification.removed_at).toLocaleDateString()}
                    {removalNotification.remark ? ` • Remark: "${removalNotification.remark}"` : ' • Remark: No remark specified.'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowJoinModal(true)}
                className="btn-premium h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                Request to Join Batch <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-widest block">Batch Unassigned</span>
                  <h3 className="text-base font-bold text-white mt-0.5">No Enrolled Class Batch</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Register for an active batch in the academy to log gate check-ins.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowJoinModal(true)}
                className="btn-premium h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                Request to Join Batch <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Main Grid Split Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            
            {/* Left Hand: Attendance Logs Feed */}
            <div className="glass-panel p-6 rounded-3xl lg:col-span-3 space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">My Historical Attendance Logs</h2>
                  <p className="text-[11px] text-slate-400">Review logsheets for checking in at gates</p>
                </div>
                <Award className="w-5 h-5 text-indigo-400" />
              </div>

              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 no-scrollbar">
                {data.attendanceList.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-12">No attendance logs registered yet.</p>
                ) : (
                  data.attendanceList.map((log) => (
                    <div key={log.id} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs">
                          <Calendar className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-200">
                            {new Date(log.date).toLocaleDateString([], { dateStyle: 'long' })}
                          </h4>
                          <span className="text-[9px] text-slate-500 font-semibold block mt-0.5">
                            Evaluated at gate checkpoint
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        {log.status === 'present' && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                            Present
                          </span>
                        )}
                        {log.status === 'late' && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-amber-500/10 border border-amber-500/25 text-amber-400">
                            Late
                          </span>
                        )}
                        {log.status === 'absent' && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-red-500/10 border border-red-500/25 text-red-400">
                            Absent
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-slate-400 font-bold block mt-1">
                          {log.check_in 
                            ? new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                            : '-'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Hand: Join Requests and Fines panels */}
            <div className="lg:col-span-2 space-y-6 flex flex-col">
              
              {/* Submitted Join Requests Widget */}
              <div className="glass-panel p-6 rounded-3xl space-y-6">
                <div className="border-b border-white/10 pb-3 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">Batch Join Requests</h2>
                    <p className="text-[11px] text-slate-400">Track status of registration requests</p>
                  </div>
                  <BookOpen className="w-5 h-5 text-indigo-400" />
                </div>

                <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
                  {joinRequests.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-xs text-slate-500 italic">No join requests submitted.</p>
                    </div>
                  ) : (
                    joinRequests.map((req) => (
                      <div key={req.id} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[9px] text-slate-500 font-semibold block">
                              Requested: {new Date(req.created_at).toLocaleDateString()}
                            </span>
                            <h4 className="text-xs font-bold text-slate-200 mt-0.5">{req.batch?.name || 'Class Subject'}</h4>
                          </div>
                          <div>
                            {req.status === 'pending' && (
                              <span className="inline-flex px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase bg-amber-500/10 text-amber-400 animate-pulse">
                                Pending
                              </span>
                            )}
                            {req.status === 'approved' && (
                              <span className="inline-flex px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400">
                                Approved
                              </span>
                            )}
                            {req.status === 'rejected' && (
                              <span className="inline-flex px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase bg-red-500/10 text-red-400">
                                Rejected
                              </span>
                            )}
                          </div>
                        </div>
                        {req.remark && (
                          <p className="text-[9px] text-slate-400 italic">"{req.remark}"</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Outstanding Fines ledger */}
              <div className="glass-panel p-6 rounded-3xl space-y-6">
                <div className="border-b border-white/10 pb-3">
                  <h2 className="text-lg font-bold text-white tracking-tight">Payment History & Settlements</h2>
                  <p className="text-[11px] text-slate-400">Clear outstanding penalties with UPI/Bank proof uploads</p>
                </div>

                <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 no-scrollbar">
                  {fines.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle2 className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">No penalties logged!</p>
                      <p className="text-[10px] text-slate-600 mt-1">Your account balance is completely settled.</p>
                    </div>
                  ) : (
                    fines.map((fine) => (
                      <div key={fine.id} className="p-4 rounded-2xl bg-indigo-950/10 border border-indigo-500/15 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">
                              Issued: {new Date(fine.issued_date).toLocaleDateString()}
                            </span>
                            <h4 className="text-xs font-bold text-slate-200 mt-0.5">{fine.reason}</h4>
                          </div>
                          <span className="text-xs font-black text-indigo-300">
                            ₹{Number(fine.amount).toLocaleString()}
                          </span>
                        </div>

                        {fine.status === 'unpaid' && fine.rejection_reason && (
                          <div className="p-2 rounded-xl bg-red-500/5 border border-red-500/20 text-[9px] text-red-400 font-semibold leading-normal">
                            <strong>Audit Rejection Note:</strong> "{fine.rejection_reason}"
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-white/5">
                          {fine.status === 'unpaid' ? (
                            <>
                              <span className="inline-flex px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase bg-amber-500/10 text-amber-400">
                                Unpaid
                              </span>
                              <button
                                onClick={() => setSubmittingFine(fine)}
                                className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] cursor-pointer glow-indigo flex items-center gap-1"
                              >
                                <Upload className="w-3.5 h-3.5" /> Submit Proof
                              </button>
                            </>
                          ) : fine.status === 'pending_verification' ? (
                            <>
                              <span className="inline-flex px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase bg-indigo-500/10 text-indigo-400 animate-pulse">
                                Pending Audit
                              </span>
                              <span className="text-[9px] text-slate-500 italic">
                                Under manual review
                              </span>
                            </>
                          ) : fine.status === 'paid' ? (
                            <>
                              <span className="inline-flex px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400">
                                Paid
                              </span>
                              <span className="text-[9px] text-slate-500 italic">
                                Settled on {fine.paid_date ? new Date(fine.paid_date).toLocaleDateString() : '-'}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="inline-flex px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase bg-slate-500/10 text-slate-500">
                                Waived
                              </span>
                              <span className="text-[9px] text-slate-500 italic max-w-[120px] truncate" title={fine.waive_reason || ''}>
                                Reason: "{fine.waive_reason}"
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Account Security Change Password Panel */}
            <div className="glass-panel p-6 rounded-3xl space-y-4 lg:col-span-5 border border-white/5">
              <div className="border-b border-white/10 pb-3">
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <Lock className="w-5 h-5 text-indigo-400" /> Account Security
                </h2>
                <p className="text-[11px] text-slate-400">Update your learning portal access password</p>
              </div>

              {securityError && (
                <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-[10px] font-semibold flex items-center gap-1.5 animate-pulse">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{securityError}</span>
                </div>
              )}

              {securitySuccess && (
                <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-[10px] font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{securitySuccess}</span>
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                      New Password (min 8 characters)
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-10 px-3.5 rounded-xl glass-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-10 px-3.5 rounded-xl glass-input text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={securityLoading}
                  className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer transition-colors duration-200 flex items-center justify-center gap-2 glow-indigo"
                >
                  {securityLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    'Update Access Password'
                  )}
                </button>
              </form>
            </div>

          </div>
        </div>
      )}

      {/* ── TAB 2: AVAILABLE BATCHES ── */}
      {activeTab === 'batches' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div>
            <h2 className="text-xl font-bold text-white">Active Academy Classes & Batches</h2>
            <p className="text-xs text-slate-400 mt-1">Select and register for other scheduled class batches</p>
          </div>

          {loadingBatches ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-xs text-slate-500">Querying active scheduled blocks...</span>
            </div>
          ) : batches.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-12 text-center">No active batches available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {batches.map((b) => {
                const isCurrentBatch = data.student?.batch?.id === b.id;
                return (
                  <div 
                    key={b.id} 
                    className={`glass-panel p-5 rounded-2xl border flex flex-col justify-between h-48 transition-all ${
                      isCurrentBatch 
                        ? 'border-indigo-500 bg-indigo-500/[0.03] shadow-md shadow-indigo-500/5' 
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-extrabold text-[9px] uppercase tracking-wide">
                          {b.class?.name || 'Class Subject'}
                        </span>
                        {isCurrentBatch && (
                          <span className="text-[9px] text-emerald-400 font-black tracking-wide uppercase flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Enrolled
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-slate-100 mt-3">{b.name}</h3>
                      <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        {b.start_time.slice(0, 5)} - {b.end_time.slice(0, 5)}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        Days: {b.days_of_week.map((d: number) => getDayName(d)).join(', ')}
                      </p>
                    </div>

                    <button
                      onClick={() => handleEnrollBatch(b.id)}
                      disabled={isCurrentBatch}
                      className={`w-full h-8.5 rounded-xl text-[10px] font-extrabold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        isCurrentBatch
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white glow-indigo active:scale-[0.98]'
                      }`}
                    >
                      {isCurrentBatch ? 'Active Enrolled' : 'Register Class Batch'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: MEET COACHES ── */}
      {activeTab === 'coaches' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div>
            <h2 className="text-xl font-bold text-white">Meet Our Certified Coaches</h2>
            <p className="text-xs text-slate-400 mt-1">Explore verified instructors and view public profile cards</p>
          </div>

          {loadingCoaches ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-xs text-slate-500">Retrieving master coach files...</span>
            </div>
          ) : coachesList.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-12 text-center">No active coaches logged yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {coachesList.map((coach) => (
                <div key={coach.id} className="glass-panel p-6 rounded-2xl border border-white/10 flex flex-col md:flex-row gap-4 justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-full bg-slate-800 border border-white/10 overflow-hidden flex items-center justify-center text-indigo-400 font-bold shrink-0">
                      {coach.users?.avatar_url ? (
                        <img src={coach.users.avatar_url} alt="Coach" className="w-full h-full object-cover" />
                      ) : (
                        <span>{coach.users?.first_name?.[0] || 'C'}{coach.users?.last_name?.[0]}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100">
                        {coach.users?.first_name || 'Coach'} {coach.users?.last_name || ''}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-extrabold text-[8px] uppercase tracking-wider">
                          {coach.coach_categories?.find((cc: any) => cc.is_primary)?.subcategory?.name ?? 'Coach'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-semibold">
                          {coach.experience_years} Years Exp.
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-3 line-clamp-2 max-w-sm leading-normal">
                        {coach.bio || 'Professional coaching staff dedicated to elite athletic training.'}
                      </p>
                      <div className="flex items-center gap-1 mt-3">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span className="text-xs font-extrabold text-amber-400">{Number(coach.avg_rating || 0).toFixed(1)}</span>
                        <span className="text-[10px] text-slate-600 font-bold ml-1 uppercase">Rating</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-end self-end shrink-0 w-full md:w-auto">
                    <a
                      href={`/coaches/${coach.public_profile_slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-4 rounded-xl border border-indigo-500/25 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 hover:text-indigo-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all w-full md:w-auto hover:border-indigo-500/40 cursor-pointer"
                    >
                      Public Profile
                      <ChevronRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: BECOME A COACH ── */}
      {activeTab === 'become-coach' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div>
            <h2 className="text-xl font-bold text-white font-sans flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-400" /> Apply to Become a Coach
            </h2>
            <p className="text-xs text-slate-400 mt-1">Submit your professional profile and onboarding documents for Admin review</p>
          </div>

          {checkingCoach ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-xs text-slate-500">Checking registry logs...</span>
            </div>
          ) : coachProfile ? (
            <div className="glass-panel p-8 rounded-3xl border border-indigo-500/20 bg-indigo-500/[0.01] space-y-6 text-center max-w-xl mx-auto">
              
              {coachProfile.account_status !== 'Active' ? (
                <>
                  <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto animate-pulse">
                    <RefreshCw className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Application Under Review</h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed px-4">
                      Thank you for applying! Your coach application to join the academy staff is currently **Pending Document Verification and Admin Review**. 
                      Once verified, you will be onboarded as an active instructor.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-white/5 text-left space-y-3">
                    <h4 className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest">Submitted Application</h4>
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5 text-xs">
                      <p className="text-slate-300"><strong>Application Status:</strong> {coachProfile.account_status}</p>
                      <p className="text-slate-300"><strong>Skill Domain:</strong> {coachProfile.coach_categories?.find((cc: any) => cc.is_primary)?.subcategory?.name ?? '—'}</p>
                      <p className="text-slate-300"><strong>Experience Profile:</strong> {coachProfile.experience_years} Years</p>
                      <p className="text-slate-300"><strong>Application Date:</strong> {new Date(coachProfile.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="text-left space-y-2">
                    <h4 className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest">Verification Documents</h4>
                    {coachDocs.map((doc) => (
                      <div key={doc.id} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs">
                        <span className="text-slate-300">{doc.document_type} ({doc.document_name})</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold uppercase tracking-wider animate-pulse">
                          Pending Verification
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                    <CheckCircle2 className="w-7 h-7 animate-bounce" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Active Coach Profile</h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed px-4">
                      Congratulations! Your application has been approved. You are registered as an **Active Coach** with public profile enabled.
                    </p>
                  </div>
                  <div className="flex justify-center gap-3">
                    <a
                      href={`/coaches/${coachProfile.public_profile_slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 h-10 rounded-xl btn-premium text-xs font-bold flex items-center gap-1.5"
                    >
                      View Public Profile <ChevronRight className="w-4 h-4" />
                    </a>
                  </div>
                </>
              )}

            </div>
          ) : (
            <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-6">
              
              {onboardError && (
                <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs flex items-start gap-2.5 animate-pulse">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{onboardError}</span>
                </div>
              )}

              <form onSubmit={handleBecomeCoachSubmit} className="space-y-5 text-xs text-slate-300">
                <div className="border-b border-white/10 pb-2">
                  <h3 className="text-sm font-semibold text-slate-200">1. Professional Coaching Information</h3>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                    Coaching Speciality Domain *
                  </label>
                  <CategoryPicker
                    categories={coachCategories}
                    value={categorySelection}
                    onChange={setCategorySelection}
                    theme="dark"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Experience Years */}
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                      Years of Experience *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(e.target.value)}
                      placeholder="e.g. 5"
                      className="w-full h-10 px-3.5 rounded-xl glass-input text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Qualification */}
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                      Highest Professional Qualification
                    </label>
                    <input
                      type="text"
                      value={qualification}
                      onChange={(e) => setQualification(e.target.value)}
                      placeholder="e.g. B.P.Ed, NSNIS Diploma"
                      className="w-full h-10 px-3.5 rounded-xl glass-input text-xs"
                    />
                  </div>

                  {/* Languages */}
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                      Languages Known (comma-separated) *
                    </label>
                    <input
                      type="text"
                      required
                      value={languages}
                      onChange={(e) => setLanguages(e.target.value)}
                      placeholder="English, Hindi"
                      className="w-full h-10 px-3.5 rounded-xl glass-input text-xs"
                    />
                  </div>
                </div>

                {/* Bio text area */}
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                    Professional Bio (min 20 characters) *
                  </label>
                  <textarea
                    required
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Provide a detailed professional bio highlighting your teaching methodology and goals..."
                    className="w-full h-24 p-3.5 rounded-xl glass-input text-xs resize-none"
                  />
                </div>

                {/* Certifications text area */}
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                    Certifications & Achievements Summary
                  </label>
                  <textarea
                    value={certifications}
                    onChange={(e) => setCertifications(e.target.value)}
                    placeholder="List your key professional certificates, awards, and achievements..."
                    className="w-full h-20 p-3.5 rounded-xl glass-input text-xs resize-none"
                  />
                </div>

                <div className="border-b border-white/10 pt-2 pb-2">
                  <h3 className="text-sm font-semibold text-slate-200">2. Verification Document Uploads</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Government ID */}
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                      Government Issued ID (Aadhar, PAN, Passport) *
                    </label>
                    <div className="border border-dashed border-white/10 hover:border-indigo-500/30 rounded-xl p-5 bg-white/[0.01] transition-colors relative flex flex-col items-center justify-center text-center cursor-pointer">
                      <input
                        type="file"
                        required
                        accept="image/*,application/pdf"
                        onChange={(e) => e.target.files && e.target.files.length > 0 && setGovIdFile(e.target.files[0])}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      {govIdFile ? (
                        <div className="flex items-center gap-2 text-indigo-400">
                          <FileImage className="w-5 h-5 glow-indigo" />
                          <span className="font-bold truncate max-w-[150px]">{govIdFile.name}</span>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-slate-500 mb-1.5" />
                          <span className="text-[10px] text-slate-400">Upload Government ID File</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Resume / Certification */}
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                      Resume or Professional Certification File (Optional)
                    </label>
                    <div className="border border-dashed border-white/10 hover:border-indigo-500/30 rounded-xl p-5 bg-white/[0.01] transition-colors relative flex flex-col items-center justify-center text-center cursor-pointer">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => e.target.files && e.target.files.length > 0 && setResumeFile(e.target.files[0])}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      {resumeFile ? (
                        <div className="flex items-center gap-2 text-indigo-400">
                          <FileImage className="w-5 h-5 glow-indigo" />
                          <span className="font-bold truncate max-w-[150px]">{resumeFile.name}</span>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-slate-500 mb-1.5" />
                          <span className="text-[10px] text-slate-400">Upload Professional Resume</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingCoach}
                    className="h-10 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer glow-indigo"
                  >
                    {submittingCoach ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      'Submit Onboarding Application'
                    )}
                  </button>
                </div>
              </form>

            </div>
          )}

        </div>
      )}

      {/* ── Modal: Submit Payment Proof ── */}
      {submittingFine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl space-y-5 relative">
            <button
              onClick={() => {
                setSubmittingFine(null);
                setScreenshotFile(null);
                setUploadError(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-bold tracking-widest uppercase mb-1">
                <Sparkles className="w-3.5 h-3.5" /> Settling Account
              </div>
              <h3 className="text-lg font-bold text-white">Upload Payment Proof</h3>
              <p className="text-xs text-slate-400">
                Please transfer ₹{Number(submittingFine.amount).toLocaleString()} and submit transaction details.
              </p>
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-[10px] font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitProof} className="space-y-4 text-xs">
              
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                  Select Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full px-3.5 h-10 rounded-xl glass-input text-xs"
                >
                  <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                  <option value="bank_transfer">Bank Wire Transfer</option>
                  <option value="cash">Direct Cash to Admin</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                  UPI / Bank Reference Transaction ID
                </label>
                <input
                  type="text"
                  required
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. UPI TXN ID: 98327429871"
                  className="w-full px-3.5 h-10 rounded-xl glass-input text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                  Upload screenshot Receipt
                </label>
                <div className="border border-dashed border-white/10 hover:border-indigo-500/30 rounded-xl p-6 bg-white/[0.01] hover:bg-white/[0.02] transition-colors relative flex flex-col items-center justify-center text-center cursor-pointer">
                  <input
                    type="file"
                    required
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {screenshotFile ? (
                    <div className="flex items-center gap-2 text-indigo-400">
                      <FileImage className="w-5 h-5 glow-indigo" />
                      <span className="font-bold truncate max-w-[200px]">{screenshotFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-500 mb-2" />
                      <span className="text-[10px] text-slate-400">Click or drag screenshot here to upload</span>
                      <span className="text-[9px] text-slate-600 mt-0.5">JPEG or PNG files only</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setSubmittingFine(null);
                    setScreenshotFile(null);
                    setUploadError(null);
                  }}
                  className="btn-secondary h-10 px-4 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="btn-primary h-10 px-5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer glow-indigo"
                >
                  {uploading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Submit Proof Receipt
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
      {/* ── Modal: Request to Join Batch ── */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl space-y-5 relative">
            <button
              onClick={() => setShowJoinModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-bold tracking-widest uppercase mb-1">
                <Sparkles className="w-3.5 h-3.5" /> Batch Enrollment Registry
              </div>
              <h3 className="text-lg font-bold text-white">Request to Join Batch</h3>
              <p className="text-xs text-slate-400">Request registration for an active class batch stream.</p>
            </div>

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                  Select Class Batch
                </label>
                {(() => {
                  const options = [
                    { value: '', label: 'Choose class batch...' },
                    ...batches.map((b: any) => ({
                      value: b.id,
                      label: `${b.class?.name || 'Class'} - ${b.name} (${b.start_time.slice(0, 5)} - ${b.end_time.slice(0, 5)})`
                    }))
                  ];
                  return (
                    <CustomSelect
                      value={joinBatchId}
                      onChange={setJoinBatchId}
                      options={options}
                      placeholder="Choose class batch..."
                    />
                  );
                })()}
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">
                  Add Request Note / Remark
                </label>
                <textarea
                  value={joinRemark}
                  onChange={(e) => setJoinRemark(e.target.value)}
                  placeholder="e.g. Requesting transfer due to changed scheduling availability..."
                  rows={3}
                  className="w-full p-3 rounded-xl glass-input text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="btn-secondary h-10 px-4 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingJoin || !joinBatchId}
                  className="btn-primary h-10 px-5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer glow-indigo"
                >
                  {submittingJoin && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
