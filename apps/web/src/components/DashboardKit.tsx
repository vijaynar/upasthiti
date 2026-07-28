'use client';

// Shared building blocks for the role dashboards (/dashboard owner+coach,
// /platform/dashboard super admin). Theme-aware throughout — colors come from
// the CSS variables in globals.css (var(--foreground), var(--primary),
// var(--success)…) so both light and dark presets render correctly, matching
// the rest of the V2 surfaces.

import Link from 'next/link';
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
  action,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>
          {title}
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
          {subtitle}
        </p>
      </div>
      {action ? (
        action
      ) : badge ? (
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest"
          style={{ color: 'var(--primary)', backgroundColor: 'var(--overlay-sm)', border: '1px solid var(--panel-border)' }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  hint,
  href,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  href?: string;
}) {
  const t = TONE_VAR[tone];
  const inner = (
    <div className="glass-panel glass-panel-hover flex h-full flex-col justify-between rounded-2xl border p-5 transition-all duration-200" style={{ borderColor: 'var(--panel-border)' }}>
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--foreground-subtle)' }}>
          {label}
        </span>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ color: t.color, backgroundColor: t.glow, boxShadow: `0 0 14px ${t.glow}` }}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      <div className="mt-4">
        <div className="text-3xl font-black leading-none" style={{ color: 'var(--foreground)' }}>
          {value}
        </div>
        {hint && (
          <p className="mt-1.5 text-xs" style={{ color: 'var(--foreground-muted)' }}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <div className="glass-panel rounded-2xl border p-5" style={{ borderColor: 'var(--panel-border)' }}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--foreground-muted)' }}>
          {title}
        </h3>
        {action && (
          <Link href={action.href} className="text-xs font-bold hover:underline" style={{ color: 'var(--primary)' }}>
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
