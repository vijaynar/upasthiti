'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  User,
  Phone,
  Mail,
  FileText,
  Upload,
  X,
  Download,
  Lock,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Award,
  Landmark,
  ShieldAlert,
  Bell,
  Info,
  Camera,
  Briefcase,
  GraduationCap,
  Eye,
  Star,
  Cake,
  Edit3,
} from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useCategoryTaxonomy } from '@/lib/useCategoryTaxonomy';
import { CategoryPicker, CategorySelection } from '@/components/CategoryPicker';

const EMPTY_CATEGORY_SELECTION: CategorySelection = {
  categoryId: null,
  subcategoryIds: [],
  primarySubcategoryId: null,
  tagIds: [],
  ageGroups: [],
  skillLevels: [],
};

function buildCategorySelection(coachRow: any): CategorySelection {
  const rows = coachRow?.coach_categories ?? [];
  const primary = rows.find((r: any) => r.is_primary) ?? rows[0];
  return {
    categoryId: primary?.subcategory?.category?.id ?? null,
    subcategoryIds: rows.map((r: any) => r.subcategory?.id).filter(Boolean),
    primarySubcategoryId: primary?.subcategory?.id ?? null,
    tagIds: (coachRow?.coach_tags ?? []).map((t: any) => t.tag_id),
    ageGroups: coachRow?.age_groups ?? [],
    skillLevels: coachRow?.skill_levels ?? [],
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  alternate_phone: string | null;
  notification_preferences: {
    email?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
    attendance_reminders?: boolean;
    announcement_alerts?: boolean;
  } | null;
  avatar_url: string | null;
  role: string;
  tenant_id?: string;
  last_login?: string | null;
  login_device?: string | null;
}

interface CoachProfile {
  experience_years: number | null;
  availability_slots: string | null;
  hourly_rate: number | null;
  certificates: string[];
  
  employee_id: string | null;
  designation: string | null;
  department: string | null;
  employee_type: string | null;
  working_days: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_address: string | null;
  joining_date: string | null;
  bio: string | null;
  qualification: string | null;
  avg_rating: number | null;
  state: string | null;
  city: string | null;
  area: string | null;
  service_types: string[] | null;
  class_types: string[] | null;
  languages_known: string[] | null;
  account_status: string | null;
}

interface FinancialSettings {
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc_code: string | null;
  bank_account_holder_name: string | null;
  upi_id: string | null;
}

type ToastType = 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

// ─── Toast Component ─────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl backdrop-blur-md border transition-all duration-300 ${
            t.type === 'success'
              ? 'bg-emerald-900/80 border-emerald-600/50 text-emerald-100'
              : 'bg-red-900/80 border-red-600/50 text-red-100'
          }`}
        >
          {t.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span className="text-sm font-medium">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CoachProfilePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [coach, setCoach] = useState<CoachProfile>({
    experience_years: 0,
    availability_slots: '',
    hourly_rate: null,
    certificates: [],
    employee_id: '',
    designation: '',
    department: '',
    employee_type: '',
    working_days: '',
    gender: '',
    date_of_birth: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_phone: '',
    emergency_contact_address: '',
    joining_date: '',
    bio: '',
    qualification: '',
    avg_rating: null,
    state: '',
    city: '',
    area: '',
    service_types: [],
    class_types: [],
    languages_known: [],
    account_status: '',
  });

  const [financials, setFinancials] = useState<FinancialSettings>({
    bank_name: '',
    bank_account_number: '',
    bank_ifsc_code: '',
    bank_account_holder_name: '',
    upi_id: '',
  });

  const [documents, setDocuments] = useState<Record<string, string>>({});

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // Edit Form Fields
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAlternatePhone, setEditAlternatePhone] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editDateOfBirth, setEditDateOfBirth] = useState('');
  const [editAddress, setEditAddress] = useState('');

  const [editExperienceYears, setEditExperienceYears] = useState('');
  const [editJoiningDate, setEditJoiningDate] = useState('');
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editQualification, setEditQualification] = useState('');

  // Added onboarding edit states
  const [editState, setEditState] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editArea, setEditArea] = useState('');
  const { categories: taxonomyCategories } = useCategoryTaxonomy();
  const [categorySelection, setCategorySelection] = useState<CategorySelection>(EMPTY_CATEGORY_SELECTION);
  const [savedCategorySelection, setSavedCategorySelection] = useState<CategorySelection>(EMPTY_CATEGORY_SELECTION);
  const [editServiceTypes, setEditServiceTypes] = useState<string[]>([]);
  const [editClassTypes, setEditClassTypes] = useState<string[]>([]);
  const [editLanguagesKnown, setEditLanguagesKnown] = useState<string[]>([]);
  const [langInput, setLangInput] = useState('');

  const [editEmergencyContactName, setEditEmergencyContactName] = useState('');
  const [editEmergencyContactRelationship, setEditEmergencyContactRelationship] = useState('');
  const [editEmergencyContactPhone, setEditEmergencyContactPhone] = useState('');
  const [editEmergencyContactAddress, setEditEmergencyContactAddress] = useState('');

  const [editBankName, setEditBankName] = useState('');
  const [editBankAccountNumber, setEditBankAccountNumber] = useState('');
  const [editBankIfscCode, setEditBankIfscCode] = useState('');
  const [editBankAccountHolderName, setEditBankAccountHolderName] = useState('');
  const [editUpiId, setEditUpiId] = useState('');

  // Notification states
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSMS, setNotifSMS] = useState(false); // SMS Notification defaults to false (disabled/not editable)
  const [notifWhatsApp, setNotifWhatsApp] = useState(false);
  const [notifAttendance, setNotifAttendance] = useState(true);
  const [notifAnnouncement, setNotifAnnouncement] = useState(true);

  // Password Change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Avatar ref
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Document upload refs
  const docInputRef = useRef<HTMLInputElement>(null);
  const activeDocType = useRef<string>('');
  const [docUploading, setDocUploading] = useState<string | null>(null);

  // ── Toast Helper ───────────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Data Loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error('Not authenticated');

        const userId = authData.user.id;

        const [userRes, coachRes, financialsRes, docsRes] = await Promise.all([
          supabase
            .from('users')
            .select('id, email, first_name, last_name, phone, alternate_phone, notification_preferences, avatar_url, role, tenant_id, last_login, login_device')
            .eq('id', userId)
            .single(),
          supabase
            .from('coaches')
            .select(`
              experience_years,
              employee_id, designation, department, employee_type, working_days,
              gender, date_of_birth, address, emergency_contact_name, emergency_contact_relationship,
              emergency_contact_phone, emergency_contact_address, joining_date, bio, qualification,
              avg_rating, state, city, area, service_types, class_types, languages_known,
              account_status, age_groups, skill_levels,
              coach_categories(is_primary, subcategory:subcategories(id, name, slug, category:categories(id, name, slug, icon))),
              coach_tags(tag_id)
            `)
            .eq('id', userId)
            .single(),
          supabase
            .from('coach_financial_settings')
            .select('bank_name, bank_account_number, bank_ifsc_code, bank_account_holder_name, upi_id')
            .eq('coach_id', userId)
            .maybeSingle(),
          supabase
            .from('coach_documents')
            .select('document_type, document_name, file_url')
            .eq('coach_id', userId),
        ]);

        if (userRes.error) {
          console.error('Error loading user profile:', JSON.stringify(userRes.error, null, 2));
          throw new Error(userRes.error.message);
        }

        if (coachRes.error) {
          console.error('Error loading coach profile:', JSON.stringify(coachRes.error, null, 2));
          throw new Error(coachRes.error.message);
        }

        if (userRes.data) {
          setUser(userRes.data as UserProfile);
          setEditFirstName(userRes.data.first_name ?? '');
          setEditLastName(userRes.data.last_name ?? '');
          setEditPhone(userRes.data.phone ?? '');
          setEditAlternatePhone(userRes.data.alternate_phone ?? '');
          
          const prefs = userRes.data.notification_preferences || {};
          setNotifEmail(prefs.email !== false);
          setNotifSMS(false); // Default false & disabled
          setNotifWhatsApp(prefs.whatsapp === true);
          setNotifAttendance(prefs.attendance_reminders !== false);
          setNotifAnnouncement(prefs.announcement_alerts !== false);
        }

        if (coachRes.data) {
          const cd = coachRes.data as unknown as CoachProfile;
          setCoach(cd);
          setEditExperienceYears(cd.experience_years != null ? String(cd.experience_years) : '');
          setEditJoiningDate(formatDateToInput(cd.joining_date));
          setEditEmployeeId(cd.employee_id ?? '');
          setEditBio(cd.bio ?? '');
          setEditGender(cd.gender ?? 'Male');
          setEditDateOfBirth(formatDateToInput(cd.date_of_birth));
          setEditAddress(cd.address ?? '');
          setEditEmergencyContactName(cd.emergency_contact_name ?? '');
          setEditEmergencyContactRelationship(cd.emergency_contact_relationship ?? '');
          setEditEmergencyContactPhone(cd.emergency_contact_phone ?? '');
          setEditEmergencyContactAddress(cd.emergency_contact_address ?? '');
          setEditQualification(cd.qualification ?? '');
          
          setEditState(cd.state ?? '');
          setEditCity(cd.city ?? '');
          setEditArea(cd.area ?? '');
          const selection = buildCategorySelection(coachRes.data);
          setCategorySelection(selection);
          setSavedCategorySelection(selection);
          setEditServiceTypes(cd.service_types ?? []);
          setEditClassTypes(cd.class_types ?? []);
          setEditLanguagesKnown(cd.languages_known ?? []);
        }

        if (financialsRes.data) {
          setFinancials(financialsRes.data as FinancialSettings);
          setEditBankName(financialsRes.data.bank_name ?? '');
          setEditBankAccountNumber(financialsRes.data.bank_account_number ?? '');
          setEditBankIfscCode(financialsRes.data.bank_ifsc_code ?? '');
          setEditBankAccountHolderName(financialsRes.data.bank_account_holder_name ?? '');
          setEditUpiId(financialsRes.data.upi_id ?? '');
        } else {
          // If no financial settings row exists, pre-fill with coach's name
          setEditBankAccountHolderName(
            userRes.data ? `${userRes.data.first_name} ${userRes.data.last_name}` : ''
          );
        }

        if (docsRes.data) {
          const docMap: Record<string, string> = {};
          docsRes.data.forEach((d) => {
            const name = d.document_name || d.document_type;
            if (name) docMap[name] = d.file_url || '';
          });
          setDocuments(docMap);
        }
      } catch (err) {
        console.error(err);
        addToast('Failed to load profile data', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Avatar Upload ──────────────────────────────────────────────────────────
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setAvatarUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `avatars/coach_${user.id}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setUser((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      addToast('Profile photo updated!', 'success');
    } catch (err: unknown) {
      console.error(err);
      addToast((err as Error).message ?? 'Avatar upload failed', 'error');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  // ── Profile Save ───────────────────────────────────────────────────────────
  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setProfileSaving(true);
    try {
      const hasAadhaar = !!documents['Aadhaar Card'];
      const hasPan = !!documents['PAN Card'];
      const hasQual = !!documents['Qualification Certificate'];
      const hasAllMandatory = hasAadhaar && hasPan && hasQual;

      let targetStatus = coach?.account_status;
      if (coach?.account_status !== 'Active' && coach?.account_status !== 'Inactive') {
        targetStatus = hasAllMandatory ? 'Pending Verification' : 'Document Upload Pending';
      }

      const putBody = {
        coachId: user.id,
        accountStatus: targetStatus,
        // user fields
        phone: editPhone,
        alternatePhone: editAlternatePhone,
        notificationPreferences: {
          email: notifEmail,
          sms: false,
          whatsapp: notifWhatsApp,
          attendance_reminders: notifAttendance,
          announcement_alerts: notifAnnouncement,
        },
        // coach fields
        employeeId: editEmployeeId,
        experienceYears: editExperienceYears ? Number(editExperienceYears) : 0,
        joiningDate: editJoiningDate,
        gender: editGender,
        dateOfBirth: editDateOfBirth,
        address: editAddress,
        emergencyContactName: editEmergencyContactName,
        emergencyContactRelationship: editEmergencyContactRelationship,
        emergencyContactPhone: editEmergencyContactPhone,
        emergencyContactAddress: editEmergencyContactAddress,
        bio: editBio,
        primarySubcategoryId: categorySelection.primarySubcategoryId,
        subcategoryIds: categorySelection.subcategoryIds,
        tagIds: categorySelection.tagIds,
        ageGroups: categorySelection.ageGroups,
        skillLevels: categorySelection.skillLevels,
        qualification: editQualification,
        state: editState,
        city: editCity,
        area: editArea,
        serviceTypes: editServiceTypes,
        classTypes: editClassTypes,
        languagesKnown: editLanguagesKnown,
        // bank details
        bankName: editBankName,
        bankAccountNumber: editBankAccountNumber,
        bankIfscCode: editBankIfscCode,
        bankAccountHolderName: editBankAccountHolderName,
        upiId: editUpiId,
      };

      const res = await fetch('/api/v1/coaches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Failed to save profile');
      }

      setUser((prev) => prev ? {
        ...prev,
        phone: editPhone,
        alternate_phone: editAlternatePhone,
        notification_preferences: putBody.notificationPreferences,
      } : null);

      setSavedCategorySelection(categorySelection);

      setCoach((prev) => ({
        ...prev,
        employee_id: editEmployeeId,
        experience_years: editExperienceYears ? Number(editExperienceYears) : 0,
        joining_date: editJoiningDate,
        gender: editGender,
        date_of_birth: editDateOfBirth,
        address: editAddress,
        state: editState,
        city: editCity,
        area: editArea,
        service_types: editServiceTypes,
        class_types: editClassTypes,
        languages_known: editLanguagesKnown,
        emergency_contact_name: editEmergencyContactName,
        emergency_contact_relationship: editEmergencyContactRelationship,
        emergency_contact_phone: editEmergencyContactPhone,
        emergency_contact_address: editEmergencyContactAddress,
        bio: editBio,
        qualification: editQualification,
        account_status: targetStatus,
      }));

      setFinancials({
        bank_name: editBankName,
        bank_account_number: editBankAccountNumber,
        bank_ifsc_code: editBankIfscCode,
        bank_account_holder_name: editBankAccountHolderName,
        upi_id: editUpiId,
      });

      addToast('Profile updated successfully!', 'success');
      setIsEditing(false);
    } catch (err: unknown) {
      console.error(err);
      addToast((err as Error).message ?? 'Save failed', 'error');
    } finally {
      setProfileSaving(false);
    }
  }

  // ── Cancel Editing ──────────────────────────────────────────────────────────
  function handleCancelEdit() {
    if (user) {
      setEditFirstName(user.first_name ?? '');
      setEditLastName(user.last_name ?? '');
      setEditPhone(user.phone ?? '');
      setEditAlternatePhone(user.alternate_phone ?? '');
      const prefs = user.notification_preferences || {};
      setNotifEmail(prefs.email !== false);
      setNotifSMS(false);
      setNotifWhatsApp(prefs.whatsapp === true);
      setNotifAttendance(prefs.attendance_reminders !== false);
      setNotifAnnouncement(prefs.announcement_alerts !== false);
    }
    setEditExperienceYears(coach.experience_years != null ? String(coach.experience_years) : '');
    setEditJoiningDate(formatDateToInput(coach.joining_date));
    setEditEmployeeId(coach.employee_id ?? '');
    setEditBio(coach.bio ?? '');
    setEditGender(coach.gender ?? 'Male');
    setEditDateOfBirth(formatDateToInput(coach.date_of_birth));
    setEditAddress(coach.address ?? '');
    setEditEmergencyContactName(coach.emergency_contact_name ?? '');
    setEditEmergencyContactRelationship(coach.emergency_contact_relationship ?? '');
    setEditEmergencyContactPhone(coach.emergency_contact_phone ?? '');
    setEditEmergencyContactAddress(coach.emergency_contact_address ?? '');
    setEditQualification(coach.qualification ?? '');

    setEditState(coach.state ?? '');
    setEditCity(coach.city ?? '');
    setEditArea(coach.area ?? '');
    setCategorySelection(savedCategorySelection);
    setEditServiceTypes(coach.service_types ?? []);
    setEditClassTypes(coach.class_types ?? []);
    setEditLanguagesKnown(coach.languages_known ?? []);

    setEditBankName(financials.bank_name ?? '');
    setEditBankAccountNumber(financials.bank_account_number ?? '');
    setEditBankIfscCode(financials.bank_ifsc_code ?? '');
    setEditBankAccountHolderName(financials.bank_account_holder_name ?? '');
    setEditUpiId(financials.upi_id ?? '');

    setIsEditing(false);
  }

  // ── Document Upload ────────────────────────────────────────────────────────
  const triggerDocUpload = (docType: string) => {
    activeDocType.current = docType;
    docInputRef.current?.click();
  };

  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const docType = activeDocType.current;
    setDocUploading(docType);
    try {
      const path = `doc_${user.id}_${docType.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('coach-certificates')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('coach-certificates').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      // map docType to db constraint list
      let mappedType = 'Other';
      if (docType === 'Aadhaar Card' || docType === 'PAN Card') {
        mappedType = 'Government ID';
      } else if (docType === 'Qualification Certificate' || docType === 'NIS Certification') {
        mappedType = 'Certification';
      }

      // Check if document already exists
      const { data: existingDoc } = await supabase
        .from('coach_documents')
        .select('id')
        .eq('coach_id', user.id)
        .eq('document_name', docType)
        .maybeSingle();

      if (existingDoc) {
        const { error: dbErr } = await supabase
          .from('coach_documents')
          .update({
            file_url: publicUrl,
            verification_status: 'Pending',
            updated_at: new Date().toISOString()
          })
          .eq('id', existingDoc.id);
        if (dbErr) throw dbErr;
      } else {
        const { error: dbErr } = await supabase
          .from('coach_documents')
          .insert({
            coach_id: user.id,
            tenant_id: user.tenant_id || '022c1494-057e-4c80-80dd-88fa4b1287b5',
            document_type: mappedType,
            document_name: docType,
            file_url: publicUrl,
            verification_status: 'Pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        if (dbErr) throw dbErr;
      }

      setDocuments((prev) => ({ ...prev, [docType]: publicUrl }));
      addToast(`${docType} uploaded successfully!`, 'success');
    } catch (err: unknown) {
      console.error(err);
      addToast((err as Error).message ?? 'Upload failed', 'error');
    } finally {
      setDocUploading(null);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  // ── Password Change ────────────────────────────────────────────────────────
  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
      addToast('Password updated successfully!', 'success');
    } catch (err: unknown) {
      console.error(err);
      addToast((err as Error).message ?? 'Password update failed', 'error');
    } finally {
      setPasswordSaving(false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getInitials(first: string, last: string) {
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  }

  function formatDateTime(dateString: string | null | undefined) {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  }

  function formatDateToInput(dateString: string | null | undefined): string {
    if (!dateString) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  }

  // ── Loading Skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#060814] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          <p className="text-slate-400 text-sm">Loading profile…</p>
        </div>
      </div>
    );
  }

  const documentTypes = [
    'Aadhaar Card',
    'PAN Card',
    'Qualification Certificate',
    'NIS Certification',
    'Experience Certificate',
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: 'var(--background)' }}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Hidden inputs */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />
      <input
        ref={docInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleDocFileChange}
      />

      <div className="max-w-6xl mx-auto space-y-4">

        {/* ── Page Title Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>My Profile</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
              View and manage your personal information, contact details and preferences.
            </p>
          </div>
          <div>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition-all"
              >
                <Edit3 className="w-4 h-4 text-indigo-500" />
                Edit Profile
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleProfileSave}
                  disabled={profileSaving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 shadow-md transition-all disabled:opacity-50"
                >
                  {profileSaving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Save Changes
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition-all"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Card 1: Hero Header Card ────────────────────────────────────── */}
        <section className="glass-panel rounded-3xl p-4 shadow-sm flex flex-col lg:flex-row items-center gap-4 lg:gap-5">
          
          {/* Left Block: Avatar with Edit Button */}
          <div className="relative shrink-0">
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="relative group w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden border-4 border-white/10 shadow-sm focus:outline-none transition-all"
              aria-label="Change avatar picture"
            >
              {user?.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={user.avatar_url}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">
                    {user ? getInitials(user.first_name, user.last_name) : '?'}
                  </span>
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {avatarUploading ? (
                  <RefreshCw className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </div>
            </button>

            {/* Float camera badge at bottom right */}
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="absolute bottom-0 right-0 bg-white/10 backdrop-blur border border-white/20 p-1 rounded-full shadow-md hover:bg-white/20 transition-all" style={{ color: 'var(--foreground)' }}
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Middle Block: Info, Title & Metrics */}
          <div className="flex-1 min-w-0 space-y-2.5 text-center lg:text-left">
            <div>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5 mb-1.5">
                <h2 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                  {user ? `${user.first_name} ${user.last_name}` : 'Coach Profile'}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                  {coach.avg_rating != null ? Number(coach.avg_rating).toFixed(1) : '4.8'}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  coach.account_status === 'Active'
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                    : coach.account_status === 'Document Upload Pending'
                    ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900'
                    : coach.account_status === 'Pending Verification'
                    ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900'
                    : 'bg-slate-50 dark:bg-slate-950/20 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-900'
                }`}>
                  {coach.account_status || 'Inactive'}
                </span>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground-muted)' }}>
                {taxonomyCategories
                  .find(c => c.id === savedCategorySelection.categoryId)
                  ?.subcategories.find(s => s.id === savedCategorySelection.primarySubcategoryId)?.name || 'Coach'}
              </p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-1">
                Unique Id: {coach.employee_id || 'Generating...'}
              </p>
            </div>

            {/* Horizontal 4 Box Metadata Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.04] rounded-lg border border-white/10">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Joined On</p>
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                    {formatDate(coach.joining_date)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.04] rounded-lg border border-white/10">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Experience</p>
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                    {coach.experience_years != null ? `${coach.experience_years} Years` : '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.04] rounded-lg border border-white/10">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Qualification</p>
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }} title={coach.qualification || '—'}>
                    {coach.qualification || '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.04] rounded-lg border border-white/10">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Cake className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Date of Birth</p>
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                    {formatDate(coach.date_of_birth)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Block: Bio Quote */}
          <div className="w-full lg:w-60 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 pt-3 lg:pt-0 lg:pl-5">
            <div className="border-l-4 border-indigo-500 pl-4 py-1.5 bg-white/[0.03] rounded-r-xl">
              <span className="text-indigo-400 text-3xl font-serif leading-none select-none block h-2">“</span>
              {!isEditing ? (
                <p className="text-xs italic max-h-32 overflow-y-auto" style={{ color: 'var(--foreground-muted)' }}>
                  {coach.bio || 'Passionate about training students and helping them achieve their best.'}
                </p>
              ) : (
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Enter bio or quote..."
                  rows={3}
                  className="glass-input w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none resize-none bg-transparent"
                />
              )}
            </div>
          </div>

        </section>

        {/* ── Profile Grid Layout ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Column 1: Personal Information + Bank Details */}
          <div className="space-y-4">
            {/* Personal Information Panel */}
            <div className="glass-panel rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-white/10 pb-1.5 mb-2">
                <User className="w-5 h-5 text-indigo-500" />
                <h3 className="text-md font-bold" style={{ color: 'var(--foreground)' }}>Personal Information</h3>
              </div>

              {!isEditing ? (
                <div className="divide-y divide-white/5 text-sm">
                  <div className="flex flex-row items-start py-1 first:pt-0">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Full Name</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {user ? `${user.first_name} ${user.last_name}` : '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Email Address</span>
                    <span className="font-normal break-words min-w-0 flex-1 truncate" style={{ color: 'var(--foreground)' }}>
                      {user?.email || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Phone Number</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {user?.phone || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Alternate Phone</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {user?.alternate_phone || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Gender</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {coach.gender || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Date of Birth</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {formatDate(coach.date_of_birth)}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>State</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {coach.state || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>City</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {coach.city || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Area/Locality</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {coach.area || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1 last:pb-0">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Address</span>
                    <span className="font-normal break-words min-w-0 flex-1 leading-relaxed" style={{ color: 'var(--foreground)' }}>
                      {coach.address || '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">First Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Last Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Phone Number <span className="text-red-500">*</span></label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Alternate Phone</label>
                    <input
                      type="tel"
                      value={editAlternatePhone}
                      onChange={(e) => setEditAlternatePhone(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Gender <span className="text-red-500">*</span></label>
                    <select
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none bg-transparent"
                    >
                      <option value="Male" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Male</option>
                      <option value="Female" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Female</option>
                      <option value="Other" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Date of Birth <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={editDateOfBirth}
                      onChange={(e) => setEditDateOfBirth(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">State <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editState}
                      onChange={(e) => setEditState(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">City <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Area/Locality <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editArea}
                      onChange={(e) => setEditArea(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Address <span className="text-red-500">*</span></label>
                    <textarea
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      rows={2}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bank Details Panel */}
            <div className="glass-panel rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-white/10 pb-1.5 mb-2">
                <Landmark className="w-5 h-5 text-indigo-500" />
                <h3 className="text-md font-bold" style={{ color: 'var(--foreground)' }}>Bank Details</h3>
              </div>

              {!isEditing ? (
                <div className="divide-y divide-white/5 text-sm">
                  <div className="flex flex-row items-start py-1 first:pt-0">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Bank Name</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {financials.bank_name || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Account Number</span>
                    <span className="font-mono font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {financials.bank_account_number || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>IFSC Code</span>
                    <span className="font-mono font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {financials.bank_ifsc_code || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Account Holder Name</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {financials.bank_account_holder_name || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1 last:pb-0">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>UPI ID</span>
                    <span className="font-mono font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {financials.upi_id || '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Bank Name</label>
                    <input
                      type="text"
                      value={editBankName}
                      onChange={(e) => setEditBankName(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Account Number</label>
                    <input
                      type="text"
                      value={editBankAccountNumber}
                      onChange={(e) => setEditBankAccountNumber(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">IFSC Code</label>
                    <input
                      type="text"
                      value={editBankIfscCode}
                      onChange={(e) => setEditBankIfscCode(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Account Holder Name</label>
                    <input
                      type="text"
                      value={editBankAccountHolderName}
                      onChange={(e) => setEditBankAccountHolderName(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">UPI ID</label>
                    <input
                      type="text"
                      value={editUpiId}
                      onChange={(e) => setEditUpiId(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Professional Information + Account & Security */}
          <div className="space-y-4">
            {/* Professional Information Panel */}
            <div className="glass-panel rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-white/10 pb-1.5 mb-2">
                <Briefcase className="w-5 h-5 text-indigo-500" />
                <h3 className="text-md font-bold" style={{ color: 'var(--foreground)' }}>Professional Information</h3>
              </div>

              {!isEditing ? (
                <div className="divide-y divide-white/5 text-sm">
                  <div className="flex flex-row items-start py-1 first:pt-0">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Primary Skill</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {taxonomyCategories
                        .find(c => c.id === savedCategorySelection.categoryId)
                        ?.subcategories.find(s => s.id === savedCategorySelection.primarySubcategoryId)?.name || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Experience</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {coach.experience_years != null ? `${coach.experience_years} Years` : '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Qualification</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {coach.qualification || '—'}
                    </span>
                  </div>

                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Service Types</span>
                    <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                      {coach.service_types && coach.service_types.length > 0 ? (
                        coach.service_types.map((type) => (
                          <span key={type} className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-xs border border-indigo-500/20">
                            {type}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--foreground)' }}>—</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Class Types</span>
                    <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                      {coach.class_types && coach.class_types.length > 0 ? (
                        coach.class_types.map((type) => (
                          <span key={type} className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-xs border border-indigo-500/20">
                            {type}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--foreground)' }}>—</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-row items-start py-1 last:pb-0">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Languages Known</span>
                    <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                      {coach.languages_known && coach.languages_known.length > 0 ? (
                        coach.languages_known.map((lang) => (
                          <span key={lang} className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-xs border border-indigo-500/20">
                            {lang}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--foreground)' }}>—</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="md:col-span-2">
                    <CategoryPicker
                      categories={taxonomyCategories}
                      value={categorySelection}
                      onChange={setCategorySelection}
                      theme="dark"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Experience (Years) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      value={editExperienceYears}
                      onChange={(e) => setEditExperienceYears(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Qualification</label>
                    <input
                      type="text"
                      value={editQualification}
                      onChange={(e) => setEditQualification(e.target.value)}
                      placeholder="e.g. B.P.Ed, NIS Certified"
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Service Types <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-2">
                      {['Offline', 'Online', 'Hybrid'].map((opt) => {
                        const isSelected = editServiceTypes.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setEditServiceTypes(editServiceTypes.filter((x) => x !== opt));
                              } else {
                                setEditServiceTypes([...editServiceTypes, opt]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'border-white/10 text-slate-400 hover:border-white/20'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Class Types <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-2">
                      {['One-to-One', 'Group Classes'].map((opt) => {
                        const isSelected = editClassTypes.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setEditClassTypes(editClassTypes.filter((x) => x !== opt));
                              } else {
                                setEditClassTypes([...editClassTypes, opt]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'border-white/10 text-slate-400 hover:border-white/20'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Languages Known <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {editLanguagesKnown.map((lang) => (
                        <span
                          key={lang}
                          className="inline-flex items-center gap-1 bg-white/5 border border-white/10 text-slate-300 px-2 py-0.5 rounded-lg text-xs"
                        >
                          {lang}
                          <button
                            type="button"
                            onClick={() => setEditLanguagesKnown(editLanguagesKnown.filter((l) => l !== lang))}
                            className="text-slate-500 hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Type language and press Enter"
                        value={langInput}
                        onChange={(e) => setLangInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = langInput.trim();
                            if (val && !editLanguagesKnown.includes(val)) {
                              setEditLanguagesKnown([...editLanguagesKnown, val]);
                              setLangInput('');
                            }
                          }
                        }}
                        className="glass-input flex-1 rounded-xl px-3 py-2 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = langInput.trim();
                          if (val && !editLanguagesKnown.includes(val)) {
                            setEditLanguagesKnown([...editLanguagesKnown, val]);
                            setLangInput('');
                          }
                        }}
                        className="border border-white/10 hover:border-white/25 px-3 py-2 rounded-xl text-xs"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Account & Security Panel */}
            <div className="glass-panel rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-white/10 pb-1.5 mb-2">
                <Lock className="w-5 h-5 text-indigo-500" />
                <h3 className="text-md font-bold" style={{ color: 'var(--foreground)' }}>Account &amp; Security</h3>
              </div>

              <div className="divide-y divide-white/5 text-sm">
                  <div className="flex flex-row items-start py-1 first:pt-0">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Login Email</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {user?.email || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Password</span>
                    <div className="flex items-center gap-3 flex-1">
                      <span className="font-normal font-mono" style={{ color: 'var(--foreground)' }}>********</span>
                      {!showPasswordForm && (
                        <button
                          onClick={() => setShowPasswordForm(true)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-semibold hover:underline"
                        >
                          Change Password
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Last Login</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {formatDateTime(user?.last_login)}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1 last:pb-0">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Login Device</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {user?.login_device || '—'}
                    </span>
                  </div>
                </div>

                {/* Password form drawer */}
                {showPasswordForm && (
                  <form onSubmit={handlePasswordChange} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 mt-4 text-xs max-w-md">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold" style={{ color: 'var(--foreground)' }}>Change Account Password</h4>
                      <button type="button" onClick={() => setShowPasswordForm(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min 8 characters"
                        className="glass-input w-full rounded-xl px-3 py-1.5 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Confirm Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="glass-input w-full rounded-xl px-3 py-1.5 focus:outline-none"
                      />
                    </div>

                    {passwordError && (
                      <p className="text-red-500 font-semibold flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {passwordError}
                      </p>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowPasswordForm(false)}
                        className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-lg font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={passwordSaving}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"
                      >
                        {passwordSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        Update
                      </button>
                    </div>
                  </form>
                )}
            </div>

          </div>

          {/* Column 3: Emergency Contact + Documents + Notifications */}
          <div className="space-y-4">
            {/* Emergency Contact Panel */}
            <div className="glass-panel rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-white/10 pb-1.5 mb-2">
                <ShieldAlert className="w-5 h-5 text-indigo-500" />
                <h3 className="text-md font-bold" style={{ color: 'var(--foreground)' }}>Emergency Contact</h3>
              </div>

              {!isEditing ? (
                <div className="divide-y divide-white/5 text-sm">
                  <div className="flex flex-row items-start py-1 first:pt-0">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Contact Name</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {coach.emergency_contact_name || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Relationship</span>
                    <div className="flex-1">
                      <span className="font-normal text-xs bg-white/5 px-2 py-0.5 rounded border border-white/10 inline-block" style={{ color: 'var(--foreground)' }}>
                        {coach.emergency_contact_relationship || '—'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-row items-start py-1">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Phone Number</span>
                    <span className="font-normal break-words min-w-0 flex-1" style={{ color: 'var(--foreground)' }}>
                      {coach.emergency_contact_phone || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-start py-1 last:pb-0">
                    <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>Address</span>
                    <span className="font-normal break-words min-w-0 flex-1 leading-relaxed" style={{ color: 'var(--foreground)' }}>
                      {coach.emergency_contact_address || '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Contact Name</label>
                    <input
                      type="text"
                      value={editEmergencyContactName}
                      onChange={(e) => setEditEmergencyContactName(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Relationship</label>
                    <input
                      type="text"
                      value={editEmergencyContactRelationship}
                      onChange={(e) => setEditEmergencyContactRelationship(e.target.value)}
                      placeholder="e.g. Father, Spouse"
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Phone Number</label>
                    <input
                      type="tel"
                      value={editEmergencyContactPhone}
                      onChange={(e) => setEditEmergencyContactPhone(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1.5">Address</label>
                    <textarea
                      value={editEmergencyContactAddress}
                      onChange={(e) => setEditEmergencyContactAddress(e.target.value)}
                      rows={2}
                      className="glass-input w-full rounded-xl px-3 py-2 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Documents Panel */}
            <div className="glass-panel rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-white/10 pb-1.5 mb-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                <h3 className="text-md font-bold" style={{ color: 'var(--foreground)' }}>Documents</h3>
              </div>

              <div className="divide-y divide-white/5 text-sm">
                {documentTypes.map((docType) => {
                  const fileUrl = documents[docType];
                  const isUploading = docUploading === docType;
                  const isMandatory = docType === 'Aadhaar Card' || docType === 'PAN Card' || docType === 'Qualification Certificate';
                  return (
                    <div key={docType} className="flex flex-row items-center py-1 first:pt-0 last:pb-0">
                      <span className="font-medium w-28 sm:w-36 shrink-0" style={{ color: 'var(--foreground-muted)' }}>
                        {docType}
                        {isMandatory && <span className="text-red-500 ml-1 font-bold">*</span>}
                      </span>
                      <div className="flex-1 min-w-0 font-normal">
                        {fileUrl ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:underline flex items-center gap-1.5 font-normal"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </a>
                            {isEditing && (
                              <button
                                onClick={() => triggerDocUpload(docType)}
                                disabled={isUploading}
                                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                                title="Reupload document"
                              >
                                {isUploading ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Upload className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        ) : (
                          isEditing ? (
                            <button
                              onClick={() => triggerDocUpload(docType)}
                              disabled={isUploading}
                              className="text-indigo-500 hover:text-indigo-600 flex items-center gap-1.5 disabled:opacity-50 font-normal cursor-pointer"
                            >
                              {isUploading ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  uploading…
                                </>
                              ) : (
                                <>
                                  <Upload className="w-3.5 h-3.5" />
                                  Upload
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Not Uploaded</span>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notification Preferences Panel */}
            <div className="glass-panel rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-white/10 pb-1.5 mb-2">
                <Bell className="w-5 h-5 text-indigo-500" />
                <h3 className="text-md font-bold" style={{ color: 'var(--foreground)' }}>Notification Preferences</h3>
              </div>

              <div className="space-y-4">
                {/* Email Notifications Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                    Email Notifications
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifEmail}
                      disabled={!isEditing}
                      onChange={(e) => setNotifEmail(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed"></div>
                  </label>
                </div>

                {/* SMS Notifications Toggle (Disabled & unchecked by default) */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                      SMS Notifications
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-not-allowed">
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={true}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 dark:bg-slate-800/40 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 dark:after:bg-slate-600 after:rounded-full after:h-4 after:w-4 opacity-50"></div>
                  </label>
                </div>

                {/* WhatsApp Notifications Toggle (Newly Added) */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                    WhatsApp Notifications
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifWhatsApp}
                      disabled={!isEditing}
                      onChange={(e) => setNotifWhatsApp(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed"></div>
                  </label>
                </div>

                {/* Attendance Reminders Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                    Attendance Reminders
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifAttendance}
                      disabled={!isEditing}
                      onChange={(e) => setNotifAttendance(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed"></div>
                  </label>
                </div>

                {/* Announcement Alerts Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                    Announcement Alerts
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifAnnouncement}
                      disabled={!isEditing}
                      onChange={(e) => setNotifAnnouncement(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ── Footer Information Banner ─────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-xs">
          <Info className="w-5 h-5 shrink-0 text-indigo-500" />
          <p className="font-medium">
            Keep your profile information updated to ensure smooth communication and important notifications.
          </p>
        </div>

        {/* Bottom save bar when editing */}
        {isEditing && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-800 shadow-xl px-6 py-3.5 rounded-2xl flex items-center gap-4">
            <span className="text-xs font-semibold" style={{ color: 'var(--foreground-muted)' }}>
              You have unsaved changes
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelEdit}
                className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold px-4 py-2 rounded-xl transition-all"
              >
                Discard
              </button>
              <button
                onClick={handleProfileSave}
                disabled={profileSaving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 shadow-md transition-all disabled:opacity-50"
              >
                {profileSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
