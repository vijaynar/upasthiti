'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Edit2,
  Plus,
  Sparkles,
  UserCog,
  X,
  XCircle,
  BookOpen,
  Waves,
  Trophy,
  Target,
  Award,
  Activity,
  Heart,
  Trash2,
  Users,
} from 'lucide-react';
import CustomSelect from '../components/CustomSelect';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface ClassItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface BatchItem {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  max_capacity: number;
  is_active: boolean;
  class_id: string;
  classes: {
    name: string;
  };
  students?: { id: string }[];
}

interface CoachAssignment {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  assigned_days: number[] | null;
  coach: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url: string | null;
    coach_profile: {
      coach_categories: { is_primary: boolean; subcategory: { name: string } | null }[] | null;
      availability_slots?: string | null;
      hourly_rate?: number;
    } | null;
  };
}

interface AvailableCoach {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  coach_profile: {
    coach_categories: { is_primary: boolean; subcategory: { name: string } | null }[] | null;
    availability_slots?: string | null;
    hourly_rate?: number;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the appropriate Lucide icon corresponding to the class name context. */
function getClassIcon(className: string) {
  const name = className.toLowerCase();
  if (name.includes('swim') || name.includes('water') || name.includes('pool') || name.includes('aqua')) {
    return Waves;
  }
  if (name.includes('badminton') || name.includes('tennis') || name.includes('squash') || name.includes('racket') || name.includes('table tennis') || name.includes('ping pong')) {
    return Target;
  }
  if (name.includes('karate') || name.includes('martial') || name.includes('taekwondo') || name.includes('judo') || name.includes('fight') || name.includes('combat') || name.includes('kung fu') || name.includes('kickboxing')) {
    return Trophy;
  }
  if (name.includes('yoga') || name.includes('meditation') || name.includes('health') || name.includes('mindfulness') || name.includes('wellness') || name.includes('stretch')) {
    return Heart;
  }
  if (name.includes('cricket') || name.includes('football') || name.includes('soccer') || name.includes('basket') || name.includes('sport') || name.includes('athletics')) {
    return Trophy;
  }
  if (name.includes('fitness') || name.includes('gym') || name.includes('workout') || name.includes('crossfit') || name.includes('cardio') || name.includes('strength')) {
    return Activity;
  }
  if (name.includes('dance') || name.includes('music') || name.includes('art') || name.includes('creative') || name.includes('ballet') || name.includes('hip hop')) {
    return Sparkles;
  }
  return BookOpen;
}

/** Generates a tailored class description based on the class name. */
function generateClassDescription(className: string): string {
  const name = className.trim();
  if (!name) return 'Please enter a class name first to generate a description.';
  const lowerName = name.toLowerCase();
  if (lowerName.includes('swim')) {
    return `An immersive course focused on building water confidence, refining swim strokes, and teaching essential water safety skills. Designed to develop efficient technique and stamina in a supportive environment.`;
  }
  if (lowerName.includes('badminton')) {
    return `Master the fundamentals of badminton, including grip techniques, footwork, shot precision, and match strategies. Suitable for players looking to enhance agility, reflexes, and court performance.`;
  }
  if (lowerName.includes('karate') || lowerName.includes('martial') || lowerName.includes('taekwondo')) {
    return `A comprehensive training program emphasizing self-defense techniques, physical conditioning, discipline, and respect. Students progress through belt ranks while building focus and core strength.`;
  }
  if (lowerName.includes('yoga') || lowerName.includes('meditation')) {
    return `A holistic practice combining physical postures, breathing exercises, and mindful meditation to improve flexibility, balance, and mental clarity. Perfect for stress reduction and physical alignment.`;
  }
  if (lowerName.includes('dance')) {
    return `Express creativity and build rhythm through our vibrant dance sessions. Covers choreography, movement dynamics, and musicality across various styles to boost confidence and physical coordination.`;
  }
  if (lowerName.includes('cricket')) {
    return `Develop core cricketing skills, including batting stance, bowling action, fielding drills, and game tactical awareness. Focuses on team collaboration, sportsmanship, and physical endurance.`;
  }
  if (lowerName.includes('fitness') || lowerName.includes('gym')) {
    return `A high-energy functional fitness class designed to build strength, cardiovascular endurance, and core stability. Features guided circuit training and personalized goal tracking for all fitness levels.`;
  }
  return `A structured course in ${name} designed to build fundamental skills, enhance physical coordination, and foster a love for learning. Open to all skill levels with professional guidance and progress assessments.`;
}

/** Returns true if the coach's availability_slots string overlaps with the batch time window. */
function slotsOverlap(
  availabilitySlots: string | null,
  batchStart: string,
  batchEnd: string,
): boolean {
  if (!availabilitySlots) return false;
  // availability_slots is expected as "HH:MM-HH:MM,HH:MM-HH:MM" CSV or similar
  const toMinutes = (t: string) => {
    const parts = t.trim().split(':');
    return parseInt(parts[0] ?? '0', 10) * 60 + parseInt(parts[1] ?? '0', 10);
  };
  const bStart = toMinutes(batchStart.slice(0, 5));
  const bEnd = toMinutes(batchEnd.slice(0, 5));

  const ranges = availabilitySlots.split(',');
  for (const range of ranges) {
    const [s, e] = range.trim().split('-');
    if (!s || !e) continue;
    const sMin = toMinutes(s);
    const eMin = toMinutes(e);
    // Overlap condition
    if (sMin < bEnd && eMin > bStart) return true;
  }
  return false;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BatchesPage() {
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [filterClassId, setFilterClassId] = useState<string | null>(null);
  
  const filteredBatches = filterClassId
    ? batches.filter((b) => b.class_id === filterClassId)
    : batches;

  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  // ── Class form state ──────────────────────────────────────────────────────
  const [className, setClassName] = useState('');
  const [classDescription, setClassDescription] = useState('');
  const [isClassActive, setIsClassActive] = useState(true);

  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchItem | null>(null);

  // ── Coach management state ────────────────────────────────────────────────
  const [assignments, setAssignments] = useState<Record<string, CoachAssignment[]>>({});
  const [managingBatch, setManagingBatch] = useState<BatchItem | null>(null);
  const [availableCoaches, setAvailableCoaches] = useState<AvailableCoach[]>([]);
  const [userRole, setUserRole] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [coachStatus, setCoachStatus] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');
  const [assignLoading, setAssignLoading] = useState(false);
  // Day picker for coach assignment
  const [assignDaySelections, setAssignDaySelections] = useState<Set<number>>(new Set());
  const [pendingDaySelections, setPendingDaySelections] = useState<Record<string, Set<number>>>({});

  // ── Batch form state ──────────────────────────────────────────────────────
  const [classId, setClassId] = useState('');
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [maxCapacity, setMaxCapacity] = useState('30');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [isActive, setIsActive] = useState(true);

  const supabase = createBrowserClient();
  const classesList = classes.filter(c => c.is_active);

  const weekdayNames: Record<number, string> = {
    1: 'Mon',
    2: 'Tue',
    3: 'Wed',
    4: 'Thu',
    5: 'Fri',
    6: 'Sat',
    7: 'Sun',
  };

  // ─── Data Loaders ──────────────────────────────────────────────────────────

  const loadUserRole = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile) {
        const role = (profile as { role: string }).role ?? '';
        setUserRole(role);
        if (role === 'coach') {
          const { data: coachProfile } = await supabase
            .from('coaches')
            .select('account_status')
            .eq('id', user.id)
            .single();
          if (coachProfile) {
            setCoachStatus(coachProfile.account_status);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load user role:', err);
    }
  };

  const loadAvailableCoaches = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(
          `id, first_name, last_name, email, avatar_url,
           coach_profile:coaches(coach_categories(is_primary, subcategory:subcategories(name)))`,
        )
        .eq('role', 'coach')
        .eq('is_active', true)
        .order('first_name');
      if (error) throw error;
      setAvailableCoaches((data ?? []) as unknown as AvailableCoach[]);
    } catch (err) {
      console.error('Failed to load coaches:', err);
    }
  };

