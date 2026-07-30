'use client';

// Shared building blocks for self-service "My Profile" pages — deliberately
// role-agnostic (no "coach" anywhere in here) so the same header/card/field
// shell can be reused when a student or admin profile page needs the same
// view/edit layout later, per PageHeader's precedent of one component
// adopted everywhere instead of each page reinventing its own card chrome.

import type { LucideIcon } from 'lucide-react';
import { Camera, Loader2, User } from 'lucide-react';
import type { ReactNode } from 'react';

export function fieldClass(extra = '') {
  return `w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:text-slate-500 ${extra}`;
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-slate-500">{children}</label>;
}

export function InfoCard({
  icon: Icon,
  title,
  action,
  children,
  className = '',
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// A view-mode "label: value" row — the read display for a field that becomes
// an <input>/<select> in edit mode. `value` accepts any node so chip lists
// (service types, languages) render the same way plain text does.
export function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/5 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-sm text-slate-200 sm:text-right">{value || <span className="text-slate-600">—</span>}</span>
    </div>
  );
}

export interface StatItem {
  icon: LucideIcon;
  label: string;
  value: string;
}

// Identity header — avatar, name, role/status badges, a short quote/tagline,
// and a row of read-only stat chips (joined date, experience, etc.). Avatar
// upload and the quote field are the only parts that go editable in-place;
// every other identity field (name, DOB, phone…) is edited via the Personal
// Information card below so there's one source of truth per field, not two.
export function ProfileHeaderCard({
  avatarPath,
  avatarUploading,
  onAvatarFile,
  name,
  roleLabel,
  statusLabel,
  stats,
  quote,
  quotePlaceholder,
  editing,
  onQuoteChange,
}: {
  avatarPath: string | null;
  avatarUploading?: boolean;
  onAvatarFile?: (file: File) => void;
  name: string;
  roleLabel: string;
  statusLabel?: string | null;
  stats: StatItem[];
  quote?: string;
  quotePlaceholder?: string;
  editing: boolean;
  onQuoteChange?: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="relative shrink-0">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
            {avatarUploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            ) : avatarPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPath} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
            ) : (
              <User className="h-8 w-8 text-slate-500" />
            )}
          </div>
          {editing && onAvatarFile && (
            <label className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-indigo-600 text-white hover:bg-indigo-500">
              <Camera className="h-3.5 w-3.5" />
              <input
                type="file"
                accept="image/*"
                disabled={avatarUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) onAvatarFile(file);
                }}
                className="hidden"
              />
            </label>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-white">{name || 'Unnamed'}</h1>
            {statusLabel && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">{statusLabel}</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-400">{roleLabel}</p>
        </div>

        <div className="w-full shrink-0 sm:w-64">
          {editing && onQuoteChange ? (
            <textarea
              rows={2}
              value={quote ?? ''}
              onChange={(e) => onQuoteChange(e.target.value)}
              placeholder={quotePlaceholder ?? 'A short line about you…'}
              className={fieldClass('resize-none italic')}
            />
          ) : quote ? (
            <p className="rounded-lg border-l-2 border-indigo-500/50 bg-white/[0.02] px-3 py-2 text-sm italic text-slate-400">&ldquo;{quote}&rdquo;</p>
          ) : null}
        </div>
      </div>

      {stats.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {stats.map((s) => (
            <div key={s.label} className="flex min-w-[130px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
              <s.icon className="h-4 w-4 shrink-0 text-slate-500" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
                <p className="truncate text-xs font-medium text-slate-200">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={{ minHeight: 0 }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-indigo-600' : 'bg-white/10'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  );
}
