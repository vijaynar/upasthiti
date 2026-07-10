'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import {
  Building2, Eye, EyeOff, Globe, Lock, Mail, Sparkles, User,
  Check, CheckCircle2, ChevronLeft, ChevronRight, X, Phone,
  ShieldCheck, FileText, MapPin, AlertCircle, Camera, ArrowLeft, ArrowRight,
  Upload, Trash2, ShieldAlert, IndianRupee, Landmark, Calendar, Award
} from 'lucide-react';
import { useCategoryTaxonomy } from '@/lib/useCategoryTaxonomy';
import { CategoryPicker, CategorySelection } from '@/components/CategoryPicker';
import { useServiceAreas } from '@/lib/useServiceAreas';
import { ServiceAreaPicker, ServiceAreaSelection } from '@/components/ServiceAreaPicker';
import { LocalityAutocompleteInput } from '@/components/LocalityAutocompleteInput';

const SERVICE_TYPES_ONBOARD = [
  { value: 'Offline', label: 'Offline Coaching' },
  { value: 'Online', label: 'Online Coaching' },
  { value: 'Hybrid', label: 'Hybrid (Online + Offline)' }
];

const CLASS_TYPES_ONBOARD = [
  { value: 'Group Classes', label: 'Group Classes' },
  { value: 'One-to-One', label: 'One-to-One Sessions' }
];

const LANGUAGES_ONBOARD = [
  'English', 'Hindi', 'Kannada', 'Telugu', 'Tamil', 'Malayalam', 'Marathi', 'Gujarati'
];

const DOCUMENT_TYPES = [
  { key: 'Aadhaar Card', label: 'Aadhaar Card', required: true, hint: 'Upload front & back of your Aadhaar card' },
  { key: 'PAN Card', label: 'PAN Card', required: true, hint: 'Upload a clear photo of your PAN card' },
  { key: 'Qualification Certificate', label: 'Qualification Certificate', required: true, hint: 'Degree or diploma certificate' },
  { key: 'NIS Certification', label: 'NIS Certification', required: false, hint: 'National Institute of Sports certification (if applicable)' },
  { key: 'Experience Certificate', label: 'Experience Certificate', required: false, hint: 'Previous employer / academy letter' },
];

interface CoachOnboardingWizardProps {
  isAdminMode: boolean;
  tenantId?: string;
  onCancel: () => void;
  onSuccess: (userId: string) => void;
  theme?: 'light' | 'dark';
  testMode?: boolean;
}