  const loadAssignments = async (batchIds: string[]) => {
    if (batchIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('coach_batch_assignments')
        .select(
          `id, batch_id, status, assigned_days,
           coach:coach_id(id, first_name, last_name, email, avatar_url,
             coach_profile:coaches(coach_categories(is_primary, subcategory:subcategories(name))))`,
        )
        .in('batch_id', batchIds);
      if (error) throw error;

      const grouped: Record<string, CoachAssignment[]> = {};
      for (const row of (data ?? []) as unknown as (CoachAssignment & { batch_id: string })[]) {
        if (!grouped[row.batch_id]) grouped[row.batch_id] = [];
        grouped[row.batch_id].push({
          id: row.id,
          status: row.status,
          assigned_days: (row as any).assigned_days ?? null,
          coach: row.coach,
        });
      }
      setAssignments(grouped);
    } catch (err) {
      console.error('Failed to load assignments:', err);
    }
  };

  const loadBatchesAndClasses = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile) return;
      const tenantId = (profile as { tenant_id: string }).tenant_id;

      // 1. Load Batches
      const { data: batchData, error: batchErr } = await supabase
        .from('batches')
        .select(
          'id, name, start_time, end_time, days_of_week, max_capacity, is_active, class_id, classes:class_id(name), students(id)',
        )
        .eq('tenant_id', tenantId)
        .order('start_time');

      if (batchErr) throw batchErr;

      // 2. Load Classes for dropdown selection and management
      const { data: classData, error: classErr } = await supabase
        .from('classes')
        .select('id, name, description, is_active')
        .eq('tenant_id', tenantId)
        .order('name');

      if (classErr) throw classErr;

      const loadedBatches = (batchData ?? []) as unknown as BatchItem[];
      setBatches(loadedBatches);
      setClasses((classData ?? []) as ClassItem[]);

