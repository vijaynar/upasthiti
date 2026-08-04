'use client';

// Shared building blocks for the role dashboards (/dashboard owner+coach,
// /platform/dashboard super admin). Theme-aware throughout — colors come from
// the CSS variables in globals.css (var(--foreground), var(--primary),
// var(--success)…) so both light and dark presets render correctly, matching
// the rest of the V2 surfaces.

import Link from 'next/link';
import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'accent';

const TONE_VAR: Record<Tone, { color: string; glow: string }> = {
  primary: { color: 'var(--primary)', glow: 'var(--primary-glow)' },
  success: { color: 'var(--success)', glow: 'var(--success-glow)' },
  warning: { color: 'var(--warning)', glow: 'var(--warning-glow)' },
  danger: { color: 'var(--danger)', glow: 'var(--danger-glow)' },
  accent: { color: 'var(--accent)', glow: 'var(--accent-glow)' },
};

export function DashboardHeader({
  title,
  subtitle,
  badge,
  icon: Icon,
  action,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {badge && (
          <div
            className="mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest"
            style={{ color: 'var(--primary)', backgroundColor: 'var(--overlay-sm)', border: '1px solid var(--panel-border)' }}
          >
            {Icon && <Icon className="h-3 w-3" />}
            {badge}
          </div>
        )}
        <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>
          {title}
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
          {subtitle}
        </p>
      </div>
      {action}
    </div>
  );
}

// Single source of truth for the KPI tile used on every dashboard (org
// owner/coach/student, platform super-admin, announcements, people,
// performance). Edit here — never re-implement a local StatCard elsewhere.
// Sizing/typography intentionally mirrors the V1 admin dashboard KPI tiles
// (apps/web/src/app/admin/dashboard/page.tsx on main) — small icon chip,
// text-2xl value, [10px] label/hint — rather than a larger, airier layout.
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  hint,
  href,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  hint?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const t = TONE_VAR[tone];
  const gradientId = `stat-card-wave-${useId()}`;
  const inner = (
    <div
      className="glass-panel glass-panel-hover relative flex h-full flex-col justify-between overflow-hidden rounded-[var(--stat-card-radius)] border px-5 pb-5 pt-3 transition-all duration-200"
      style={{ borderColor: 'var(--panel-border)' }}
    >
      <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-full blur-2xl" style={{ backgroundColor: t.glow, opacity: 0.6 }} />
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--foreground)' }}>
          {label}
        </span>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ color: t.color, backgroundColor: t.glow, boxShadow: `0 0 14px ${t.glow}` }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="relative z-10 mt-3">
        <div className="text-2xl font-black leading-none" style={{ color: 'var(--foreground)' }}>
          {value}
        </div>
        {hint && (
          <p className="mt-0.5 text-[10px] font-bold" style={{ color: t.color }}>
            {hint}
          </p>
        )}
      </div>
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[var(--stat-card-wave-height)] w-full opacity-[var(--stat-card-wave-opacity)]"
        viewBox="0 0 100 28"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={t.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,18 C20,8 30,22 50,15 C70,8 80,22 100,15 L100,28 L0,28 Z" fill={`url(#${gradientId})`} />
        <path d="M0,18 C20,8 30,22 50,15 C70,8 80,22 100,15" fill="none" stroke={t.color} strokeWidth="1.2" />
      </svg>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block h-full w-full text-left">
        {inner}
      </button>
    );
  }
  return inner;
}

export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <div className="glass-panel rounded-2xl border p-5" style={{ borderColor: 'var(--panel-border)' }}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-extrabold tracking-tight" style={{ color: 'var(--foreground)' }}>
            {Icon && <Icon className="h-4 w-4" style={{ color: 'var(--primary)' }} />}
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-[10px]" style={{ color: 'var(--foreground-subtle)' }}>
              {subtitle}
            </p>
          )}
        </div>
        {action && (
          <Link href={action.href} className="shrink-0 text-xs font-bold hover:underline" style={{ color: 'var(--primary)' }}>
            {action.label} →
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm" style={{ color: 'var(--foreground-subtle)' }}>
      {children}
    </p>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone: Tone =
    status === 'active' || status === 'succeeded' || status === 'scheduled' || status === 'completed'
      ? 'success'
      : status === 'pending' || status === 'pending_verification' || status === 'open' || status === 'new' || status === 'paused'
        ? 'warning'
        : status === 'rejected' || status === 'cancelled' || status === 'suspended' || status === 'holiday'
          ? 'danger'
          : 'primary';
  const t = TONE_VAR[tone];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: t.color, backgroundColor: t.glow }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// Compact SVG progress ring — attendance %/batch progress % throughout the
// student portal (docsV2/STUDENT_PORTAL_SPEC.md). null renders a dashed
// "not tracked" ring rather than a fabricated 0%, per that spec's own rule.
export function ProgressRing({
  pct,
  label,
  size = 88,
  tone = 'primary',
}: {
  pct: number | null;
  label?: string;
  size?: number;
  tone?: Tone;
}) {
  const stroke = Math.round(size * 0.1);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const t = TONE_VAR[tone];
  const offset = pct === null ? 0 : c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--overlay-sm)" strokeWidth={stroke} />
        {pct !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={t.color}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        )}
        {pct === null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-border)" strokeWidth={stroke} strokeDasharray="2 6" />
        )}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-sm font-black" style={{ color: pct === null ? 'var(--foreground-subtle)' : 'var(--foreground)' }}>
          {pct === null ? '—' : `${pct}%`}
        </span>
        {label && (
          <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--foreground-subtle)' }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export function DashboardLoading() {
  return (
    <div className="p-8">
      <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
        Loading dashboard…
      </p>
    </div>
  );
}

export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export function fmtMoney(minor: number, currency: string): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(major);
  } catch {
    return `${currency} ${major.toFixed(0)}`;
  }
}