export function CoachOnboardingWizard({
  isAdminMode,
  tenantId,
  onCancel,
  onSuccess,
  theme = 'light',
  testMode = false
}: CoachOnboardingWizardProps) {
  const supabase = createBrowserClient();
  const isDark = theme === 'dark';

  const [step, setStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Step 1: Personal Details ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState('Male');
  const [dob, setDob] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);

  // --- Step 2: Professional Profile ---
  const { categories } = useCategoryTaxonomy();
  const [categorySelection, setCategorySelection] = useState<CategorySelection>({
    categoryId: null,
    subcategoryIds: [],
    primarySubcategoryId: null,
    tagIds: [],
    ageGroups: [],
    skillLevels: [],
  });
  const [specialization, setSpecialization] = useState('');
  const [experienceYears, setExperienceYears] = useState('6');
  const [qualification, setQualification] = useState('B.P.Ed, NIS Certified');
  const [languagesKnown, setLanguagesKnown] = useState<string[]>(['English', 'Hindi']);
  const [langInput, setLangInput] = useState('');
  const [serviceTypes, setServiceTypes] = useState<string[]>(['Offline', 'Online']);
  const [classTypes, setClassTypes] = useState<string[]>(['Group Classes']);
  const [bio, setBio] = useState('Passionate sports coach with years of training experience.');
  const [certificationsSummary, setCertificationsSummary] = useState('');
  const { areas: serviceAreas } = useServiceAreas();
  const [serviceAreaSelection, setServiceAreaSelection] = useState<ServiceAreaSelection>({
    areaIds: [],
    communities: [],
  });

  // Admin Only Payroll Configs
  const [salaryType, setSalaryType] = useState('Fixed Monthly');
  const [fixedSalary, setFixedSalary] = useState('0');
  const [perClassRate, setPerClassRate] = useState('0');
  const [revenueSharePct, setRevenueSharePct] = useState('0');

  // --- Step 3: Documents ---
  const [docFiles, setDocFiles] = useState<{ [key: string]: File | null }>({
    'Aadhaar Card': null,
    'PAN Card': null,
    'Qualification Certificate': null,
    'NIS Certification': null,
    'Experience Certificate': null,
  });

  // --- Step 4: Location Details & Bank Details ---
  const [country, setCountry] = useState('India');
  const [stateName, setStateName] = useState('Karnataka');
  const [cityName, setCityName] = useState('Bangalore');
  const [areaName, setAreaName] = useState('Indiranagar');
  const [addressLine, setAddressLine] = useState('123, 5th Main, Indiranagar');
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().split('T')[0]);

  // Bank Info (Admin mode input, self mode can read PAN)
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfscCode, setBankIfscCode] = useState('');
  const [upiId, setUpiId] = useState('');
  const [panNumber, setPanNumber] = useState('');

  // --- Helper validation checks ---
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isPhoneValid = phone.length === 10;
  
  // Password validation
  const hasLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const isPasswordValid = hasLength && hasUppercase && hasNumber && hasSpecial;

  const isStep1Valid = firstName.trim() !== '' && 
                       lastName.trim() !== '' && 
                       isEmailValid && 
                       isPhoneValid && 
                       gender !== '' && 
                       dob !== '' && 
                       country.trim() !== '' && 
                       stateName.trim() !== '' && 
                       cityName.trim() !== '';

  const isStep2Valid = categorySelection.primarySubcategoryId !== null &&
                       experienceYears.trim() !== '' &&
                       Number(experienceYears) >= 0 &&
                       qualification.trim() !== '' &&
                       serviceTypes.length > 0 &&
                       classTypes.length > 0 &&
                       bio.trim().length > 0 &&
                       bio.length <= 500;

  const isStep3Valid = true; // Documents step validation (optional, can submit empty if not strict)
  const isStep4Valid = isPasswordValid;

  const STEPS_LIST = [
    { id: 1, name: 'Personal Information', desc: 'Basic details & location' },
    { id: 2, name: 'Professional Profile', desc: 'Your skills and experience' },
    { id: 3, name: 'Documents', desc: 'Upload identity & certificates' },
    { id: 4, name: 'Account Security', desc: 'Secure your account' },
    { id: 5, name: 'Review & Submit', desc: 'Review your information' }
  ];

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const addLanguage = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = langInput.trim();
      if (val && !languagesKnown.includes(val)) {
        setLanguagesKnown(prev => [...prev, val]);
        setLangInput('');
      }
    }
  };

  const removeLanguage = (lang: string) => {
    setLanguagesKnown(prev => prev.filter(l => l !== lang));
  };

  const fillRandomData = () => {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const randFirst = ['Amit', 'Rajesh', 'Vikram', 'Pooja', 'Neha', 'Sanjay', 'Preeti', 'Sunil'][Math.floor(Math.random() * 8)];
    const randLast = ['Sharma', 'Verma', 'Kumar', 'Patel', 'Joshi', 'Singh', 'Gupta', 'Reddy'][Math.floor(Math.random() * 8)];
    const randEmail = `coach.${randFirst.toLowerCase()}.${randLast.toLowerCase()}.${randomId}@upasthiti.com`;
    const randPhone = Math.floor(6000000000 + Math.random() * 3999999999).toString();
    const randPassword = `Onboard@${randomId}!`;
    const randDOB = '1990-06-15';
    const randGender = Math.random() > 0.5 ? 'Male' : 'Female';

    setFirstName(randFirst);
    setLastName(randLast);
    setEmail(randEmail);
    setPhone(randPhone);
    setPassword(randPassword);
    setGender(randGender);
    setDob(randDOB);
    setAvatarPreview(`https://api.dicebear.com/7.x/adventurer/svg?seed=${randFirst}${randomId}`);

    if (categories.length > 0) {
      const cat = categories[Math.floor(Math.random() * categories.length)];
      const sub = cat.subcategories.length > 0
        ? cat.subcategories[Math.floor(Math.random() * cat.subcategories.length)]
        : null;
      setCategorySelection({
        categoryId: cat.id,
        subcategoryIds: sub ? [sub.id] : [],
        primarySubcategoryId: sub?.id ?? null,
        tagIds: [],
        ageGroups: ['Kids', 'Adults'],
        skillLevels: ['Beginner', 'Intermediate'],
      });
    }
    setExperienceYears(Math.floor(2 + Math.random() * 12).toString());
    setQualification('B.P.Ed, Certified Instructor');
    setBio('Passionate coaching specialist focused on standard fitness, skill refinement, and consistent training modules.');
    setCertificationsSummary('National Coaching Federation Level 2, Certified Sports Physiologist.');

    if (serviceAreas.length > 0) {
      const shuffled = [...serviceAreas].sort(() => Math.random() - 0.5);
      setServiceAreaSelection({ areaIds: shuffled.slice(0, 2).map(a => a.id), communities: [] });
    }

    setAddressLine('Flat 402, 3rd Block, Lotus Apts');
    setBankName('State Bank of India');
    setBankAccountNumber(`3040506070${randomId}`);
    setBankIfscCode('SBIN0004561');
    setUpiId(`${randFirst.toLowerCase()}@oksbi`);
    setPanNumber(`ABCDE${randomId}F`);
  };

  const navigateToStep = (targetStep: number) => {
    if (targetStep > step) {
      if (step === 1 && !isStep1Valid) return;
      if (step === 2 && !isStep2Valid) return;
      if (step === 3 && !isStep3Valid) return;
      if (step === 4 && !isStep4Valid) return;
    }
    setStep(targetStep);
    if (targetStep > maxStepReached) {
      setMaxStepReached(targetStep);
    }
  };

  // Plain async function, not a form submit handler — the final step's button
  // is type="button" with an explicit onClick, so this only ever runs when the
  // user actually clicks it. (Wiring this to a native <form onSubmit>, with a
  // button that toggles type="button" -> type="submit" across the step 4 -> 5
  // transition in the same DOM position, caused the whole form to submit the
  // instant Step 5 rendered — the type flip was enough to trigger an implicit
  // submit before the user clicked anything.)
  const submitOnboarding = async () => {
    setError(null);
    setLoading(true);

    try {
      let userId = '';

      if (isAdminMode) {
        // --- 1. Admin Onboards Coach ---
        const payload = {
          email,
          password,
          firstName,
          lastName,
          phone: phone ? `+91${phone}` : null,
          avatarUrl: null,
          primarySubcategoryId: categorySelection.primarySubcategoryId,
          subcategoryIds: categorySelection.subcategoryIds,
          tagIds: categorySelection.tagIds,
          ageGroups: categorySelection.ageGroups,
          skillLevels: categorySelection.skillLevels,
          serviceAreaIds: serviceAreaSelection.areaIds,
          serviceCommunityIds: serviceAreaSelection.communities.map(c => c.id),
          experienceYears: Number(experienceYears),
          serviceTypes,
          classTypes,
          languagesKnown,
          qualification: qualification || null,
          certificationsSummary: certificationsSummary || null,
          joiningDate,
          bio: bio || null,
          country,
          state: stateName || null,
          city: cityName || null,
          area: areaName || null,
          address: addressLine || null,
          specialization: specialization || null,
          salaryType,
          fixedSalary: Number(fixedSalary),
          perClassRate: Number(perClassRate),
          revenueSharePct: Number(revenueSharePct),
          bankName: bankName || null,
          bankAccountNumber: bankAccountNumber || null,
          bankIfscCode: bankIfscCode || null,
          upiId: upiId || null,
          panNumber: panNumber || null,
          tenantId
        };

        const res = await fetch('/api/v1/coaches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error ?? result.message ?? 'Failed to onboard coach.');
        }
        userId = result.data?.userId || result.userId;
      } else {
        // --- 2. Public Self-Registration ---
        const res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'coach',
            tenantId,
            email,
            password,
            firstName,
            lastName,
            phone: phone ? `+91${phone}` : null,
            primarySubcategoryId: categorySelection.primarySubcategoryId,
            subcategoryIds: categorySelection.subcategoryIds,
            tagIds: categorySelection.tagIds,
            ageGroups: categorySelection.ageGroups,
            skillLevels: categorySelection.skillLevels,
            serviceAreaIds: serviceAreaSelection.areaIds,
            serviceCommunityIds: serviceAreaSelection.communities.map(c => c.id),
            experienceYears: Number(experienceYears),
            serviceTypes,
            classTypes,
            languagesKnown,
            qualification,
            certificationsSummary,
            joiningDate: new Date().toISOString().split('T')[0],
            bio,
            country,
            state: stateName,
            city: cityName,
            area: areaName,
            address: addressLine,
            specialization,
            gender,
            dateOfBirth: dob || null,
            bankAccountNumber: bankAccountNumber || null,
            bankIfscCode: bankIfscCode || null,
            bankName: bankName || null,
            upiId: upiId || null,
            panNumber: panNumber || null,
          }),
        });

        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error ?? result.message ?? 'Failed to register coach account.');
        }
        userId = result.data?.userId || result.userId;

        // Auto client login
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (loginError) {
          throw new Error('Onboarding succeeded, but auto-login failed. Please sign in manually.');
        }

        // Record session
        fetch('/api/v1/auth/session', { method: 'POST' }).catch(() => {});
      }

      // --- 3. Upload Profile Photo ---
      if (avatarFile && userId) {
        const ext = avatarFile.name.split('.').pop() || 'png';
        const path = `avatars/coach_${userId}_${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true });
        if (!uploadErr && uploadData) {
          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
          const avatarUrl = urlData.publicUrl;
          await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', userId);
        }
      }

      // --- 4. Upload Documents ---
      const docEntries = Object.entries(docFiles).filter(([, file]) => file !== null) as [string, File][];
      for (const [docName, file] of docEntries) {
        try {
          const ext = file.name.split('.').pop() || 'pdf';
          const path = `doc_${userId}_${docName.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('coach-certificates')
            .upload(path, file, { upsert: true, contentType: file.type });
          
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('coach-certificates').getPublicUrl(path);
            const publicUrl = urlData.publicUrl;
            
            let mappedType = 'Other';
            if (docName === 'Aadhaar Card' || docName === 'PAN Card') mappedType = 'Government ID';
            else if (docName === 'Qualification Certificate' || docName === 'NIS Certification') mappedType = 'Certification';
            else if (docName === 'Experience Certificate') mappedType = 'Resume';

            await supabase.from('coach_documents').insert({
              coach_id: userId,
              tenant_id: tenantId,
              document_type: mappedType,
              document_name: docName,
              file_url: publicUrl,
              verification_status: 'Pending',
            });
          }
        } catch (docErr) {
          console.error(`Doc upload failed (${docName}):`, docErr);
        }
      }

      // --- 5. Auto-Status Upgrades ---
      const hasAadhaar = docFiles['Aadhaar Card'] !== null;
      const hasPan = docFiles['PAN Card'] !== null;
      const hasQual = docFiles['Qualification Certificate'] !== null;
      const hasAllMandatory = hasAadhaar && hasPan && hasQual;

      const finalStatus = hasAllMandatory ? 'Pending Verification' : 'Document Upload Pending';
      await supabase.from('coaches').update({ account_status: finalStatus }).eq('id', userId);

      onSuccess(userId);
    } catch (err: any) {
      setError(err.message ?? 'An unexpected error occurred during onboarding.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`w-full flex flex-col md:flex-row overflow-hidden rounded-3xl ${
      isDark ? 'border border-white/10 bg-[#060814]/95 text-white' : 'border border-slate-200 bg-white text-slate-800'
    }`}>
      
      {/* Sidebar checklist */}
      <div className={`w-full md:w-[260px] p-6 flex flex-col justify-between shrink-0 ${
        isDark ? 'bg-white/[0.02] border-b md:border-b-0 md:border-r border-white/10' : 'bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200'
      }`}>
        <div>
          <div className="flex items-center gap-2 mb-6">
            <Award className={`w-5 h-5 ${isDark ? 'text-indigo-400' : 'text-indigo-650'}`} />
            <h3 className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Coach Onboarding</h3>
          </div>

          <div className="space-y-3">
            {STEPS_LIST.map((s) => {
              const isActive = step === s.id;
              const isCompleted = step > s.id;
              const isClickable = s.id <= maxStepReached;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => navigateToStep(s.id)}
                  className={`w-full text-left flex items-start gap-3 p-2 rounded-xl transition-all duration-200 border ${
                    isActive 
                      ? (isDark ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100/50') 
                      : 'border-transparent'
                  } ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold transition-all ${
                    isCompleted 
                      ? (isDark ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-100 text-emerald-600 border border-emerald-200') 
                      : isActive 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' 
                      : (isDark ? 'bg-white/5 text-slate-500 border border-white/5' : 'bg-slate-200 text-slate-500 border border-slate-300')
                  }`}>
                    {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : s.id}
                  </div>
                  <div>
                    <h4 className={`text-xs font-semibold leading-tight ${
                      isActive ? (isDark ? 'text-indigo-300 font-bold' : 'text-indigo-900 font-bold') : isCompleted ? (isDark ? 'text-slate-300' : 'text-slate-800') : (isDark ? 'text-slate-500' : 'text-slate-400')
                    }`}>
                      {s.name}
                    </h4>
                    <p className={`text-[9px] mt-0.5 ${
                      isActive ? (isDark ? 'text-indigo-400' : 'text-indigo-650') : isCompleted ? (isDark ? 'text-slate-400' : 'text-gray-600') : (isDark ? 'text-slate-600' : 'text-gray-400')
                    }`}>
                      {s.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className={`p-3 rounded-xl flex items-start gap-2.5 border ${
            isDark ? 'bg-indigo-950/20 border-indigo-500/10 text-indigo-300' : 'bg-indigo-50/50 border-indigo-100/50 text-indigo-800'
          }`}>
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-[10px] leading-relaxed">
              Fill all mandatory fields. Submit documents to verification pipeline.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className={`w-full py-2 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer ${
              isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5' : 'bg-slate-100 hover:bg-slate-200 text-slate-850 border-slate-200'
            }`}
          >
            Cancel Onboarding
          </button>
        </div>
      </div>

      {/* Main form panel */}
      <div className="flex-1 flex flex-col min-w-0">
        
        <div className={`px-6 pt-6 pb-2 border-b ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Step {step} of 5</h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{STEPS_LIST[step - 1].name}</p>
            </div>
            {(isAdminMode || testMode) && (
              <button
                type="button"
                onClick={fillRandomData}
                className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
              >
                <span>⚡ Auto-fill Test Data</span>
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className={`mx-6 mt-4 p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
            isDark ? 'border-red-500/20 bg-red-500/5 text-red-400' : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Not wired to a real submission flow — submitOnboarding runs only from
            the Step 5 button's explicit onClick. onSubmit is just a safety net
            against any stray native form submission (e.g. Enter key). */}
        <form onSubmit={(e) => e.preventDefault()} className="p-6 flex-1 flex flex-col justify-between space-y-6 min-h-[480px]">
          
          {/* STEP 1: Personal Information */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {isAdminMode ? "Coach's Basic Information" : "Let's start with your basic info"}
                </h3>
                <span className="text-[10px] font-semibold text-red-500">* Required fields</span>
              </div>

              <div className="flex items-center gap-4">
                <div className={`w-20 h-20 rounded-full overflow-hidden border flex items-center justify-center shrink-0 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-slate-100 border-slate-200'
                }`}>
                  {avatarPreview ? (
                    <img src={avatarPreview} className="w-full h-full object-cover" alt="Avatar preview" />
                  ) : (
                    <User className="w-10 h-10 text-slate-400" />
                  )}
                </div>
                <div className="space-y-1">
                  <label className={`inline-flex items-center px-3 py-1.5 border rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm ${
                    isDark ? 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-300' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-850'
                  }`}>
                    <Camera className="w-3.5 h-3.5 mr-1.5" />
                    Upload Photo
                    <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                  </label>
                  <p className="text-[10px] text-slate-400">JPG, PNG up to 2MB</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">First Name <span className="text-red-500 ml-1">*</span></label>
                  <input
                    required
                    type="text"
                    placeholder="Rahul"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={`rounded-xl px-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border ${
                      isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Last Name <span className="text-red-500 ml-1">*</span></label>
                  <input
                    required
                    type="text"
                    placeholder="Sharma"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={`rounded-xl px-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border ${
                      isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Email Address <span className="text-red-500 ml-1">*</span></label>
                  <div className="relative">
                    <input
                      required
                      type="email"
                      placeholder="rahul@academy.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      className={`rounded-xl px-3 py-2 pr-8 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border ${
                        isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                      } ${emailTouched && !isEmailValid ? 'border-red-400 bg-red-50/10' : ''}`}
                    />
                    {email && isEmailValid && (
                      <Check className="absolute right-3 top-2.5 w-3.5 h-3.5 text-emerald-500 stroke-[3]" />
                    )}
                    {emailTouched && !isEmailValid && email && (
                      <AlertCircle className="absolute right-3 top-2.5 w-3.5 h-3.5 text-red-400" />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Phone Number <span className="text-red-500 ml-1">*</span></label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 flex items-center gap-0.5 text-xs text-slate-400 font-semibold">
                      <span>🇮🇳</span><span className="ml-0.5">+91</span>
                    </span>
                    <input
                      required
                      type="tel"
                      maxLength={10}
                      placeholder="9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      className={`rounded-xl pl-16 pr-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border ${
                        isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                      }`}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Gender <span className="text-red-500 ml-1">*</span></label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className={`rounded-xl px-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border ${
                      isDark ? 'glass-input border-white/10 bg-[#060814] text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                    }`}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Date of Birth <span className="text-red-500 ml-1">*</span></label>
                  <input
                    required
                    type="date"
                    value={dob}
                    max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                    onChange={(e) => setDob(e.target.value)}
                    className={`rounded-xl px-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border ${
                      isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                    }`}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Must be at least 18 years old</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium">Languages Known</label>
                <div className={`flex flex-wrap gap-1.5 p-2 border rounded-xl min-h-[44px] items-center ${
                  isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50/50'
                }`}>
                  {languagesKnown.map(lang => (
                    <span key={lang} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                      {lang}
                      <button type="button" onClick={() => removeLanguage(lang)} className="hover:text-indigo-650"><X className="w-2.5 h-2.5" /></button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={langInput}
                    onChange={(e) => setLangInput(e.target.value)}
                    onKeyDown={addLanguage}
                    placeholder="Type + Enter to add"
                    className="flex-1 min-w-[120px] bg-transparent outline-none border-none text-xs px-1 text-slate-600 dark:text-slate-300"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {LANGUAGES_ONBOARD.filter(l => !languagesKnown.includes(l)).map(l => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLanguagesKnown(prev => [...prev, l])}
                      className={`px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors ${
                        isDark ? 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      + {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`border-t pt-4 mt-2 space-y-3 ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
                <h4 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Address & Location Details</h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Country <span className="text-red-500 ml-1">*</span></label>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className={`rounded-xl px-3 py-2 text-xs w-full outline-none border ${
                        isDark ? 'glass-input border-white/10 bg-[#060814] text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                      }`}
                    >
                      <option value="India">India</option>
                      <option value="USA">United States</option>
                      <option value="UK">United Kingdom</option>
                      <option value="Canada">Canada</option>
                      <option value="Australia">Australia</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">State <span className="text-red-500 ml-1">*</span></label>
                    <input
                      required
                      type="text"
                      placeholder="Karnataka"
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      className={`rounded-xl px-3 py-2 text-xs w-full outline-none border ${
                        isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">City <span className="text-red-500 ml-1">*</span></label>
                    <input
                      required
                      type="text"
                      placeholder="Bangalore"
                      value={cityName}
                      onChange={(e) => setCityName(e.target.value)}
                      className={`rounded-xl px-3 py-2 text-xs w-full outline-none border ${
                        isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Area / Locality <span className={`font-normal text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      (Optional{cityName.trim() ? ` — restricted to ${cityName.trim()}` : ''})
                    </span>
                  </label>
                  <LocalityAutocompleteInput
                    value={areaName}
                    onChange={setAreaName}
                    city={cityName}
                    placeholder="Indiranagar"
                    theme={theme}
                  />
                </div>

                <div className={`grid grid-cols-1 gap-3 ${isAdminMode ? 'md:grid-cols-2' : ''}`}>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium">
                        Full Address <span className={`font-normal text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>(Optional)</span>
                      </label>
                      <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{addressLine.length}/200</span>
                    </div>
                    <textarea
                      rows={2}
                      maxLength={200}
                      placeholder="123, 5th Main Road, Indiranagar"
                      value={addressLine}
                      onChange={(e) => setAddressLine(e.target.value)}
                      className={`rounded-xl px-3 py-2 text-xs w-full outline-none border resize-none ${
                        isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                      }`}
                    />
                  </div>
                  {isAdminMode && (
                    <div>
                      <label className="block text-xs font-medium mb-1">Joining Date</label>
                      <input
                        type="date"
                        value={joiningDate}
                        onChange={(e) => setJoiningDate(e.target.value)}
                        className={`rounded-xl px-3 py-2 text-xs w-full outline-none border ${
                          isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                        }`}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Professional Profile */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Professional Profile</h3>
                <span className="text-[10px] font-semibold text-red-500">* Required fields</span>
              </div>
              <div className={`p-4 border rounded-2xl ${isDark ? 'border-white/5 bg-white/[0.01]' : 'border-slate-100 bg-slate-50/20'}`}>
                <CategoryPicker
                  categories={categories}
                  value={categorySelection}
                  onChange={setCategorySelection}
                  theme={theme}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Experience (in years) <span className="text-red-500 ml-1">*</span></label>
                  <input
                    required
                    type="number"
                    min={0}
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                    className={`rounded-xl px-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border ${
                      isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Qualification <span className="text-red-500 ml-1">*</span></label>
                  <input
                    required
                    type="text"
                    placeholder="B.P.Ed, NIS Certified"
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    className={`rounded-xl px-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border ${
                      isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Specialization Notes <span className={`font-normal text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Singles, Advanced Techniques, Exam-focused prep"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  className={`rounded-xl px-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border ${
                    isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5">Service Types <span className={`font-normal text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>(Select all that apply)</span></label>
                  <div className="flex flex-wrap gap-1.5">
                    {SERVICE_TYPES_ONBOARD.map(svc => {
                      const isSelected = serviceTypes.includes(svc.value);
                      return (
                        <button
                          key={svc.value}
                          type="button"
                          onClick={() => setServiceTypes(prev => isSelected ? prev.filter(s => s !== svc.value) : [...prev, svc.value])}
                          className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-all flex items-center gap-1 ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                              : (isDark ? 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200')
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          {svc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5">Class Types <span className={`font-normal text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>(Select all that apply)</span></label>
                  <div className="flex flex-wrap gap-1.5">
                    {CLASS_TYPES_ONBOARD.map(cls => {
                      const isSelected = classTypes.includes(cls.value);
                      return (
                        <button
                          key={cls.value}
                          type="button"
                          onClick={() => setClassTypes(prev => isSelected ? prev.filter(c => c !== cls.value) : [...prev, cls.value])}
                          className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-all flex items-center gap-1 ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                              : (isDark ? 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200')
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          {cls.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Service Area / Community */}
              <div className={`p-4 border rounded-2xl ${isDark ? 'border-white/5 bg-white/[0.01]' : 'border-slate-100 bg-slate-50/20'}`}>
                <ServiceAreaPicker
                  areas={serviceAreas}
                  value={serviceAreaSelection}
                  onChange={setServiceAreaSelection}
                  theme={theme}
                />
              </div>

              {/* Salary & Payroll (Admin Configure Only) */}
              {isAdminMode && (
                <div className={`p-4 border rounded-2xl space-y-3 ${isDark ? 'border-white/5 bg-white/[0.01]' : 'border-slate-100 bg-slate-50/20'}`}>
                  <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1">
                    <IndianRupee className="w-3.5 h-3.5" /> Salary & Payroll Settings
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[9px] text-slate-500 mb-1">Payroll Type</label>
                      <select
                        value={salaryType}
                        onChange={(e) => setSalaryType(e.target.value)}
                        className={`rounded-xl px-2 py-1 text-xs w-full outline-none border ${
                          isDark ? 'glass-input border-white/10 bg-[#060814] text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                        }`}
                      >
                        <option value="Fixed Monthly">Fixed Monthly</option>
                        <option value="Per Class">Per Class Session</option>
                        <option value="Revenue Share">Revenue Share %</option>
                        <option value="Hybrid">Hybrid Combo Matrix</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-500 mb-1">Monthly Base (₹)</label>
                      <input
                        type="number"
                        value={fixedSalary}
                        onChange={(e) => setFixedSalary(e.target.value)}
                        className={`rounded-xl px-2 py-1 text-xs w-full outline-none border ${
                          isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-500 mb-1">Per Session (₹)</label>
                      <input
                        type="number"
                        value={perClassRate}
                        onChange={(e) => setPerClassRate(e.target.value)}
                        className={`rounded-xl px-2 py-1 text-xs w-full outline-none border ${
                          isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium">Professional Bio <span className="text-red-500 ml-1">*</span></label>
                  <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{bio.length}/500</span>
                </div>
                <textarea
                  rows={2}
                  maxLength={500}
                  placeholder="Provide a detailed professional bio highlighting your teaching methodology..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className={`rounded-xl px-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border resize-none ${
                    isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                  }`}
                />
              </div>
            </div>
          )}

          {/* STEP 3: Verification Documents Uploads */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>Academy Verification Files</h3>
                <p className="text-slate-400 text-[10px] mt-0.5">Please upload scans or PDF documentation to bypass manual pre-activation flags.</p>
              </div>

              <div className="space-y-3">
                {DOCUMENT_TYPES.map(doc => {
                  const file = docFiles[doc.key];
                  return (
                    <div key={doc.key} className={`border rounded-2xl p-4 flex items-center justify-between gap-4 ${
                      isDark ? 'border-white/10 bg-white/[0.01] hover:border-indigo-500/30' : 'border-slate-200 bg-white hover:border-indigo-200'
                    }`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <FileText className={`w-4 h-4 ${isDark ? 'text-indigo-400' : 'text-indigo-500'}`} />
                          <span className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            {doc.label}
                            {doc.required && <span className="text-red-500 ml-1">*</span>}
                            {!doc.required && <span className="ml-1.5 text-[10px] text-slate-400 font-normal">(Optional)</span>}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 ml-5.5">{doc.hint}</p>
                        {file && (
                          <p className="text-[10px] text-emerald-500 font-semibold mt-1 ml-5.5 flex items-center gap-1">
                            <Check className="w-3 h-3" /> {file.name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {file && (
                          <button
                            type="button"
                            onClick={() => setDocFiles(prev => ({ ...prev, [doc.key]: null }))}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDark ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10' : 'text-red-400 hover:text-red-650 hover:bg-red-50'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition-all ${
                          file 
                            ? (isDark ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100')
                            : (isDark ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20' : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100')
                        }`}>
                          <Upload className="w-3.5 h-3.5" />
                          {file ? 'Replace' : 'Upload'}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) setDocFiles(prev => ({ ...prev, [doc.key]: f }));
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: Account Security */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Secure Your Account</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Create a strong password to protect the coach's account.</p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Password <span className="text-red-500 ml-1">*</span></label>
                <div className="relative">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`rounded-xl px-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border font-mono ${
                      isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-[10px] text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center ${hasLength ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-200 text-slate-400'}`}>
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                    <span className={hasLength ? 'text-emerald-600' : ''}>At least 8 characters</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center ${hasUppercase ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-200 text-slate-400'}`}>
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                    <span className={hasUppercase ? 'text-emerald-600' : ''}>One uppercase letter</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center ${hasNumber ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-200 text-slate-400'}`}>
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                    <span className={hasNumber ? 'text-emerald-600' : ''}>One number</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center ${hasSpecial ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-200 text-slate-400'}`}>
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                    <span className={hasSpecial ? 'text-emerald-600' : ''}>One special character</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Review & Submit */}
          {step === 5 && (
            <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
              <div>
                <h3 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Review Your Information</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Please review all details before submitting.</p>
              </div>

              {/* Personal Info Card */}
              <div className={`p-4 border rounded-xl relative ${isDark ? 'border-white/5 bg-white/[0.01]' : 'border-slate-200 bg-slate-50/50'}`}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="absolute top-4 right-4 text-indigo-500 hover:text-indigo-700 text-xs font-bold transition-colors"
                >
                  Edit
                </button>
                <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-3">Personal Information</h4>
                <div className="flex items-start gap-3">
                  {avatarPreview && (
                    <div className="w-12 h-12 rounded-full overflow-hidden border shrink-0">
                      <img src={avatarPreview} className="w-full h-full object-cover" alt="Avatar" />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-y-2 text-xs flex-1">
                    <div>
                      <span className="text-slate-500 block text-[9px]">Full Name</span>
                      <span className="font-semibold">{firstName} {lastName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">Email Address</span>
                      <span className="font-semibold">{email}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">Mobile Phone</span>
                      <span className="font-semibold">+91 {phone}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">Gender / DOB</span>
                      <span className="font-semibold">{gender} / {dob}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500 block text-[9px]">Location</span>
                      <span className="font-semibold">{areaName ? `${areaName}, ` : ''}{cityName}, {stateName}, {country}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Professional Credentials Card */}
              <div className={`p-4 border rounded-xl relative ${isDark ? 'border-white/5 bg-white/[0.01]' : 'border-slate-200 bg-slate-50/50'}`}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="absolute top-4 right-4 text-indigo-500 hover:text-indigo-700 text-xs font-bold transition-colors"
                >
                  Edit
                </button>
                <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-3">Professional Credentials</h4>
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-[9px]">Category &amp; Specialties</span>
                    <span className="font-semibold">
                      {categories.find(c => c.id === categorySelection.categoryId)?.name ?? '—'}
                      {' · '}
                      {(categories.find(c => c.id === categorySelection.categoryId)?.subcategories ?? [])
                        .filter(s => categorySelection.subcategoryIds.includes(s.id))
                        .map(s => s.id === categorySelection.primarySubcategoryId ? `${s.name} (Primary)` : s.name)
                        .join(', ') || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Experience / Qualification</span>
                    <span className="font-semibold">{experienceYears} Yrs · {qualification}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Languages</span>
                    <span className="font-semibold">{languagesKnown.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Service / Class Types</span>
                    <span className="font-semibold">{serviceTypes.join(', ')} · {classTypes.join(', ')}</span>
                  </div>
                  {serviceAreaSelection.areaIds.length > 0 && (
                    <div className="col-span-2">
                      <span className="text-slate-500 block text-[9px]">Service Areas</span>
                      <span className="font-semibold">
                        {serviceAreas.filter(a => serviceAreaSelection.areaIds.includes(a.id)).map(a => a.name).join(', ')}
                        {serviceAreaSelection.communities.length > 0 && (
                          <> &middot; {serviceAreaSelection.communities.map(c => c.name).join(', ')}</>
                        )}
                      </span>
                    </div>
                  )}
                  {bio && (
                    <div className="col-span-2">
                      <span className="text-slate-500 block text-[9px]">Bio</span>
                      <span className="font-semibold text-[10px] leading-relaxed">{bio.length > 120 ? bio.slice(0, 120) + '…' : bio}</span>
                    </div>
                  )}
                  {isAdminMode && (
                    <div className="col-span-2">
                      <span className="text-slate-500 block text-[9px]">Payroll Rate</span>
                      <span className="font-semibold">{salaryType} · Base ₹{fixedSalary} · Session ₹{perClassRate}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Info banner */}
              <div className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                isDark ? 'border-indigo-500/10 bg-indigo-950/20 text-indigo-300' : 'border-indigo-100 bg-indigo-50 text-indigo-800'
              }`}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {isAdminMode
                    ? 'Once submitted, the coach profile will be created and the coach can log in with the provided credentials.'
                    : 'Once submitted, your profile will be reviewed by the academy admin. You will be notified once your account is activated.'
                  }
                </span>
              </div>
            </div>
          )}

          {/* Stepper horizontal progress dots & buttons */}
          <div className={`flex items-center justify-between border-t pt-4 mt-4 shrink-0 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className={`inline-flex items-center px-4 py-2 border rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isDark ? 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-300' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-850'
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </button>
            ) : (
              <div />
            )}

            {step < 5 ? (
              <button
                key="continue-btn"
                type="button"
                onClick={() => navigateToStep(step + 1)}
                disabled={
                  (step === 1 && !isStep1Valid) ||
                  (step === 2 && !isStep2Valid) ||
                  (step === 3 && !isStep3Valid) ||
                  (step === 4 && !isStep4Valid)
                }
                className="inline-flex items-center px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm shadow-indigo-600/10"
              >
                Continue <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </button>
            ) : (
              <button
                key="submit-btn"
                type="button"
                onClick={submitOnboarding}
                disabled={loading}
                className="inline-flex items-center px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                {loading ? (
                  <CheckCircle2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <Check className="w-3.5 h-3.5 mr-1 font-bold" />
                )}
                {isAdminMode ? 'Onboard Coach Profile' : 'Complete Onboarding'}
              </button>
            )}
          </div>

        </form>

      </div>

    </div>
  );
}