      // 3. Load coach assignments for all batches
      await loadAssignments(loadedBatches.map((b) => b.id));
    } catch (err) {
      console.error('Failed to load scheduling data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserRole();
    loadAvailableCoaches();
    loadBatchesAndClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize day selections when a batch is opened for management
  useEffect(() => {
    if (managingBatch) {
      setAssignDaySelections(new Set(managingBatch.days_of_week ?? []));
      setSelectedCoachId('');

      // Initialize pendingDaySelections for any pending assignments in this batch
      const pendingList = (assignments[managingBatch.id] ?? []).filter(a => a.status === 'pending');
      const selections: Record<string, Set<number>> = {};
      for (const a of pendingList) {
        selections[a.id] = new Set(a.assigned_days ?? managingBatch.days_of_week ?? []);
      }
      setPendingDaySelections(selections);
    }
  }, [managingBatch?.id, assignments]);

  // ─── Success flash helper ──────────────────────────────────────────────────

  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // ─── Batch form helpers ────────────────────────────────────────────────────

  const handleDayToggle = (day: number) => {
    if (daysOfWeek.includes(day)) {
      setDaysOfWeek(daysOfWeek.filter((d) => d !== day));
    } else {
      setDaysOfWeek([...daysOfWeek, day].sort());
    }
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !name.trim() || daysOfWeek.length === 0) {
      alert('Please complete all scheduling fields.');
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile) return;

      // Format time as HH:MM:SS for postgres TIME format
      const formattedStart = startTime.length === 5 ? `${startTime}:00` : startTime;
      const formattedEnd = endTime.length === 5 ? `${endTime}:00` : endTime;

      if (editingBatch) {
        // Edit Mode
        const { error } = await supabase
          .from('batches')
          .update({
            name,
            start_time: formattedStart,
            end_time: formattedEnd,
            days_of_week: daysOfWeek,
            max_capacity: parseInt(maxCapacity) || 30,
            is_active: isActive,
          })
          .eq('id', editingBatch.id);

        if (error) throw error;
      } else {
        // Add Mode
        const { error } = await supabase
          .from('batches')
          .insert({
            tenant_id: (profile as { tenant_id: string }).tenant_id,
            class_id: classId,
            name,
            start_time: formattedStart,
            end_time: formattedEnd,
            days_of_week: daysOfWeek,
            max_capacity: parseInt(maxCapacity) || 30,
            is_active: true,
          });

        if (error) throw error;
      }

      setClassId('');
      setName('');
      setStartTime('09:00');
      setEndTime('10:00');
      setMaxCapacity('30');
      setDaysOfWeek([]);
      setIsActive(true);
      setShowAddModal(false);
      setEditingBatch(null);
      await loadBatchesAndClasses();
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save batch slot.');
    }
  };

  // ─── Class form handlers ───────────────────────────────────────────────────

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile) return;

      if (editingClass) {
        // Edit Mode
        const { error } = await supabase
          .from('classes')
          .update({
            name: className,
            description: classDescription || null,
            is_active: isClassActive,
          })
          .eq('id', editingClass.id);

        if (error) throw error;
        flashSuccess('Class updated successfully.');
      } else {
        // Add Mode
        const { error } = await supabase
          .from('classes')
          .insert({
            tenant_id: profile.tenant_id,
            name: className,
            description: classDescription || null,
            is_active: true,
          });

        if (error) throw error;
        flashSuccess('Class registered successfully.');
      }

      setClassName('');
      setClassDescription('');
      setIsClassActive(true);
      setShowClassModal(false);
      setEditingClass(null);
      await loadBatchesAndClasses();
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save class.');
    }
  };

  const handleEditClassClick = (item: ClassItem) => {
    setEditingClass(item);
    setClassName(item.name);
    setClassDescription(item.description || '');
    setIsClassActive(item.is_active);
    setShowClassModal(true);
  };

  const handleToggleClassStatus = async (item: ClassItem) => {
    try {
      const { error } = await supabase
        .from('classes')
        .update({ is_active: !item.is_active })
        .eq('id', item.id);

      if (error) throw error;
      flashSuccess(`Class status toggled.`);
      await loadBatchesAndClasses();
    } catch (err) {
      console.error('Toggle status failed:', err);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!confirm('Are you sure you want to delete this class? This action cannot be undone.')) return;
    try {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', classId);

      if (error) throw error;
      flashSuccess('Class deleted successfully.');
      await loadBatchesAndClasses();
    } catch (err) {
      console.error('Delete class failed:', err);
      alert('Failed to delete class.');
    }
  };

  const handleEditClick = (item: BatchItem) => {
    setEditingBatch(item);
    setClassId(item.class_id);
    setName(item.name);
    // Strip trailing seconds for html time input ("09:00:00" -> "09:00")
    setStartTime(item.start_time.slice(0, 5));
    setEndTime(item.end_time.slice(0, 5));
    setMaxCapacity(item.max_capacity.toString());
    setDaysOfWeek(item.days_of_week);
    setIsActive(item.is_active);
    setShowAddModal(true);
  };

  // ─── Coach management handlers ─────────────────────────────────────────────

  /** Admin assigns a coach directly to a batch (status → approved) */
  const handleAssignCoach = async (coachId: string, batchId: string) => {
    if (!coachId || !batchId || !managingBatch) return;
    setAssignLoading(true);
    const batchDays = managingBatch.days_of_week ?? [];
    const selectedArr = Array.from(assignDaySelections).sort((a, b) => a - b);
    // null = all batch days; otherwise send the subset
    const isAll = selectedArr.length === batchDays.length &&
      batchDays.every(d => selectedArr.includes(d));
    try {
      const res = await fetch('/api/v1/coaches/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId,
          batchId,
          assignedDays: isAll ? null : selectedArr,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadAssignments(batches.map((b) => b.id));
      setSelectedCoachId('');
      setAssignDaySelections(new Set(batchDays));
      flashSuccess('Coach assigned successfully.');
    } catch (err) {
      console.error('Assign coach failed:', err);
      alert('Failed to assign coach.');
    } finally {
      setAssignLoading(false);
    }
  };

  /** Approve a pending assignment */
  const handleApproveAssignment = async (assignmentId: string) => {
    if (!managingBatch) return;
    const batchDays = managingBatch.days_of_week ?? [];
    const selections = pendingDaySelections[assignmentId] || new Set(batchDays);
    const selectedArr = Array.from(selections).sort((a, b) => a - b);
    const isAll = selectedArr.length === batchDays.length &&
      batchDays.every(d => selectedArr.includes(d));

    try {
      const res = await fetch('/api/v1/coaches/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId,
          status: 'approved',
          assignedDays: isAll ? null : selectedArr
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadAssignments(batches.map((b) => b.id));
      flashSuccess('Assignment approved.');
    } catch (err) {
      console.error('Approve failed:', err);
      alert('Failed to approve assignment.');
    }
  };

  /** Reject a pending assignment */
  const handleRejectAssignment = async (assignmentId: string) => {
    try {
      const res = await fetch('/api/v1/coaches/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, status: 'rejected' }),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadAssignments(batches.map((b) => b.id));
      flashSuccess('Assignment rejected.');
    } catch (err) {
      console.error('Reject failed:', err);
      alert('Failed to reject assignment.');
    }
  };

  /** Admin removes an approved coach from a batch */
  const handleRemoveCoach = async (coachId: string, batchId: string) => {
    if (!confirm('Remove this coach from the batch?')) return;
    try {
      const res = await fetch(
        `/api/v1/coaches/assignments?coachId=${coachId}&batchId=${batchId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(await res.text());
      await loadAssignments(batches.map((b) => b.id));
      flashSuccess('Coach removed from batch.');
    } catch (err) {
      console.error('Remove coach failed:', err);
      alert('Failed to remove coach.');
    }
  };

  /** Coach self-requests assignment to a batch (status → pending) */
  const handleRequestAssignment = async (batchId: string) => {
    try {
      const res = await fetch('/api/v1/coaches/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: currentUserId, batchId, status: 'pending' }),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadAssignments(batches.map((b) => b.id));
      flashSuccess('Request sent! Awaiting admin approval.');
    } catch (err) {
      console.error('Request assignment failed:', err);
      alert('Failed to submit assignment request.');
    }
  };

  // ─── Derived helpers ───────────────────────────────────────────────────────

  const isAdminOrSuperadmin = userRole === 'admin' || userRole === 'superadmin';
  const isCoachRole = userRole === 'coach';

  /** Coaches already assigned to managingBatch (any status) */
  const assignedCoachIds = managingBatch
    ? (assignments[managingBatch.id] ?? []).map((a) => a.coach.id)
    : [];

  /** Coaches not yet assigned to the currently managing batch */
  const unassignedCoaches = managingBatch
    ? availableCoaches.filter((c) => !assignedCoachIds.includes(c.id))
    : [];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── Success Flash ── */}
      {successMsg && (
        <div className="fixed top-4 right-4 z-[100] flex items-center gap-2 bg-emerald-900/80 border border-emerald-500/30 text-emerald-300 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-4 h-4" />
          {successMsg}
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold tracking-widest uppercase mb-1">
            <Sparkles className="w-4 h-4" /> Academy Administration
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Batch Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure your academic course streams, class slots, active check-in schedules, and roster coach assignments.
          </p>
        </div>
      </div>

      {/* ── Section 1: Class Streams ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" /> Class Streams
            </h2>
            <p className="text-[11px] text-slate-400">Course categories, subjects, or sports disciplines</p>
          </div>
          {isAdminOrSuperadmin && (
            <button
              onClick={() => {
                setEditingClass(null);
                setClassName('');
                setClassDescription('');
                setIsClassActive(true);
                setShowClassModal(true);
              }}
              className="btn-premium h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add New Class
            </button>
          )}
        </div>

        {loading ? (
          <div className="h-32 flex items-center justify-center">
            <div className="w-6 h-6 border-3 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin glow-indigo" />
          </div>
        ) : classes.length === 0 ? (
          <div className="glass-panel p-8 rounded-2xl text-center max-w-md mx-auto">
            <BookOpen className="w-10 h-10 text-indigo-400/40 mx-auto mb-3" />
            <h3 className="text-xs font-bold text-white mb-1">No Classes Registered</h3>
            <p className="text-[10px] text-slate-500 leading-relaxed mb-4">
              Register your institute's subjects, courses, or disciplines (e.g. Advanced Swimming, Intermediate Karate).
            </p>
            {isAdminOrSuperadmin && (
              <button
                onClick={() => setShowClassModal(true)}
                className="btn-premium h-8 px-3 rounded-lg text-[10px] font-bold cursor-pointer"
              >
                Create Your First Class
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classes.map((item) => {
              const classBatches = batches.filter((b) => b.class_id === item.id);
              const batchesCount = classBatches.length;
              const sessionsPerWeek = classBatches.reduce((acc, b) => acc + (b.days_of_week?.length || 0), 0);
              const IconComponent = getClassIcon(item.name);

              return (
                <div
                  key={item.id}
                  onClick={() => setFilterClassId(prev => prev === item.id ? null : item.id)}
                  className={`glass-panel p-5 rounded-2xl flex flex-col justify-between min-h-[220px] relative group transition-all duration-300 cursor-pointer ${
                    filterClassId === item.id
                      ? 'border-indigo-500 ring-2 ring-indigo-500/25 bg-indigo-500/5 shadow-lg shadow-indigo-500/10 scale-[1.02]'
                      : 'border-white/10 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5'
                  }`}
                  style={{
                    background: filterClassId === item.id
                      ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(99, 102, 241, 0.02) 100%)'
                      : 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%)',
                  }}
                >
                  <div>
                    {/* Top Row: Icon Container and Active Badge */}
                    <div className="flex justify-between items-start">
                      <div className="w-12 h-12 rounded-xl bg-slate-900/40 border border-white/10 flex items-center justify-center text-slate-300">
                        <IconComponent className="w-6 h-6" />
                      </div>
                      <div className="flex items-center gap-2">
                        {filterClassId === item.id && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 animate-pulse">
                            Filtering
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleClassStatus(item);
                          }}
                          disabled={!isAdminOrSuperadmin}
                          className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border transition-all cursor-pointer
                          ${item.is_active 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : 'bg-slate-800 border-white/5 text-slate-500'} disabled:cursor-default`}
                        >
                          {item.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                    </div>

                    {/* Class Title */}
                    <h3 className="text-base font-extrabold text-white mt-4 tracking-tight">
                      {item.name}
                    </h3>

                    {/* Class Description */}
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                      {item.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Bottom Stats & Action buttons */}
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-end justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{sessionsPerWeek} Session{sessionsPerWeek !== 1 ? 's' : ''}/Week</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>{batchesCount} Batch{batchesCount !== 1 ? 'es' : ''}</span>
                      </div>
                    </div>

                    {isAdminOrSuperadmin && (
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClassClick(item);
                          }}
                          className="btn-secondary w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white border border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                          title="Edit Class Details"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {batchesCount === 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClass(item.id);
                            }}
                            className="btn-secondary w-9 h-9 rounded-xl flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/30 transition-colors cursor-pointer"
                            title="Delete Class"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Horizontal Divider */}
      <hr className="border-white/10" />

      {/* ── Section 2: Batch Scheduling Control ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" /> Batch assignment
              {filterClassId && (
                <span className="text-xs font-semibold text-slate-400 bg-white/5 px-2.5 py-1 rounded-full flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200">
                  filtered by Class
                  <button 
                    onClick={() => setFilterClassId(null)}
                    className="hover:text-white text-indigo-400 hover:bg-white/5 rounded-full p-0.5 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-400">Manage batch times, active days, student capacity, and coaching rosters</p>
          </div>
          {isAdminOrSuperadmin && (
            <button
              onClick={() => {
                setEditingBatch(null);
                setClassId('');
                setName('');
                setStartTime('09:00');
                setEndTime('10:00');
                setMaxCapacity('30');
                setDaysOfWeek([]);
                setIsActive(true);
                setShowAddModal(true);
              }}
              className="btn-premium h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add New Batch
            </button>
          )}
        </div>

        {loading ? (
          <div className="h-32 flex items-center justify-center">
            <div className="w-6 h-6 border-3 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin glow-indigo" />
          </div>
        ) : batches.length === 0 ? (
          <div className="glass-panel p-8 rounded-2xl text-center max-w-md mx-auto">
            <Calendar className="w-10 h-10 text-indigo-400/40 mx-auto mb-3" />
            <h3 className="text-xs font-bold text-white mb-1">No Active Batches</h3>
            <p className="text-[10px] text-slate-500 leading-relaxed mb-4">
              Configure batch slots, capacity limits, and assign coaches to schedules.
            </p>
            {isAdminOrSuperadmin && (
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-premium h-8 px-3 rounded-lg text-[10px] font-bold cursor-pointer"
              >
                Create Your First Batch
              </button>
            )}
          </div>
        ) : (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
               <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-bold text-slate-300">
                  <th className="p-4 w-[15%] min-w-[120px]">Batch Name</th>
                  <th className="p-4 w-[15%] min-w-[130px]">Linked Course / Class</th>
                  <th className="p-4 w-[12%] min-w-[120px]">Scheduled Hours</th>
                  <th className="p-4 w-[18%] min-w-[160px]">Active Days</th>
                  <th className="p-4 w-[10%] min-w-[90px]">Enrolled</th>
                  <th className="p-4 w-[10%] min-w-[90px]">Max Capacity</th>
                  <th className="p-4 w-[8%] min-w-[80px]">Status</th>
                  <th className="p-4 w-[15%] min-w-[160px]">Coaches</th>
                  {isAdminOrSuperadmin && <th className="p-4 text-right w-[10%] min-w-[80px]">Actions</th>}
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-white/5 text-slate-300">
                {filteredBatches.map((item) => {
                  const batchAssignments = assignments[item.id] ?? [];
                  const approved = batchAssignments.filter((a) => a.status === 'approved');
                  const pending = batchAssignments.filter((a) => a.status === 'pending');

                  const myAssignment = isCoachRole
                    ? batchAssignments.find((a) => a.coach.id === currentUserId)
                    : null;

                  const isBatchAssigned = isCoachRole
                    ? (myAssignment && myAssignment.status === 'approved')
                    : (approved.length > 0);

                  const nameColor = isBatchAssigned
                    ? 'text-emerald-400 font-extrabold'
                    : 'text-slate-200 font-bold';

                  return (
                    <tr key={item.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className={`p-4 ${nameColor}`}>{item.name}</td>
                      <td className="p-4">{item.classes.name}</td>
                      <td className="p-4 text-slate-400 font-medium">
                        {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {item.days_of_week.map((day) => {
                            const isAssignedDay = isCoachRole && myAssignment && myAssignment.status === 'approved'
                              ? (myAssignment.assigned_days || item.days_of_week || []).includes(day)
                              : false;

                            const dayClass = isAssignedDay
                              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold"
                              : "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold";

                            return (
                              <span
                                key={day}
                                className={`px-1.5 py-0.5 rounded text-[9px] ${dayClass}`}
                              >
                                {weekdayNames[day]}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-indigo-400">{item.students?.length ?? 0} students</td>
                      <td className="p-4">{item.max_capacity} students</td>
                      <td className="p-4">
                        {isBatchAssigned ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                            <Check className="w-2.5 h-2.5" /> Assigned
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border bg-amber-500/10 border border-amber-500/20 text-amber-500">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* ── Coaches Column ── */}
                      <td className="p-4">
                        <div className="flex flex-col gap-1.5 min-w-[160px]">
                          {/* Approved coaches */}
                          {approved.map((a) => (
                            <div key={a.id} className="flex items-center gap-1.5">
                              {/* Avatar circle */}
                              <div className="w-5 h-5 rounded-full bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {a.coach.avatar_url ? (
                                  <img
                                    src={a.coach.avatar_url}
                                    alt={a.coach.first_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className="text-[8px] font-bold text-emerald-400">
                                    {a.coach.first_name.charAt(0)}
                                    {a.coach.last_name.charAt(0)}
                                  </span>
                                )}
                              </div>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 truncate max-w-[110px]">
                                {a.coach.first_name} {a.coach.last_name}
                              </span>
                            </div>
                          ))}

                          {/* Pending coaches */}
                          {pending.map((a) => (
                            <div key={a.id} className="flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] font-bold text-amber-400 truncate max-w-[120px]">
                                Pending: {a.coach.first_name} {a.coach.last_name}
                              </span>
                            </div>
                          ))}

                          {/* No coaches yet */}
                          {batchAssignments.length === 0 && (
                            <span className="text-[9px] text-slate-600 italic">No coaches</span>
                          )}

                          {/* Coach self-status + request button */}
                          {isCoachRole && (
                            <div className="mt-1 flex flex-col items-start gap-1">
                              {myAssignment && myAssignment.status !== 'rejected' ? (
                                myAssignment.status === 'approved' ? null : (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-amber-500/10 border-amber-500/20 text-amber-400">
                                    ⏳ Pending
                                  </span>
                                )
                              ) : (
                                <div className="flex flex-col items-start gap-1">
                                  {myAssignment?.status === 'rejected' && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-red-500/10 border-red-500/20 text-red-400">
                                      ✕ Rejected
                                    </span>
                                  )}
                                  <button
                                    onClick={() => {
                                      if (coachStatus !== 'Active') return;
                                      handleRequestAssignment(item.id);
                                    }}
                                    disabled={coachStatus !== 'Active'}
                                    className={`h-6 px-2 rounded-lg text-[9px] font-bold whitespace-nowrap transition-all ${
                                      coachStatus === 'Active'
                                        ? 'btn-secondary cursor-pointer'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50'
                                    }`}
                                    title={coachStatus !== 'Active' ? 'Disabled until account is Active' : ''}
                                  >
                                    {myAssignment?.status === 'rejected' ? 'Request Again' : 'Request Assignment'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Manage button for admin/superadmin */}
                          {isAdminOrSuperadmin && (
                            <button
                              onClick={() => {
                                setManagingBatch(item);
                                setSelectedCoachId('');
                              }}
                              className="mt-1 flex items-center gap-1 btn-secondary h-6 px-2 rounded-lg text-[9px] font-bold cursor-pointer whitespace-nowrap self-start"
                            >
                              <UserCog className="w-3 h-3" />
                              Manage Coaches
                            </button>
                          )}
                        </div>
                      </td>

                      {/* ── Actions Column ── */}
                      {isAdminOrSuperadmin && (
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleEditClick(item)}
                            className="btn-secondary h-7 px-2.5 rounded-lg text-[10px] font-bold cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3 mr-1 inline-block" /> Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredBatches.length === 0 && (
                  <tr>
                    <td colSpan={isAdminOrSuperadmin ? 9 : 8} className="p-8 text-center text-slate-500 italic font-medium">
                      No batches found for this class. Select another class card or click "Add New Batch" to configure one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* ── Modal: Create / Update Batch Scheduling ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md glass-panel p-6 rounded-2xl relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-6">
              {editingBatch ? 'Modify Batch Details' : 'Configure New Batch Slot'}
            </h3>

            <form onSubmit={handleSaveBatch} className="space-y-4">
              {/* Class Link Dropdown */}
              <div className="space-y-1">
                <label className="text-slate-300 text-xs font-semibold block">
                  Link to Academic Class
                </label>
                {(() => {
                  const classOptions = [
                    { value: '', label: '-- Select Class / Course --' },
                    ...classesList.map((c) => ({ value: c.id, label: c.name }))
                  ];
                  return (
                    <CustomSelect
                      value={classId}
                      onChange={setClassId}
                      options={classOptions}
                      placeholder="-- Select Class / Course --"
                      disabled={editingBatch !== null}
                    />
                  );
                })()}
              </div>

              {/* Batch Name */}
              <div className="space-y-1">
                <label className="text-slate-300 text-xs font-semibold block">Batch Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Morning 06:00 AM Slot"
                  className="w-full h-10 px-4 rounded-xl glass-input text-xs"
                />
              </div>

              {/* Times Row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 text-xs font-semibold block">Start Time</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-10 px-4 rounded-xl glass-input text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 text-xs font-semibold block">End Time</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-10 px-4 rounded-xl glass-input text-xs"
                  />
                </div>
              </div>

              {/* Capacity Limit */}
              <div className="space-y-1">
                <label className="text-slate-300 text-xs font-semibold block">Max Capacity</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(e.target.value)}
                  placeholder="30"
                  className="w-full h-10 px-4 rounded-xl glass-input text-xs"
                />
              </div>

              {/* Days of Week Multiple Selector */}
              <div className="space-y-2">
                <label className="text-slate-300 text-xs font-semibold block">
                  Scheduled Days
                </label>
                <div className="flex gap-1.5 justify-between">
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                    const selected = daysOfWeek.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleDayToggle(day)}
                        className={`flex-1 h-9 rounded-lg border text-[10px] font-bold transition-all cursor-pointer
                        ${
                          selected
                            ? 'bg-indigo-600 border-indigo-500 text-white glow-indigo'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/5'
                        }`}
                      >
                        {weekdayNames[day]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Edit Mode Status Checkbox */}
              {editingBatch && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="isBatchActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500 rounded border-white/10"
                  />
                  <label htmlFor="isBatchActive" className="text-xs text-slate-300 font-medium">
                    This scheduling slot is currently Active
                  </label>
                </div>
              )}

              {/* Form Actions */}
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary h-9 px-4 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-premium h-9 px-4 rounded-lg text-xs font-bold cursor-pointer"
                >
                  {editingBatch ? 'Update Schedule' : 'Schedule Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Manage Coaches ── */}
      {managingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg glass-panel rounded-2xl relative flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <UserCog className="w-5 h-5 text-indigo-400" />
                <div>
                  <p className="text-[10px] text-indigo-400 font-semibold uppercase tracking-widest mb-0.5">
                    Coach Assignments
                  </p>
                  <h3 className="text-sm font-bold text-white leading-tight">
                    {managingBatch.name}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setManagingBatch(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* ── Section 1: Pending Requests ── */}
              {(() => {
                const pendingList = (assignments[managingBatch.id] ?? []).filter(
                  (a) => a.status === 'pending',
                );
                return (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                        Pending Requests
                      </h4>
                      {pendingList.length > 0 && (
                        <span className="ml-auto bg-amber-500/20 text-amber-400 text-[9px] font-black px-1.5 py-0.5 rounded-full border border-amber-500/30">
                          {pendingList.length}
                        </span>
                      )}
                    </div>
                    {pendingList.length === 0 ? (
                      <p className="text-[10px] text-slate-600 italic pl-1">
                        No pending requests.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {pendingList.map((a) => (
                          <div
                            key={a.id}
                            className="flex flex-col gap-3 bg-amber-500/5 border border-amber-500/10 rounded-xl p-3"
                          >
                            <div className="flex items-center gap-3">
                              {/* Avatar */}
                              <div className="w-8 h-8 rounded-full bg-amber-600/20 border border-amber-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {a.coach.avatar_url ? (
                                  <img
                                    src={a.coach.avatar_url}
                                    alt={a.coach.first_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className="text-[10px] font-bold text-amber-400">
                                    {a.coach.first_name.charAt(0)}
                                    {a.coach.last_name.charAt(0)}
                                  </span>
                                )}
                              </div>
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-200 truncate">
                                  {a.coach.first_name} {a.coach.last_name}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate">{a.coach.email}</p>
                                {a.coach.coach_profile?.coach_categories?.find(cc => cc.is_primary)?.subcategory?.name && (
                                  <p className="text-[9px] text-indigo-400 mt-0.5 truncate">
                                    {a.coach.coach_profile.coach_categories.find(cc => cc.is_primary)?.subcategory?.name}
                                  </p>
                                )}
                              </div>
                              {/* Actions */}
                              <div className="flex gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => handleApproveAssignment(a.id)}
                                  title="Approve"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleRejectAssignment(a.id)}
                                  title="Reject"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Day picker for pending request */}
                            {managingBatch.days_of_week.length > 0 && (
                              <div className="flex flex-col gap-1.5 pt-1.5 border-t border-white/5">
                                <p className="text-slate-500 text-[9px] font-semibold">Select Days for Assignment:</p>
                                <div className="flex flex-wrap gap-1">
                                  {managingBatch.days_of_week.map((d) => {
                                    const selections = pendingDaySelections[a.id] || new Set(managingBatch.days_of_week);
                                    const isOn = selections.has(d);
                                    return (
                                      <button
                                        key={d}
                                        type="button"
                                        onClick={() => {
                                          setPendingDaySelections(prev => {
                                            const next = { ...prev };
                                            const set = new Set(next[a.id] || managingBatch.days_of_week);
                                            if (set.has(d)) set.delete(d); else set.add(d);
                                            next[a.id] = set;
                                            return next;
                                          });
                                        }}
                                        className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                                          isOn
                                            ? 'bg-indigo-600/30 border-indigo-400/50 text-indigo-300'
                                            : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300'
                                        }`}
                                      >
                                        {weekdayNames[d]}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Section 2: Active Coaches ── */}
              {(() => {
                const approvedList = (assignments[managingBatch.id] ?? []).filter(
                  (a) => a.status === 'approved',
                );
                return (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                        Active Coaches
                      </h4>
                      {approvedList.length > 0 && (
                        <span className="ml-auto bg-emerald-500/20 text-emerald-400 text-[9px] font-black px-1.5 py-0.5 rounded-full border border-emerald-500/30">
                          {approvedList.length}
                        </span>
                      )}
                    </div>
                    {approvedList.length === 0 ? (
                      <p className="text-[10px] text-slate-600 italic pl-1">
                        No coaches assigned yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {approvedList.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3"
                          >
                            {/* Avatar */}
                            <div className="w-8 h-8 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center overflow-hidden flex-shrink-0 mt-0.5">
                              {a.coach.avatar_url ? (
                                <img
                                  src={a.coach.avatar_url}
                                  alt={a.coach.first_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-400">
                                  {a.coach.first_name.charAt(0)}
                                  {a.coach.last_name.charAt(0)}
                                </span>
                              )}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-200 truncate">
                                {a.coach.first_name} {a.coach.last_name}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">{a.coach.email}</p>
                              {a.coach.coach_profile?.hourly_rate !== undefined && (
                                <p className="text-[9px] text-indigo-400 mt-0.5">
                                  ₹{a.coach.coach_profile.hourly_rate}/hr
                                </p>
                              )}
                              {/* Assigned days */}
                              {a.assigned_days && a.assigned_days.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {a.assigned_days.map(d => (
                                    <span key={d} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
                                      {weekdayNames[d]}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[9px] text-slate-600 italic mt-1">All batch days</p>
                              )}
                            </div>
                            {/* Remove */}
                            <button
                              onClick={() =>
                                handleRemoveCoach(a.coach.id, managingBatch.id)
                              }
                              title="Remove coach"
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer flex-shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Section 3: Assign Coach ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Plus className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                    Assign Coach
                  </h4>
                </div>

                {unassignedCoaches.length === 0 ? (
                  <p className="text-[10px] text-slate-600 italic pl-1">
                    All available coaches are already assigned to this batch.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* Coach dropdown */}
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px] font-semibold block">
                        Select Coach
                      </label>
                      {(() => {
                        const coachOptions = [
                          { value: '', label: '-- Choose a coach --' },
                          ...unassignedCoaches.map((c) => {
                            const overlaps = slotsOverlap(
                              c.coach_profile?.availability_slots ?? null,
                              managingBatch.start_time,
                              managingBatch.end_time,
                            );
                            const label = `${c.first_name} ${c.last_name}${
                              c.coach_profile?.availability_slots
                                ? ` — ${c.coach_profile.availability_slots}`
                                : ''
                            }${overlaps ? ' ✓' : ''}`;
                            return { value: c.id, label };
                          })
                        ];
                        return (
                          <CustomSelect
                            value={selectedCoachId}
                            onChange={setSelectedCoachId}
                            options={coachOptions}
                            placeholder="-- Choose a coach --"
                          />
                        );
                      })()}
                    </div>

                    {/* Slot match preview */}
                    {selectedCoachId && (() => {
                      const coach = unassignedCoaches.find((c) => c.id === selectedCoachId);
                      if (!coach) return null;
                      const overlaps = slotsOverlap(
                        coach.coach_profile?.availability_slots ?? null,
                        managingBatch.start_time,
                        managingBatch.end_time,
                      );
                      return (
                        <div
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-[10px] font-semibold ${
                            overlaps
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-slate-800/50 border-white/5 text-slate-500'
                          }`}
                        >
                          {overlaps ? (
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          )}
                          {overlaps
                            ? `${coach.first_name}'s availability overlaps with this batch's time slot.`
                            : `${coach.first_name}'s availability may not match this batch's time (${managingBatch.start_time.slice(0, 5)}–${managingBatch.end_time.slice(0, 5)}).`}
                        </div>
                      );
                    })()}

                    {/* ── Day picker ── */}
                    {managingBatch.days_of_week.length > 0 && (
                      <div className="space-y-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                        <p className="text-slate-400 text-[10px] font-semibold">Select days for this coach:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {managingBatch.days_of_week.map((d) => {
                            const isOn = assignDaySelections.has(d);
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => {
                                  setAssignDaySelections(prev => {
                                    const next = new Set(prev);
                                    if (next.has(d)) next.delete(d); else next.add(d);
                                    return next;
                                  });
                                }}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                                  isOn
                                    ? 'bg-indigo-600/30 border-indigo-400/50 text-indigo-300'
                                    : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300'
                                }`}
                              >
                                {weekdayNames[d]}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setAssignDaySelections(new Set(managingBatch.days_of_week))}
                            className="text-[9px] text-indigo-400 hover:text-indigo-300 transition-colors"
                          >All</button>
                          <span className="text-slate-700 text-[9px]">·</span>
                          <button
                            type="button"
                            onClick={() => setAssignDaySelections(new Set())}
                            className="text-[9px] text-slate-500 hover:text-slate-400 transition-colors"
                          >Clear</button>
                          <span className="ml-auto text-[9px] text-slate-500">
                            {assignDaySelections.size}/{managingBatch.days_of_week.length} days
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Assign button */}
                    <div className="flex justify-end">
                      <button
                        onClick={() =>
                          handleAssignCoach(selectedCoachId, managingBatch.id)
                        }
                        disabled={!selectedCoachId || assignLoading || assignDaySelections.size === 0}
                        className="btn-premium h-9 px-5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {assignLoading ? (
                          <>
                            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Assigning…
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Assign ({assignDaySelections.size} day{assignDaySelections.size !== 1 ? 's' : ''})
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 flex justify-end flex-shrink-0">
              <button
                onClick={() => setManagingBatch(null)}
                className="btn-secondary h-9 px-5 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Modal: Add / Edit Class Form ── */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md glass-panel p-6 rounded-2xl relative">
            <button
              onClick={() => setShowClassModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-6">
              {editingClass ? 'Edit Class Details' : 'Register New Class'}
            </h3>

            <form onSubmit={handleSaveClass} className="space-y-4">
              {/* Class Name */}
              <div className="space-y-1">
                <label className="text-slate-300 text-xs font-semibold block">Class Name</label>
                <input
                  type="text"
                  required
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="e.g. Advanced Swimming Pool-A"
                  className="w-full h-10 px-4 rounded-xl glass-input text-xs"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-slate-300 text-xs font-semibold block">Description</label>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!className.trim()) {
                        alert('Please enter a Class Name first.');
                        return;
                      }
                      setIsGeneratingDesc(true);
                      await new Promise((resolve) => setTimeout(resolve, 800));
                      setClassDescription(generateClassDescription(className));
                      setIsGeneratingDesc(false);
                    }}
                    disabled={isGeneratingDesc || !className.trim()}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  >
                    {isGeneratingDesc ? (
                      <>
                        <span className="w-2.5 h-2.5 border border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                        Suggest AI Description
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={classDescription}
                  onChange={(e) => setClassDescription(e.target.value)}
                  placeholder="Summarize course content, levels, or guidelines..."
                  className="w-full p-3 rounded-xl glass-input text-xs"
                />
              </div>

              {/* Edit Mode Status Toggle */}
              {editingClass && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isClassActive}
                    onChange={(e) => setIsClassActive(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500 rounded border-white/10"
                  />
                  <label htmlFor="isActive" className="text-xs text-slate-300 font-medium">
                    This class is currently Active
                  </label>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowClassModal(false)}
                  className="btn-secondary h-9 px-4 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-premium h-9 px-4 rounded-lg text-xs font-bold cursor-pointer"
                >
                  {editingClass ? 'Update Class' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
