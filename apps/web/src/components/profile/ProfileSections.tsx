'use client';

// Shared building blocks for self-service "My Profile" pages — deliberately
// role-agnostic (no "coach" anywhere in here) so the same header/card/field
// shell can be reused when a student or admin profile page needs the same
// view/edit layout later, per PageHeader's precedent of one component
// adopted everywhere instead of each page reinventing its own card chrome.

import type { LucideIcon } from 'lucide-react';
import { Camera, Loader2, Star, User } from 'lucide-react';
import type { ReactNode } from 'react';

export function fieldClass(extra = '') {
  return `glass-input w-full rounded-xl px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 ${extra}`;
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-slate-500">{children}</label>;
}

// A read-only tag for view-mode field values (service types, languages,
// specialties…) — the translucent indigo badge V1 used, as opposed to the
// solid-fill `Chip` component which is for clickable/editable selections.
export function ReadOnlyTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-400">
      {children}
    </span>
  );
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
    <div className={`glass-panel rounded-2xl p-4 shadow-sm ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-indigo-500" />
          <h2 className="text-base font-bold text-white">{title}</h2>
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
    <div className="flex flex-row items-start gap-2 border-b border-white/5 py-1 last:border-b-0">
      <span className="w-28 shrink-0 text-xs font-normal text-slate-500 sm:w-36">{label}</span>
      <span className="min-w-0 flex-1 break-words text-xs font-medium text-slate-100">{value || <span className="text-slate-600">—</span>}</span>
    </div>
  );
}

export interface StatItem {
  icon: LucideIcon;
  label: string;
  value: string;
  color?: 'indigo' | 'violet' | 'amber' | 'rose';
}

const STAT_COLOR_CLASSES: Record<NonNullable<StatItem['color']>, string> = {
  indigo: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400',
  violet: 'border-violet-500/20 bg-violet-500/10 text-violet-400',
  amber: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  rose: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
};

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
  rating,
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
  rating?: number | null;
  stats: StatItem[];
  quote?: string;
  quotePlaceholder?: string;
  editing: boolean;
  onQuoteChange?: (value: string) => void;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  const avatarContent = avatarUploading ? (
    <div className="flex h-full w-full items-center justify-center bg-white/5">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  ) : avatarPath ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarPath} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
      {initials ? <span className="text-3xl font-bold text-white">{initials}</span> : <User className="h-8 w-8 text-white/70" />}
    </div>
  );

  return (
    <div className="glass-panel rounded-3xl p-4 shadow-sm">
      <div className="flex flex-col items-center gap-4 lg:flex-row lg:gap-5">
        <div className="relative shrink-0">
          {editing && onAvatarFile ? (
            <label className="group relative block h-24 w-24 cursor-pointer overflow-hidden rounded-full border-4 border-white/10 shadow-sm md:h-28 md:w-28">
              {avatarContent}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </div>
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
          ) : (
            <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white/10 shadow-sm md:h-28 md:w-28">{avatarContent}</div>
          )}

          {editing && onAvatarFile && (
            <label className="absolute bottom-0 right-0 cursor-pointer rounded-full border border-white/20 bg-white/10 p-1.5 text-white shadow-md backdrop-blur transition-all hover:bg-white/20">
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

        <div className="min-w-0 flex-1 space-y-2.5 text-center lg:text-left">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
              <h1 className="text-2xl font-bold text-white">{name || 'Unnamed'}</h1>
              {rating != null && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
                  <Star className="h-3.5 w-3.5 fill-amber-400" /> {rating.toFixed(1)}
                </span>
              )}
              {statusLabel && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">{statusLabel}</span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-400">{roleLabel}</p>
          </div>

          {stats.length > 0 && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                  <span className={`flex shrink-0 items-center justify-center rounded-lg border p-1.5 ${STAT_COLOR_CLASSES[s.color ?? 'indigo']}`}>
                    <s.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
                    <p className="truncate text-xs font-medium text-slate-200">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-full shrink-0 border-t border-white/10 pt-3 lg:w-60 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          {editing && onQuoteChange ? (
            <div className="rounded-r-xl border-l-4 border-indigo-500 bg-white/[0.03] py-1.5 pl-4">
              <span className="block h-2 select-none font-serif text-3xl leading-none text-indigo-400">&ldquo;</span>
              <textarea
                rows={3}
                value={quote ?? ''}
                onChange={(e) => onQuoteChange(e.target.value)}
                placeholder={quotePlaceholder ?? 'A short line about you…'}
                className={fieldClass('resize-none border-0 bg-transparent px-2 py-1.5 italic')}
              />
            </div>
          ) : quote ? (
            <div className="rounded-r-xl border-l-4 border-indigo-500 bg-white/[0.03] py-1.5 pl-4">
              <span className="block h-2 select-none font-serif text-3xl leading-none text-indigo-400">&ldquo;</span>
              <p className="max-h-32 overflow-y-auto text-xs italic text-slate-400">{quote}</p>
            </div>
          ) : null}
        </div>
      </div>
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
