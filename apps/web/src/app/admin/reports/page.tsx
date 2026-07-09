'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  XCircle,
  Clock,
  IndianRupee,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  Award,
  RefreshCw,
  Printer,
  Download,
  Users,
  User as UserIcon,
  FileText,
  UserCog
} from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface BatchItem {
  id: string;
  name: string;
  classes: {
    name: string;
  } | null;
}

interface StudentItem {
  id: string;
  student_custom_id: string;
  batch_id: string | null;
  users: {
    first_name: string;
    last_name: string;
  } | null;
}

interface AttendanceRecord {
  id: string;
  student_id: string;
  date: string;
  status: 'present' | 'late' | 'absent';
  check_in: string | null;
}

interface FineItem {
  id: string;
  student_id: string;
  amount: number;
  reason: string;
  status: 'unpaid' | 'pending_verification' | 'paid' | 'waived';
  issued_date: string;
}

interface CoachStat {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  is_active: boolean;
  coach_profile: {
    coach_categories: { is_primary: boolean; subcategory: { name: string } | null }[] | null;
    availability_slots?: string | null;
    hourly_rate?: number;
  } | null;
  approvedBatchCount: number;
  estimatedEarnings: number;
  totalSessions: number;
}

interface ChartItem {
  label: string;
  key: string;
  collected: number;
  pending: number;
}

function AdminReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'batch' | 'coach' | 'student' | 'collection'>('batch');
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'perfect_attendance' | 'has_absences' | 'has_fines' | 'no_fines'>('all');

  // Role/coach settings
  const [userRole, setUserRole] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [assignmentDate, setAssignmentDate] = useState<string | null>(null);

  // Coach Performance Tab States
  const [coachStats, setCoachStats] = useState<CoachStat[]>([]);
  const [loadingCoachStats, setLoadingCoachStats] = useState(false);

  // Fine Collection Tab States
  const [collectionChartData, setCollectionChartData] = useState<ChartItem[]>([]);
  const [loadingCollectionData, setLoadingCollectionData] = useState(false);

  // Sync activeTab with tabParam
  useEffect(() => {
    if (tabParam === 'batch' || tabParam === 'coach' || tabParam === 'student' || tabParam === 'collection') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Date selection states
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()); // 0-indexed

  // Dropdown lists
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [allStudents, setAllStudents] = useState<StudentItem[]>([]);
  const [weekends, setWeekends] = useState<number[]>([6, 7]);
  const [holidays, setHolidays] = useState<string[]>([]);

  // Selection states
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<string>('');

  // Report Data
  const [studentsInBatch, setStudentsInBatch] = useState<StudentItem[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [finesLogs, setFinesLogs] = useState<FineItem[]>([]);
  const [studentRemovals, setStudentRemovals] = useState<{ student_id: string; removed_at: string; remark: string | null }[]>([]);

  // Individual student states (for Tab 2)
  const [singleStudentAttendance, setSingleStudentAttendance] = useState<AttendanceRecord[]>([]);
  const [singleStudentFines, setSingleStudentFines] = useState<FineItem[]>([]);
  const [singleStudentRemoval, setSingleStudentRemoval] = useState<any | null>(null);

  const supabase = createBrowserClient();

  const loadMetadata = async () => {
    setLoading(true);
    try {
      // 0. Get current user profile
      const { data: { user } } = await supabase.auth.getUser();
      let role = '';
      let userId = '';
      if (user) {
        userId = user.id;
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from('users')
          .select('role, tenant_id')
          .eq('id', user.id)
          .single();
        if (profile) {
          role = profile.role ?? '';
          if (role === 'superadmin') {
            router.replace('/admin/dashboard');
            return;
          }
          setUserRole(role);
          setTenantId(profile.tenant_id ?? '');
        }
      }

      // 1. Fetch batches
      let compiledBatches: BatchItem[] = [];
      if (role === 'coach') {
        const { data: assigned } = await supabase
          .from('coach_batch_assignments')
          .select('batch_id, batches(id, name, classes(name))')
          .eq('coach_id', userId)
          .eq('status', 'approved');
        
        const batchData = (assigned || [])
          .map((a: any) => a.batches)
          .filter(Boolean);
        compiledBatches = batchData as unknown as BatchItem[];
      } else {
        const { data: batchData } = await supabase
          .from('batches')
          .select('id, name, classes(name)')
          .order('name', { ascending: true });
        compiledBatches = (batchData || []) as unknown as BatchItem[];
      }
      
      setBatches(compiledBatches);
      if (compiledBatches.length > 0) {
        setSelectedBatch(compiledBatches[0].id);
      } else {
        setSelectedBatch('');
      }

      // 2. Fetch all students for the dropdown (Individual student tab)
      let compiledStudents: StudentItem[] = [];
      if (role === 'coach') {
        const assignedBatchIds = compiledBatches.map(b => b.id);
        if (assignedBatchIds.length > 0) {
          const { data: studentsData } = await supabase
            .from('students')
            .select('id, student_custom_id, batch_id, users(first_name, last_name)')
            .in('batch_id', assignedBatchIds)
            .order('student_custom_id', { ascending: true });
          compiledStudents = (studentsData || []) as unknown as StudentItem[];
        }
      } else {
        const { data: studentsData } = await supabase
          .from('students')
          .select('id, student_custom_id, batch_id, users(first_name, last_name)')
          .order('student_custom_id', { ascending: true });
        compiledStudents = (studentsData || []) as unknown as StudentItem[];
      }
      
      setAllStudents(compiledStudents);
      if (compiledStudents.length > 0) {
        setSelectedStudent(compiledStudents[0].id);
      } else {
        setSelectedStudent('');
      }

      // 3. Fetch Tenant Settings for Weekend and Holidays
      const settingsRes = await fetch('/api/v1/settings');
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (settings) {
          setWeekends(settings.weekends ?? [6, 7]);
          setHolidays(settings.holidays ?? []);
        }
      }
    } catch (err) {
      console.error('Failed to load admin reports metadata:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetadata();
  }, []);

  // Derived class list and filtered batches based on selected class
  const uniqueClasses = Array.from(
    new Set(batches.map(b => b.classes?.name).filter(Boolean) as string[])
  ).sort();

  const filteredBatches = selectedClass
    ? batches.filter(b => b.classes?.name === selectedClass)
    : batches;

  const loadBatchReport = async () => {
    if (!selectedBatch) return;
    setLoadingReport(true);
    try {
      // Get assignment date if coach
      let assignDate: string | null = null;
      if (userRole === 'coach' && currentUserId) {
        const { data: assignment } = await supabase
          .from('coach_batch_assignments')
          .select('created_at')
          .eq('coach_id', currentUserId)
          .eq('batch_id', selectedBatch)
          .eq('status', 'approved')
          .single();
        if (assignment) {
          assignDate = new Date(assignment.created_at).toISOString().split('T')[0];
        }
      }
      setAssignmentDate(assignDate);

      // 1. Fetch current students in that batch
      const { data: currentStus } = await supabase
        .from('students')
        .select('id, student_custom_id, batch_id, users(first_name, last_name)')
        .eq('batch_id', selectedBatch);

      // 2. Fetch student removals for this batch
      const { data: removalsData } = await supabase
        .from('student_removals')
        .select('student_id, removed_at, remark')
        .eq('batch_id', selectedBatch);

      const compiledRemovals = (removalsData || []) as { student_id: string; removed_at: string; remark: string | null }[];
      setStudentRemovals(compiledRemovals);

      // 3. Fetch attendance logs of the month specifically for this batch
      const startOfMonth = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const endOfMonth = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Get log data for the selected batch
      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('id, student_id, date, status, check_in')
        .eq('batch_id', selectedBatch)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);
      
      const compiledLogs = (logs || []) as AttendanceRecord[];

      // 4. Gather all student IDs that belong to the roster for this batch in this month
      const rosterStudentIds = new Set<string>();
      (currentStus || []).forEach((s: any) => rosterStudentIds.add(s.id));
      compiledRemovals.forEach(r => rosterStudentIds.add(r.student_id));
      compiledLogs.forEach(l => rosterStudentIds.add(l.student_id));

      // 5. Fetch profiles of all students in the roster (historical + current)
      let compiledStus: StudentItem[] = [];
      if (rosterStudentIds.size > 0) {
        const { data: fetchedStus } = await supabase
          .from('students')
          .select('id, student_custom_id, batch_id, users(first_name, last_name)')
          .in('id', Array.from(rosterStudentIds))
          .order('student_custom_id', { ascending: true });
        
        compiledStus = (fetchedStus || []) as unknown as StudentItem[];
      }
      setStudentsInBatch(compiledStus);

      let filteredLogs = compiledLogs;
      if (assignDate) {
        filteredLogs = filteredLogs.filter(log => log.date >= assignDate);
      }
      setAttendanceLogs(filteredLogs);

      // 6. Fetch fines of the month for the roster students
      const { data: fines } = await supabase
        .from('fines')
        .select('id, student_id, amount, reason, status, issued_date')
        .gte('issued_date', startOfMonth)
        .lte('issued_date', `${endOfMonth} 23:59:59`);
      
      let filteredFines = (fines || []) as unknown as FineItem[];
      if (assignDate) {
        filteredFines = filteredFines.filter(f => {
          const fineDateStr = new Date(f.issued_date).toISOString().split('T')[0];
          return fineDateStr >= assignDate;
        });
      }
      // Filter fines to only roster students
      filteredFines = filteredFines.filter(f => rosterStudentIds.has(f.student_id));
      setFinesLogs(filteredFines);

    } catch (err) {
      console.error('Failed to load batch matrix report:', err);
    } finally {
      setLoadingReport(false);
    }
  };

  const loadStudentReport = async () => {
    if (!selectedStudent) return;
    setLoadingReport(true);
    try {
      const studentObj = allStudents.find(s => s.id === selectedStudent);
      let studentBatchId = studentObj?.batch_id;

      // Look up last active batch from attendance history if current batch_id is null
      if (!studentBatchId) {
        const { data: lastLog } = await supabase
          .from('attendance_logs')
          .select('batch_id')
          .eq('student_id', selectedStudent)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastLog) {
          studentBatchId = lastLog.batch_id;
        }
      }

      // Fetch removal record if exists for this batch
      if (studentBatchId) {
        const { data: removal } = await supabase
          .from('student_removals')
          .select('removed_at, remark')
          .eq('student_id', selectedStudent)
          .eq('batch_id', studentBatchId)
          .maybeSingle();
        setSingleStudentRemoval(removal);
      } else {
        setSingleStudentRemoval(null);
      }

      // Get assignment date if coach
      let assignDate: string | null = null;
      if (userRole === 'coach' && currentUserId && studentBatchId) {
        const { data: assignment } = await supabase
          .from('coach_batch_assignments')
          .select('created_at')
          .eq('coach_id', currentUserId)
          .eq('batch_id', studentBatchId)
          .eq('status', 'approved')
          .single();
        if (assignment) {
          assignDate = new Date(assignment.created_at).toISOString().split('T')[0];
        }
      }
      setAssignmentDate(assignDate);

      const startOfMonth = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const endOfMonth = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // 1. Fetch attendance records
      const { data: logs, error: logsErr } = await supabase
        .from('attendance_logs')
        .select('id, student_id, date, status, check_in')
        .eq('student_id', selectedStudent)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);

      if (logsErr) throw logsErr;
      
      let filteredLogs = (logs || []) as AttendanceRecord[];
      if (assignDate) {
        filteredLogs = filteredLogs.filter(log => log.date >= assignDate);
      }
      setSingleStudentAttendance(filteredLogs);

      // 2. Fetch fines
      const { data: fines, error: finesErr } = await supabase
        .from('fines')
        .select('id, student_id, amount, reason, status, issued_date')
        .eq('student_id', selectedStudent)
        .gte('issued_date', startOfMonth)
        .lte('issued_date', `${endOfMonth} 23:59:59`);

      if (finesErr) throw finesErr;
      
      let filteredFines = (fines || []) as unknown as FineItem[];
      if (assignDate) {
        filteredFines = filteredFines.filter(f => {
          const fineDateStr = new Date(f.issued_date).toISOString().split('T')[0];
          return fineDateStr >= assignDate;
        });
      }
      setSingleStudentFines(filteredFines);

    } catch (err) {
      console.error('Failed to load individual student report:', err);
    } finally {
      setLoadingReport(false);
    }
  };

  const loadCoachStats = async (tId: string) => {
    if (!tId) return;
    setLoadingCoachStats(true);
    try {
      const { data: coaches } = await supabase
        .from('users')
        .select(`
          id, first_name, last_name, avatar_url, is_active,
          coach_profile:coaches(coach_categories(is_primary, subcategory:subcategories(name)), hourly_rate, availability_slots),
          batch_assignments:coach_batch_assignments!coach_batch_assignments_coach_id_fkey(id, status, batch_id)
        `)
        .eq('tenant_id', tId)
        .eq('role', 'coach')
        .eq('is_active', true);

      if (coaches && coaches.length > 0) {
        const allBatchIds = coaches.flatMap((c: any) =>
          (c.batch_assignments || []).filter((a: any) => a.status === 'approved').map((a: any) => a.batch_id)
        );

        let sessionCounts: Record<string, number> = {};
        if (allBatchIds.length > 0) {
          const { data: sessions } = await supabase
            .from('attendance_logs')
            .select('batch_id, date')
            .eq('tenant_id', tId)
            .in('batch_id', allBatchIds);

          if (sessions) {
            const batchDateSets: Record<string, Set<string>> = {};
            sessions.forEach((s: any) => {
              if (!batchDateSets[s.batch_id]) batchDateSets[s.batch_id] = new Set();
              batchDateSets[s.batch_id].add(s.date);
            });
            Object.entries(batchDateSets).forEach(([batchId, dates]) => {
              sessionCounts[batchId] = dates.size;
            });
          }
        }

        const stats: CoachStat[] = coaches.map((c: any) => {
          const approved = (c.batch_assignments || []).filter((a: any) => a.status === 'approved');
          const totalSessions = approved.reduce((sum: number, a: any) => sum + (sessionCounts[a.batch_id] || 0), 0);
          const hourlyRate = c.coach_profile?.hourly_rate ?? 500;
          return {
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            avatar_url: c.avatar_url,
            is_active: c.is_active,
            coach_profile: {
              coach_categories: c.coach_profile?.coach_categories || null,
              availability_slots: c.coach_profile?.availability_slots || null,
              hourly_rate: hourlyRate
            },
            approvedBatchCount: approved.length,
            estimatedEarnings: totalSessions * hourlyRate,
            totalSessions,
          };
        });
        setCoachStats(stats);
      } else {
        setCoachStats([]);
      }
    } catch (err) {
      console.error('Failed to load coach stats for reports:', err);
    } finally {
      setLoadingCoachStats(false);
    }
  };

  const loadCollectionData = async (tId: string) => {
    if (!tId) return;
    setLoadingCollectionData(true);
    try {
      const { data: allFines } = await supabase
        .from('fines')
        .select('amount, status, issued_date, paid_date')
        .eq('tenant_id', tId);

      const monthsList: ChartItem[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthsList.push({
          label: d.toLocaleString('default', { month: 'short' }),
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          collected: 0,
          pending: 0,
        });
      }

      if (allFines) {
        allFines.forEach((fine: any) => {
          const dateStr = fine.status === 'paid' && fine.paid_date ? fine.paid_date : fine.issued_date;
          if (!dateStr) return;

          const date = new Date(dateStr);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

          const bucket = monthsList.find(m => m.key === key);
          if (bucket) {
            if (fine.status === 'paid') {
              bucket.collected += Number(fine.amount);
            } else if (fine.status === 'unpaid' || fine.status === 'pending_verification') {
              bucket.pending += Number(fine.amount);
            }
          }
        });
      }
      setCollectionChartData(monthsList);
    } catch (err) {
      console.error('Failed to load collection trends for reports:', err);
    } finally {
      setLoadingCollectionData(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'batch') {
      loadBatchReport();
    } else if (activeTab === 'student') {
      loadStudentReport();
    } else if (activeTab === 'coach' && tenantId) {
      loadCoachStats(tenantId);
    } else if (activeTab === 'collection' && tenantId) {
      loadCollectionData(tenantId);
    }
  }, [activeTab, selectedBatch, selectedStudent, selectedYear, selectedMonth, tenantId]);

  useEffect(() => {
    // When class filter changes, auto-select first batch in filtered set
    if (filteredBatches.length > 0) {
      setSelectedBatch(filteredBatches[0].id);
    } else {
      setSelectedBatch('');
    }
  }, [selectedClass]);

  useEffect(() => {
    setActiveFilter('all');
  }, [selectedBatch, selectedMonth, selectedYear]);

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  const getTodayStr = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  // Export CSV Matrix handler
  const handleExportCSV = () => {
    if (studentsInBatch.length === 0) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    
    // Header Row
    let headers = ['Roll Number', 'Student Name'];
    for (let d = 1; d <= daysInMonth; d++) {
      headers.push(`Day ${d}`);
    }
    headers.push('Present', 'Late', 'Absent', 'Attendance %');
    csvContent += headers.map(h => `"${h}"`).join(',') + '\r\n';

    // Data Rows
    studentsInBatch.forEach((stu) => {
      const name = `${stu.users?.first_name || ''} ${stu.users?.last_name || ''}`.trim();
      const row = [stu.student_custom_id, name];

      let pres = 0;
      let lat = 0;
      let abs = 0;

      const removal = studentRemovals.find(r => r.student_id === stu.id);
      const removedDateStr = removal ? new Date(removal.removed_at).toISOString().split('T')[0] : null;

      for (let d = 1; d <= daysInMonth; d++) {
        const dStr = String(d).padStart(2, '0');
        const mStr = String(selectedMonth + 1).padStart(2, '0');
        const dateStr = `${selectedYear}-${mStr}-${dStr}`;

        if (assignmentDate && dateStr < assignmentDate) {
          row.push('N/A');
          continue;
        }

        if (removedDateStr && dateStr > removedDateStr) {
          row.push('N/A');
          continue;
        }

        const record = attendanceLogs.find(l => l.student_id === stu.id && l.date === dateStr);
        if (record) {
          if (record.status === 'present') {
            row.push('P');
            pres++;
          } else if (record.status === 'late') {
            row.push('L');
            lat++;
          } else if (record.status === 'absent') {
            row.push('A');
            abs++;
          }
        } else {
          // Check if weekend or holiday
          const dateObj = new Date(selectedYear, selectedMonth, d);
          const jsDay = dateObj.getDay();
          const tenantDay = jsDay === 0 ? 7 : jsDay;
          const isWkend = weekends.includes(tenantDay);
          const isHoli = holidays.includes(dateStr);

          if (isWkend || isHoli) {
            row.push('-');
          } else {
            // Past day unmarked is absent
            const todayStr = getTodayStr();
            if (dateStr < todayStr) {
              row.push('A');
              abs++;
            } else {
              row.push('');
            }
          }
        }
      }

      const totalLogs = pres + lat + abs;
      const attRatio = totalLogs > 0 ? Math.round(((pres + lat) / totalLogs) * 100) : 0;

      row.push(pres.toString(), lat.toString(), abs.toString(), `${attRatio}%`);
      csvContent += row.map(v => `"${v}"`).join(',') + '\r\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_Matrix_${selectedYear}_${selectedMonth + 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  // Compile individual student statistics (Tab 2)
  const studentRemovalDateStr = singleStudentRemoval
    ? new Date(singleStudentRemoval.removed_at).toISOString().split('T')[0]
    : null;

  let indPresent = 0;
  let indLate = 0;
  let indAbsent = 0;

  singleStudentAttendance.forEach((log) => {
    if (studentRemovalDateStr && log.date > studentRemovalDateStr) return;
    if (assignmentDate && log.date < assignmentDate) return;

    if (log.status === 'present') indPresent++;
    else if (log.status === 'late') indLate++;
    else if (log.status === 'absent') indAbsent++;
  });

  const indTotalLogs = indPresent + indLate + indAbsent;
  const indAttended = indPresent + indLate;
  const indRatio = indTotalLogs > 0 ? Math.round((indAttended / indTotalLogs) * 100) : 0;

  // Single student unpaid fines
  const indUnpaidFines = singleStudentFines.filter((f) => f.status === 'unpaid' || f.status === 'pending_verification');
  const indUnpaidFinesTotal = indUnpaidFines.reduce((sum, f) => sum + Number(f.amount), 0);

  const strokeRadius = 45;
  const circumference = 2 * Math.PI * strokeRadius;
  const strokeDashoffset = circumference - (indRatio / 100) * circumference;

  // Precompute statistics for each student in the batch for the selected month
  const studentStats = studentsInBatch.map((stu) => {
    const name = `${stu.users?.first_name || ''} ${stu.users?.last_name || ''}`.trim();
    
    let presentC = 0;
    let lateC = 0;
    let absentC = 0;

    const removal = studentRemovals.find(r => r.student_id === stu.id);
    const removedDateStr = removal ? new Date(removal.removed_at).toISOString().split('T')[0] : null;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayNum = d;
      const dStr = String(dayNum).padStart(2, '0');
      const mStr = String(selectedMonth + 1).padStart(2, '0');
      const dateStr = `${selectedYear}-${mStr}-${dStr}`;

      if (assignmentDate && dateStr < assignmentDate) {
        continue;
      }

      if (removedDateStr && dateStr > removedDateStr) {
        continue;
      }

      const log = attendanceLogs.find(l => l.student_id === stu.id && l.date === dateStr);
      
      if (log) {
        if (log.status === 'present') {
          presentC++;
        } else if (log.status === 'late') {
          lateC++;
        } else if (log.status === 'absent') {
          absentC++;
        }
      } else {
        // Evaluate holidays or weekends
        const dateObj = new Date(selectedYear, selectedMonth, dayNum);
        const jsDay = dateObj.getDay();
        const tenantDay = jsDay === 0 ? 7 : jsDay;
        const isWkend = weekends.includes(tenantDay);
        const isHoli = holidays.includes(dateStr);

        if (!isWkend && !isHoli) {
          const todayStr = getTodayStr();
          if (dateStr < todayStr) {
            absentC++;
          }
        }
      }
    }

    const totalLogs = presentC + lateC + absentC;
    const ratio = totalLogs > 0 ? Math.round(((presentC + lateC) / totalLogs) * 100) : 100;

    // Get fines for this student in the current month
    const studentFines = finesLogs.filter(f => f.student_id === stu.id);
    const totalFinesAmount = studentFines.reduce((sum, f) => sum + Number(f.amount), 0);
    const fineCount = studentFines.length;

    return {
      student: stu,
      name,
      presentC,
      lateC,
      absentC,
      totalLogs,
      ratio,
      totalFinesAmount,
      fineCount,
    };
  });

  const totalStudentsCount = studentsInBatch.length;
  const perfectAttendanceCount = studentStats.filter(s => s.absentC === 0).length;
  const hasAbsencesCount = studentStats.filter(s => s.absentC > 0).length;
  const totalFinesAccrued = studentStats.reduce((sum, s) => sum + s.totalFinesAmount, 0);
  const studentsWithFinesCount = studentStats.filter(s => s.fineCount > 0).length;
  const studentsWithoutFinesCount = studentStats.filter(s => s.fineCount === 0).length;

  const filteredStudentStats = studentStats.filter((s) => {
    if (activeFilter === 'perfect_attendance') return s.absentC === 0;
    if (activeFilter === 'has_absences') return s.absentC > 0;
    if (activeFilter === 'has_fines') return s.fineCount > 0;
    if (activeFilter === 'no_fines') return s.fineCount === 0;
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Printable CSS inject */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          header, nav, footer, .btn-secondary, select, .no-print {
            display: none !important;
          }
          .glass-panel {
            border: 1px solid #ddd !important;
            background: white !important;
            box-shadow: none !important;
            color: black !important;
          }
          .text-white {
            color: black !important;
          }
          .text-slate-400, .text-slate-500 {
            color: #555 !important;
          }
          .bg-slate-950, .bg-slate-900, .bg-white\\/\\[0\\.02\\] {
            background: #f9f9f9 !important;
            border-color: #eee !important;
          }
          .text-emerald-400 {
            color: #10b981 !important;
          }
          .text-amber-400 {
            color: #f59e0b !important;
          }
          .text-red-400 {
            color: #ef4444 !important;
          }
          .print-full-width {
            width: 100% !important;
            max-width: 100% !important;
          }
        }
      `}</style>

      {/* Header bar controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 no-print">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold tracking-widest uppercase mb-1">
            <Sparkles className="w-4 h-4" /> {userRole === 'coach' ? 'Student Intelligence' : 'Academy Intelligence'}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            {userRole === 'coach' ? 'Student Reports' : 'Academy Reports'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {userRole === 'coach'
              ? 'Monthly attendance history, fine activity, and progress insights for your students.'
              : 'Monthly attendance history, fine activity, and student progress insights for your academy.'}
          </p>
        </div>

        {/* Date Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl bg-slate-950/40 border border-white/5 p-1">
            <button
              onClick={handlePrevMonth}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4.5 h-4.5" />
            </button>
            <span className="px-3 text-xs font-bold text-slate-200 select-none min-w-[120px] text-center">
              {MONTHS[selectedMonth]} {selectedYear}
            </span>
            <button
              onClick={handleNextMonth}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4.5 h-4.5" />
            </button>
          </div>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-10 px-3.5 rounded-xl glass-input text-xs font-bold"
          >
            {[2024, 2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="h-10 px-3.5 rounded-xl glass-input text-xs font-bold"
          >
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin glow-indigo" />
          <p className="text-slate-400 text-xs font-semibold tracking-widest uppercase">
            Syncing analytics structures...
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Sub-Tab Navigation Bar */}
          <div className="flex border-b border-white/10 pb-px gap-6 no-print overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('batch')}
              className={`pb-3 text-xs font-extrabold uppercase tracking-widest transition-colors relative cursor-pointer flex-shrink-0
              ${activeTab === 'batch' 
                ? 'text-indigo-400' 
                : 'text-slate-500 hover:text-slate-300'}`}
            >
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" /> Batch Attendance
              </span>
              {activeTab === 'batch' && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full glow-indigo" />
              )}
            </button>

            {userRole === 'admin' && (
              <button
                onClick={() => setActiveTab('coach')}
                className={`pb-3 text-xs font-extrabold uppercase tracking-widest transition-colors relative cursor-pointer flex-shrink-0
                ${activeTab === 'coach' 
                  ? 'text-indigo-400' 
                  : 'text-slate-500 hover:text-slate-300'}`}
              >
                <span className="flex items-center gap-1.5">
                  <UserCog className="w-4 h-4" /> Coach Performance
                </span>
                {activeTab === 'coach' && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full glow-indigo" />
                )}
              </button>
            )}

            <button
              onClick={() => setActiveTab('student')}
              className={`pb-3 text-xs font-extrabold uppercase tracking-widest transition-colors relative cursor-pointer flex-shrink-0
              ${activeTab === 'student' 
                ? 'text-indigo-400' 
                : 'text-slate-500 hover:text-slate-300'}`}
            >
              <span className="flex items-center gap-1.5">
                <UserIcon className="w-4 h-4" /> Student Progress
              </span>
              {activeTab === 'student' && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full glow-indigo" />
              )}
            </button>

            {userRole === 'admin' && (
              <button
                onClick={() => setActiveTab('collection')}
                className={`pb-3 text-xs font-extrabold uppercase tracking-widest transition-colors relative cursor-pointer flex-shrink-0
                ${activeTab === 'collection' 
                  ? 'text-indigo-400' 
                  : 'text-slate-500 hover:text-slate-300'}`}
              >
                <span className="flex items-center gap-1.5">
                  <IndianRupee className="w-4 h-4" /> Fine Collection
                </span>
                {activeTab === 'collection' && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full glow-indigo" />
                )}
              </button>
            )}
          </div>

          {/* TAB 1: BATCH MATRIX VIEW */}
          {activeTab === 'batch' && (
            <div className="space-y-6 print-full-width">
              
              {/* Batch Selector and Action Controls */}
              <div className="flex flex-col gap-3 glass-panel p-4 rounded-2xl no-print">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Class filter */}
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Class:</span>
                  <select
                    value={selectedClass}
                    onChange={(e) => { setSelectedClass(e.target.value); setSelectedBatch(''); }}
                    className="h-10 px-4 rounded-xl glass-input text-xs font-bold min-w-[180px]"
                  >
                    <option value="">All Classes</option>
                    {uniqueClasses.map((cls) => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>

                  {/* Batch filter */}
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Batch:</span>
                  <select
                    value={selectedBatch}
                    onChange={(e) => setSelectedBatch(e.target.value)}
                    className="h-10 px-4 rounded-xl glass-input text-xs font-bold min-w-[200px]"
                  >
                    {filteredBatches.length === 0 && <option value="">No batches available</option>}
                    {filteredBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.classes ? `(${b.classes.name})` : ''}
                      </option>
                    ))}
                  </select>

                  {selectedClass && (
                    <button
                      onClick={() => setSelectedClass('')}
                      className="h-8 px-3 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 cursor-pointer"
                    >
                      Clear Class
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportCSV}
                      disabled={studentsInBatch.length === 0}
                      className="btn-secondary h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                    >
                      <Download className="w-4 h-4" /> Export CSV
                    </button>
                    <button
                      onClick={handlePrint}
                      className="btn-secondary h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" /> Print Report
                    </button>
                  </div>
                </div>
              </div>

              {loadingReport ? (
                <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
                  <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin glow-indigo" />
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                    Building attendance matrix...
                  </p>
                </div>
              ) : studentsInBatch.length === 0 ? (
                <div className="glass-panel p-12 text-center rounded-3xl">
                  <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-slate-300 font-bold text-sm">No Enrolled Students</h3>
                  <p className="text-slate-500 text-xs mt-1">There are no profiles registered in this batch.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Clickable Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 no-print mb-6">
                    {/* Card 1: Total Students */}
                    <button
                      onClick={() => setActiveFilter('all')}
                      className={`glass-panel p-4 rounded-xl text-left cursor-pointer transition-all duration-300 relative overflow-hidden group border
                        ${activeFilter === 'all' 
                          ? 'border-indigo-500 bg-indigo-500/10' 
                          : 'border-white/5 hover:border-white/20 bg-white/[0.01] hover:bg-white/[0.02]'}`}
                    >
                      <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-indigo-500/5 blur-xl group-hover:bg-indigo-500/10 transition-colors" />
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Total Students</span>
                      <div className="flex items-baseline gap-1.5 mt-2">
                        <span className="text-2xl font-black text-slate-100">{totalStudentsCount}</span>
                        <span className="text-[10px] text-slate-500 font-semibold">profiles</span>
                      </div>
                    </button>

                    {/* Card 2: Perfect Attendance */}
                    <button
                      onClick={() => setActiveFilter('perfect_attendance')}
                      className={`glass-panel p-4 rounded-xl text-left cursor-pointer transition-all duration-300 relative overflow-hidden group border
                        ${activeFilter === 'perfect_attendance' 
                          ? 'border-emerald-500 bg-emerald-500/10' 
                          : 'border-white/5 hover:border-white/20 bg-white/[0.01] hover:bg-white/[0.02]'}`}
                    >
                      <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-emerald-500/5 blur-xl group-hover:bg-emerald-500/10 transition-colors" />
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">100% Attendance</span>
                      <div className="flex items-baseline gap-1.5 mt-2">
                        <span className="text-2xl font-black text-emerald-400">{perfectAttendanceCount}</span>
                        <span className="text-[10px] text-slate-500 font-semibold">students</span>
                      </div>
                    </button>

                    {/* Card 3: Has Absences */}
                    <button
                      onClick={() => setActiveFilter('has_absences')}
                      className={`glass-panel p-4 rounded-xl text-left cursor-pointer transition-all duration-300 relative overflow-hidden group border
                        ${activeFilter === 'has_absences' 
                          ? 'border-red-500 bg-red-500/10' 
                          : 'border-white/5 hover:border-white/20 bg-white/[0.01] hover:bg-white/[0.02]'}`}
                    >
                      <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-red-500/5 blur-xl group-hover:bg-red-500/10 transition-colors" />
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Absents (&lt;100%)</span>
                      <div className="flex items-baseline gap-1.5 mt-2">
                        <span className="text-2xl font-black text-red-400">{hasAbsencesCount}</span>
                        <span className="text-[10px] text-slate-500 font-semibold">students</span>
                      </div>
                    </button>

                    {/* Card 4: Total Fines Accrued */}
                    <button
                      onClick={() => setActiveFilter('has_fines')}
                      className={`glass-panel p-4 rounded-xl text-left cursor-pointer transition-all duration-300 relative overflow-hidden group border
                        ${activeFilter === 'has_fines' 
                          ? 'border-indigo-500 bg-indigo-500/10' 
                          : 'border-white/5 hover:border-white/20 bg-white/[0.01] hover:bg-white/[0.02]'}`}
                    >
                      <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-indigo-500/5 blur-xl group-hover:bg-indigo-500/10 transition-colors" />
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Total Fines Accrued</span>
                      <div className="flex items-baseline gap-1.5 mt-2">
                        <span className="text-2xl font-black text-indigo-400">₹{totalFinesAccrued.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-500 font-semibold">({studentsWithFinesCount} fined)</span>
                      </div>
                    </button>

                    {/* Card 5: People Without Fines */}
                    <button
                      onClick={() => setActiveFilter('no_fines')}
                      className={`glass-panel p-4 rounded-xl text-left cursor-pointer transition-all duration-300 relative overflow-hidden group border
                        ${activeFilter === 'no_fines' 
                          ? 'border-amber-500 bg-amber-500/10' 
                          : 'border-white/5 hover:border-white/20 bg-white/[0.01] hover:bg-white/[0.02]'}`}
                    >
                      <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-amber-500/5 blur-xl group-hover:bg-amber-500/10 transition-colors" />
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">People Without Fines</span>
                      <div className="flex items-baseline gap-1.5 mt-2">
                        <span className="text-2xl font-black text-amber-400">{studentsWithoutFinesCount}</span>
                        <span className="text-[10px] text-slate-500 font-semibold">students</span>
                      </div>
                    </button>
                  </div>

                  <div className="glass-panel rounded-3xl overflow-hidden print-full-width border border-white/5 bg-slate-950/20">
                    
                    {/* Ledger Information Title */}
                    <div className="p-6 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">
                          {batches.find(b => b.id === selectedBatch)?.name} Attendance Summary
                          {activeFilter !== 'all' && (
                            <span className="text-xs font-semibold text-indigo-400 block md:inline md:ml-2.5">
                              [Filtered: {
                                activeFilter === 'perfect_attendance' ? '100% Attendance' :
                                activeFilter === 'has_absences' ? 'Absents (<100%)' :
                                activeFilter === 'has_fines' ? 'Students with Fines' :
                                'No Penalties'
                              }]
                            </span>
                          )}
                        </h2>
                        <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                          Reporting Period: {MONTHS[selectedMonth]} {selectedYear}
                        </span>
                      </div>

                      <div className="flex gap-4 text-[9px] font-bold uppercase text-slate-400">
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> P (Present)</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> L (Late)</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> A (Absent)</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-700" /> - (Weekend/Holiday)</div>
                      </div>
                    </div>

                    {/* Horizontal Matrix scroll box */}
                    <div className="overflow-x-auto no-scrollbar">
                      {filteredStudentStats.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                          <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                          <p className="text-xs">No students match the active filter criteria.</p>
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="border-b border-white/10 bg-white/[0.01] text-slate-400 font-extrabold uppercase tracking-wider text-[8px]">
                              <th className="py-4 px-4 sticky left-0 bg-slate-950 min-w-[90px] border-r border-white/15 z-10">Ref Roll</th>
                              <th className="py-4 px-4 sticky left-[90px] bg-slate-950 min-w-[150px] border-r border-white/15 z-10">Student Name</th>
                              {/* Calendar Columns */}
                              {Array.from({ length: daysInMonth }).map((_, dIdx) => (
                                <th key={`col-${dIdx}`} className="py-4 px-2 text-center min-w-[30px] border-r border-white/5">
                                  {dIdx + 1}
                                </th>
                              ))}
                              <th className="py-4 px-4 text-center min-w-[60px] bg-slate-950 border-l border-white/15">P</th>
                              <th className="py-4 px-4 text-center min-w-[60px] bg-slate-950 border-l border-white/5">L</th>
                              <th className="py-4 px-4 text-center min-w-[60px] bg-slate-950 border-l border-white/5">A</th>
                              <th className="py-4 px-4 text-center min-w-[80px] bg-slate-950 border-l border-white/15 text-indigo-400">Ratio %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredStudentStats.map(({ student: stu, name, presentC, lateC, absentC, ratio }) => {
                              return (
                                <tr key={stu.id} className="border-b border-white/5 hover:bg-white/[0.01] transition-colors">
                                  <td className="py-3 px-4 sticky left-0 bg-slate-950 font-mono text-[9px] font-bold text-slate-400 border-r border-white/15">{stu.student_custom_id}</td>
                                  <td className="py-3 px-4 sticky left-[90px] bg-slate-950 font-bold text-slate-200 border-r border-white/15 truncate max-w-[150px]" title={name}>
                                    {name}
                                  </td>

                                  {/* Calendar cell evaluations */}
                                  {Array.from({ length: daysInMonth }).map((_, dIdx) => {
                                    const dayNum = dIdx + 1;
                                    const dStr = String(dayNum).padStart(2, '0');
                                    const mStr = String(selectedMonth + 1).padStart(2, '0');
                                    const dateStr = `${selectedYear}-${mStr}-${dStr}`;

                                    if (assignmentDate && dateStr < assignmentDate) {
                                      return (
                                        <td key={`cell-${dIdx}`} className="py-3 px-2 text-center border-r border-white/5 font-mono text-slate-600/40 font-normal">
                                          N/A
                                        </td>
                                      );
                                    }

                                    const removal = studentRemovals.find(r => r.student_id === stu.id);
                                    const removedDateStr = removal ? new Date(removal.removed_at).toISOString().split('T')[0] : null;

                                    if (removedDateStr && dateStr > removedDateStr) {
                                      return (
                                        <td key={`cell-${dIdx}`} className="py-3 px-2 text-center border-r border-white/5 font-mono text-slate-600/40 font-normal">
                                          N/A
                                        </td>
                                      );
                                    }

                                    const log = attendanceLogs.find(l => l.student_id === stu.id && l.date === dateStr);
                                    
                                    let marker = '';
                                    let colorClass = 'text-slate-600';

                                    if (log) {
                                      if (log.status === 'present') {
                                        marker = 'P';
                                        colorClass = 'text-emerald-400 font-extrabold';
                                      } else if (log.status === 'late') {
                                        marker = 'L';
                                        colorClass = 'text-amber-400 font-extrabold';
                                      } else if (log.status === 'absent') {
                                        marker = 'A';
                                        colorClass = 'text-red-400 font-extrabold';
                                      }
                                    } else {
                                      // Evaluate holidays or weekends
                                      const dateObj = new Date(selectedYear, selectedMonth, dayNum);
                                      const jsDay = dateObj.getDay();
                                      const tenantDay = jsDay === 0 ? 7 : jsDay;
                                      const isWkend = weekends.includes(tenantDay);
                                      const isHoli = holidays.includes(dateStr);

                                      if (isWkend || isHoli) {
                                        marker = '-';
                                        colorClass = 'text-slate-700 font-normal';
                                      } else {
                                        const todayStr = getTodayStr();
                                        if (dateStr < todayStr) {
                                          marker = 'A';
                                          colorClass = 'text-red-400/40';
                                        }
                                      }
                                    }

                                    return (
                                      <td key={`cell-${dIdx}`} className={`py-3 px-2 text-center border-r border-white/5 font-mono ${colorClass}`}>
                                        {marker}
                                      </td>
                                    );
                                  })}

                                  {/* Performance statistics */}
                                  {(() => {
                                    let ratioColor = 'text-slate-400';
                                    if (ratio >= 85) ratioColor = 'text-emerald-400 font-black';
                                    else if (ratio >= 75) ratioColor = 'text-amber-400 font-extrabold';
                                    else if (presentC + lateC + absentC > 0) ratioColor = 'text-red-400 font-black';

                                    return (
                                      <>
                                        <td className="py-3 px-4 text-center font-bold text-slate-400 bg-slate-950 border-l border-white/15">{presentC}</td>
                                        <td className="py-3 px-4 text-center font-bold text-slate-400 bg-slate-950 border-l border-white/5">{lateC}</td>
                                        <td className="py-3 px-4 text-center font-bold text-slate-400 bg-slate-950 border-l border-white/5">{absentC}</td>
                                        <td className={`py-3 px-4 text-center bg-slate-950 border-l border-white/15 ${ratioColor}`}>{ratio}%</td>
                                      </>
                                    );
                                  })()}

                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>

                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: INDIVIDUAL STUDENT PROGRESS */}
          {activeTab === 'student' && (
            <div className="space-y-6 print-full-width">
              
              {/* Student selector dropdown */}
              <div className="flex items-center gap-3 glass-panel p-4 rounded-2xl no-print">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Select Student:</span>
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="h-10 px-4 rounded-xl glass-input text-xs font-bold min-w-[250px]"
                >
                  {allStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.student_custom_id}] {s.users?.first_name} {s.users?.last_name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handlePrint}
                  className="btn-secondary h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer ml-auto"
                >
                  <Printer className="w-4 h-4" /> Print Profile
                </button>
              </div>

              {loadingReport ? (
                <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
                  <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin glow-indigo" />
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                    Compiling profile details...
                  </p>
                </div>
              ) : !selectedStudent ? (
                <div className="glass-panel p-12 text-center rounded-3xl">
                  <UserIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-slate-300 font-bold text-sm">No Selected Student</h3>
                  <p className="text-slate-500 text-xs mt-1">Please register or select a student profile.</p>
                </div>
              ) : (
                <div className="space-y-8 animate-in fade-in duration-300 print-full-width">
                  
                  {/* KPI Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    
                    {/* Circular dial gauge */}
                    <div className="glass-panel p-6 rounded-3xl flex flex-col items-center justify-center text-center relative overflow-hidden group">
                      <div className="relative w-28 h-28 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="56" cy="56" r={strokeRadius} className="stroke-slate-800" strokeWidth="9" fill="transparent" />
                          <circle cx="56" cy="56" r={strokeRadius} className="stroke-indigo-500 transition-all duration-500 stroke-line-cap" strokeWidth="9" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center">
                          <span className="text-xl font-black text-white">{indRatio}%</span>
                          <span className="text-[8px] text-slate-500 font-extrabold uppercase tracking-wide">Ratio</span>
                        </div>
                      </div>
                      <div className="mt-3">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Monthly Standings</span>
                      </div>
                    </div>

                    {/* Attended card */}
                    <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">Present Sessions</span>
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /></div>
                      </div>
                      <div className="mt-6">
                        <span className="text-2xl font-black text-white">{indAttended}</span>
                        <span className="text-[8px] text-slate-500 block mt-0.5">Present: {indPresent} | Late: {indLate}</span>
                      </div>
                    </div>

                    {/* Absent card */}
                    <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">Unexcused Absences</span>
                        <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400"><XCircle className="w-3.5 h-3.5" /></div>
                      </div>
                      <div className="mt-6">
                        <span className="text-2xl font-black text-white">{indAbsent}</span>
                        <span className="text-[8px] text-slate-500 block mt-0.5">Missed active days</span>
                      </div>
                    </div>

                    {/* Outstanding fines card */}
                    <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">Monthly Penalties</span>
                        <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400"><IndianRupee className="w-3.5 h-3.5" /></div>
                      </div>
                      <div className="mt-6">
                        <span className="text-2xl font-black text-white">₹{indUnpaidFinesTotal.toLocaleString()}</span>
                        <span className="text-[8px] text-slate-500 block mt-0.5">{indUnpaidFines.length} pending payouts</span>
                      </div>
                    </div>

                  </div>

                  {/* 35-Day Grid and Fines detail splitting */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 print-full-width">
                    
                    {/* Grid Calendar */}
                    <div className="glass-panel p-6 rounded-3xl lg:col-span-3 space-y-6">
                      <div className="border-b border-white/10 pb-3">
                        <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Attendance Calendar</h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">Visual checklist of student checkpoint check-ins</p>
                      </div>

                      {/* Calendar headers */}
                      <div className="grid grid-cols-7 gap-1.5 text-center text-[9px] font-bold text-slate-500 uppercase">
                        <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                      </div>

                      {/* Day cells */}
                      <div className="grid grid-cols-7 gap-1.5">
                        {(() => {
                          const firstIdx = new Date(selectedYear, selectedMonth, 1).getDay();
                          const cells = [];
                          for (let i = 0; i < firstIdx; i++) cells.push(null);
                          for (let d = 1; d <= daysInMonth; d++) cells.push(d);

                          return cells.map((dayNum, index) => {
                            if (dayNum === null) return <div key={`empty-ind-${index}`} className="aspect-square bg-transparent" />;

                            const dStr = String(dayNum).padStart(2, '0');
                            const mStr = String(selectedMonth + 1).padStart(2, '0');
                            const dateStr = `${selectedYear}-${mStr}-${dStr}`;

                            const isFut = dateStr > getTodayStr();
                            
                            const dateObj = new Date(selectedYear, selectedMonth, dayNum);
                            const jsDay = dateObj.getDay();
                            const tenantDay = jsDay === 0 ? 7 : jsDay;
                            const isWkend = weekends.includes(tenantDay);
                            const isHoli = holidays.includes(dateStr);

                            const record = singleStudentAttendance.find(l => l.date === dateStr);

                            let cellClass = 'bg-slate-950 border border-white/5';
                            let textClass = 'text-slate-400';
                            let tag = '';

                            const removal = singleStudentRemoval;
                            const removedDateStr = removal ? new Date(removal.removed_at).toISOString().split('T')[0] : null;

                            if (assignmentDate && dateStr < assignmentDate) {
                              cellClass = 'bg-slate-900/40 border border-dashed border-white/5';
                              textClass = 'text-slate-600';
                              tag = 'N/A';
                            } else if (removedDateStr && dateStr > removedDateStr) {
                              cellClass = 'bg-slate-900/40 border border-dashed border-white/5';
                              textClass = 'text-slate-600';
                              tag = 'N/A';
                            } else if (isWkend || isHoli) {
                              cellClass = 'bg-slate-900/40 border border-dashed border-white/5';
                              textClass = 'text-slate-600';
                              tag = isHoli ? 'Holi' : 'Wkend';
                            } else if (record) {
                              if (record.status === 'present') {
                                cellClass = 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400';
                                textClass = 'text-emerald-300 font-extrabold';
                                tag = 'P';
                              } else if (record.status === 'late') {
                                cellClass = 'bg-amber-950/20 border-amber-500/30 text-amber-400';
                                textClass = 'text-amber-300 font-extrabold';
                                tag = 'L';
                              } else if (record.status === 'absent') {
                                cellClass = 'bg-red-950/20 border-red-500/30 text-red-400';
                                textClass = 'text-red-300 font-extrabold';
                                tag = 'A';
                              }
                            } else if (!isFut) {
                              cellClass = 'bg-red-950/10 border-red-500/10 text-red-400/50';
                              textClass = 'text-red-400/60';
                              tag = 'Absent';
                            }

                            return (
                              <div key={`day-ind-${dayNum}`} className={`aspect-square rounded-xl p-1.5 flex flex-col justify-between select-none ${cellClass}`}>
                                <span className={`text-[9px] font-bold ${textClass}`}>{dayNum}</span>
                                {tag && <span className="text-[6px] text-slate-500 block truncate leading-none uppercase">{tag}</span>}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Fines Log */}
                    <div className="glass-panel p-6 rounded-3xl lg:col-span-2 space-y-6">
                      <div className="border-b border-white/10 pb-3">
                        <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Payment Activity</h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">Fee penalties generated this reporting period</p>
                      </div>

                      <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
                        {singleStudentFines.length === 0 ? (
                          <p className="text-xs text-slate-500 italic text-center py-16">No penalties issued this month.</p>
                        ) : (
                          singleStudentFines.map((f) => (
                            <div key={f.id} className="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex justify-between items-center text-[10px]">
                              <div>
                                <span className="text-[8px] text-slate-500 uppercase block font-semibold">Issued: {new Date(f.issued_date).toLocaleDateString()}</span>
                                <span className="font-bold text-slate-300 block mt-0.5">{f.reason}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-black text-indigo-400 block">₹{Number(f.amount).toLocaleString()}</span>
                                <span className={`inline-flex px-1.5 py-0.2 rounded text-[6px] font-bold uppercase mt-1
                                  ${f.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' :
                                    f.status === 'unpaid' ? 'bg-amber-500/10 text-amber-400' :
                                    f.status === 'pending_verification' ? 'bg-indigo-500/10 text-indigo-400 animate-pulse' :
                                    'bg-slate-500/10 text-slate-400'}`}>
                                  {f.status}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              )}

            </div>
          )}

          {/* TAB 3: COACH PERFORMANCE */}
          {activeTab === 'coach' && (
            <div className="space-y-6 print-full-width">
              {loadingCoachStats ? (
                <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
                  <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin glow-indigo" />
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                    Compiling coach metrics...
                  </p>
                </div>
              ) : coachStats.length === 0 ? (
                <div className="glass-panel p-12 text-center rounded-3xl">
                  <UserCog className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-slate-300 font-bold text-sm">No Coach Profiles</h3>
                  <p className="text-slate-500 text-xs mt-1">There are no coaches registered in this academy.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* KPI Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {/* Active Coaches */}
                    <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-purple-500/5 blur-2xl group-hover:bg-purple-500/10 transition-colors" />
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-xs font-bold tracking-wide uppercase">Active Coaches</span>
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                          <Users className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="mt-4">
                        <span className="text-3xl font-black text-white">{coachStats.length}</span>
                        <span className="text-xs text-slate-500 font-semibold block mt-1">On roster</span>
                      </div>
                    </div>
                    {/* Total Sessions */}
                    <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-cyan-500/5 blur-2xl group-hover:bg-cyan-500/10 transition-colors" />
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-xs font-bold tracking-wide uppercase">Total Sessions</span>
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                          <Clock className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="mt-4">
                        <span className="text-3xl font-black text-white">{coachStats.reduce((s, c) => s + c.totalSessions, 0)}</span>
                        <span className="text-xs text-slate-500 font-semibold block mt-1">Sessions conducted</span>
                      </div>
                    </div>
                    {/* Coach Earnings */}
                    <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group border-purple-500/20">
                      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-purple-500/10 blur-2xl group-hover:bg-purple-500/20 transition-colors" />
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 text-xs font-extrabold tracking-wide uppercase">Est. Coach Payouts</span>
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                          <IndianRupee className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="mt-4">
                        <span className="text-3xl font-black text-white">₹{coachStats.reduce((s, c) => s + c.estimatedEarnings, 0).toLocaleString()}</span>
                        <span className="text-xs text-purple-400 font-bold block mt-1">Total estimated</span>
                      </div>
                    </div>
                  </div>

                  {/* Coach Earnings & Availability Registry */}
                  <div className="glass-panel p-6 rounded-3xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-purple-500/5 blur-3xl pointer-events-none" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-white/10 pb-4">
                      <div>
                        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                          <UserCog className="w-4 h-4 text-purple-400" /> Coach Earnings & Availability Registry
                        </h2>
                        <p className="text-[11px] text-slate-400">Session earnings, availability slots, and batch assignments per coach</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-bold text-slate-400">
                            <th className="p-3 w-[25%] min-w-[160px]">Coach</th>
                            <th className="p-3 w-[15%] min-w-[120px]">Expertise</th>
                            <th className="p-3 w-[20%] min-w-[160px]">Availability</th>
                            <th className="p-3 text-center w-[10%] min-w-[70px]">Batches</th>
                            <th className="p-3 text-center w-[10%] min-w-[70px]">Sessions</th>
                            <th className="p-3 text-right w-[10%] min-w-[100px]">Rate / Session</th>
                            <th className="p-3 text-right w-[10%] min-w-[110px]">Est. Earnings</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs divide-y divide-white/5">
                          {coachStats.map((coach) => (
                            <tr key={coach.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="p-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-300 font-bold text-xs flex-shrink-0">
                                    {coach.avatar_url
                                      ? <img src={coach.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                      : `${coach.first_name[0]}${coach.last_name[0]}`
                                    }
                                  </div>
                                  <div>
                                    <p className="font-semibold text-slate-200">{coach.first_name} {coach.last_name}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 text-slate-400 max-w-[140px]">
                                <span className="truncate block">{coach.coach_profile?.coach_categories?.find(cc => cc.is_primary)?.subcategory?.name || '—'}</span>
                              </td>
                              <td className="p-3 max-w-[160px]">
                                {coach.coach_profile?.availability_slots
                                  ? <span className="text-indigo-300 text-[10px] font-semibold leading-tight block">{coach.coach_profile.availability_slots}</span>
                                  : <span className="text-slate-600 italic">Not set</span>
                                }
                              </td>
                              <td className="p-3 text-center">
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-bold">
                                  {coach.approvedBatchCount}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <span className="text-slate-200 font-bold">{coach.totalSessions}</span>
                              </td>
                              <td className="p-3 text-right text-slate-300 font-mono">
                                ₹{(coach.coach_profile?.hourly_rate ?? 500).toLocaleString()}
                              </td>
                              <td className="p-3 text-right">
                                <span className="text-purple-300 font-black">₹{coach.estimatedEarnings.toLocaleString()}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FINE COLLECTION ANALYTICS */}
          {activeTab === 'collection' && (
            <div className="space-y-6 print-full-width">
              {loadingCollectionData ? (
                <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
                  <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin glow-indigo" />
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                    Compiling collection data...
                  </p>
                </div>
              ) : (
                <div className="glass-panel p-6 rounded-3xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-white/10 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" /> Fine Collection Analytics
                      </h2>
                      <p className="text-[11px] text-slate-400">Month-by-month comparisons of collected vs. outstanding penalties</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold">
                      <div className="flex items-center gap-1.5 bg-emerald-500/5 px-2.5 py-1 rounded-lg border border-emerald-500/10">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse" />
                        <span className="text-slate-300">Collected (Paid)</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-amber-500/5 px-2.5 py-1 rounded-lg border border-amber-500/10">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)] animate-pulse" />
                        <span className="text-slate-300">Pending / Unpaid</span>
                      </div>
                    </div>
                  </div>

                  {collectionChartData.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500">
                      <AlertCircle className="w-8 h-8 mb-2 text-slate-600 animate-bounce" />
                      <p className="text-xs">No active fines data to plot.</p>
                    </div>
                  ) : (
                    (() => {
                      const maxVal = Math.max(...collectionChartData.map(d => d.collected + d.pending), 5000);
                      const yTicks = [maxVal, maxVal * 0.75, maxVal * 0.5, maxVal * 0.25, 0];

                      return (
                        <div className="space-y-4">
                          <div className="relative h-64 w-full flex items-end gap-2 md:gap-8 pt-6 pb-2 px-4 border-b border-white/10">
                            {/* Y-Axis Grid Lines */}
                            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[9px] text-slate-600 font-mono pr-2 font-semibold">
                              {yTicks.map((tick, i) => (
                                <div key={i} className="w-full flex items-center justify-between border-t border-white/[0.03] pt-1">
                                  <span className="bg-slate-950/80 px-1 rounded">₹{Math.round(tick).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>

                            {/* Bars */}
                            <div className="relative z-10 w-full h-full flex justify-around items-end">
                              {collectionChartData.map((d) => {
                                const colPercent = (d.collected / maxVal) * 100;
                                const pendPercent = (d.pending / maxVal) * 100;
                                
                                return (
                                  <div key={d.key} className="flex flex-col items-center group relative w-16">
                                    {/* Tooltip on Hover */}
                                    <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center bg-slate-950 border border-white/10 rounded-xl p-3 shadow-2xl text-[10px] text-slate-300 z-30 min-w-[140px] pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
                                      <span className="font-bold text-white mb-1.5 tracking-wide text-xs block">{d.label} {d.key.split('-')[0]}</span>
                                      <div className="flex justify-between w-full text-emerald-400 font-medium py-0.5">
                                        <span>Paid:</span>
                                        <span className="font-bold">₹{d.collected.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between w-full text-amber-400 font-medium py-0.5">
                                        <span>Pending:</span>
                                        <span className="font-bold">₹{d.pending.toLocaleString()}</span>
                                      </div>
                                      <div className="border-t border-white/10 w-full mt-1.5 pt-1.5 flex justify-between text-indigo-400 font-bold">
                                        <span>Total Fines:</span>
                                        <span>₹{(d.collected + d.pending).toLocaleString()}</span>
                                      </div>
                                    </div>

                                    {/* Bar Column Container */}
                                    <div className="w-full h-48 flex items-end gap-1.5 justify-center">
                                      {/* Collected Bar */}
                                      <div 
                                        style={{ height: `${Math.max(colPercent, 3)}%` }} 
                                        className="w-3 md:w-4 rounded-t bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:brightness-110 transition-all shadow-[0_0_8px_rgba(16,185,129,0.15)] group-hover:shadow-[0_0_12px_rgba(16,185,129,0.35)] duration-300 cursor-pointer"
                                      />
                                      {/* Pending Bar */}
                                      <div 
                                        style={{ height: `${Math.max(pendPercent, 3)}%` }} 
                                        className="w-3 md:w-4 rounded-t bg-gradient-to-t from-amber-600 to-amber-400 group-hover:brightness-110 transition-all shadow-[0_0_8px_rgba(245,158,11,0.15)] group-hover:shadow-[0_0_12px_rgba(245,158,11,0.35)] duration-300 cursor-pointer"
                                      />
                                    </div>

                                    {/* Month Label */}
                                    <span className="text-[10px] text-slate-400 font-bold mt-2 group-hover:text-white transition-colors duration-200 uppercase tracking-wider">
                                      {d.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center relative" style={{ backgroundColor: 'var(--background)' }}>
        <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin glow-indigo" />
        <p className="text-slate-400 text-xs font-semibold tracking-widest mt-4 uppercase">
          Syncing analytics structures...
        </p>
      </div>
    }>
      <AdminReportsContent />
    </Suspense>
  );
}
