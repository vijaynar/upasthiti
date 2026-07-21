'use client';

// Super Admin dashboard (Doc 04 §9 platform console home). Cross-org roll-up —
// org lifecycle funnel, platform-wide totals, and recent signups. Gated
// server-side by platform.org.lifecycle inside getPlatformDashboard; a
// non-platform user gets a 403 and sees the access-denied state below (same
// pattern as /platform's console).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  ShieldAlert,
  Users,
  LifeBuoy,
  ScrollText,
  CheckCircle2,
  Clock,
  Ban,
  Archive,
} from 'lucide-react';
import { DashboardHeader, StatCard, SectionCard, EmptyRow, StatusPill, DashboardLoading } from '@/components/DashboardKit';

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.code ?? 'error');
  return body.data as T;
}

interface PlatformDashboard {
  orgsByStatus: { pending: number; active: number; suspended: number; rejected: number; archived: number };
  totalOrgs: number;
  pendingVerification: number;
  totalUsers: number;
  activeSupportGrants: number;
  auditEventsToday: number;
  recentSignups: { id: string; name: string; slug: string; orgType: string; status: string; createdAt: string }[];
}

function FunnelBar({ label, count, total, icon: Icon, color }: { label: string; count: number; total: number; icon: typeof Clock; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--foreground)' }}>
          <Icon className="h-4 w-4" style={{ color }} />
          {label}
        </span>
        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--foreground)' }}>
          {count}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--overlay-sm)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function PlatformDashboardPage() {
  const [data, setData] = useState<PlatformDashboard | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    api<PlatformDashboard>('/api/v1/platform/dashboard')
      .then(setData)
      .catch(() => setDenied(true));
  }, []);

  if (denied) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
        <ShieldAlert className="mb-4 h-12 w-12" style={{ color: 'var(--foreground-subtle)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
          Platform access required
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
          This dashboard is only available to Abhyas platform staff.
        </p>
      </div>
    );
  }

  if (!data) return <DashboardLoading />;

  const s = data.orgsByStatus;

  return (
    <div className="p-6 md:p-8">
      <DashboardHeader title="Platform overview" subtitle="Every organization on Abhyas, at a glance." badge="Super Admin" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total organizations" value={data.totalOrgs} icon={Building2} tone="primary" href="/platform?tab=organizations" />
        <StatCard
          label="Awaiting verification"
          value={data.pendingVerification}
          icon={Clock}
          tone={data.pendingVerification > 0 ? 'warning' : 'success'}
          href="/platform?tab=verification"
        />
        <StatCard label="Total users" value={data.totalUsers} icon={Users} tone="accent" />
        <StatCard
          label="Active support grants"
          value={data.activeSupportGrants}
          icon={LifeBuoy}
          tone={data.activeSupportGrants > 0 ? 'warning' : 'primary'}
          href="/platform?tab=support"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Organization lifecycle" action={{ label: 'Organizations', href: '/platform?tab=organizations' }}>
          <div className="space-y-4">
            <FunnelBar label="Pending" count={s.pending} total={data.totalOrgs} icon={Clock} color="var(--warning)" />
            <FunnelBar label="Active" count={s.active} total={data.totalOrgs} icon={CheckCircle2} color="var(--success)" />
            <FunnelBar label="Suspended" count={s.suspended} total={data.totalOrgs} icon={Ban} color="var(--danger)" />
            <FunnelBar label="Rejected" count={s.rejected} total={data.totalOrgs} icon={Ban} color="var(--danger)" />
            <FunnelBar label="Archived" count={s.archived} total={data.totalOrgs} icon={Archive} color="var(--foreground-subtle)" />
          </div>
        </SectionCard>

        <SectionCard title="Recent signups" action={{ label: 'Verification queue', href: '/platform?tab=verification' }}>
          {data.recentSignups.length === 0 ? (
            <EmptyRow>No organizations yet.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {data.recentSignups.map((o) => (
                <li key={o.id} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--overlay-xs)' }}>
                  <div className="overflow-hidden">
                    <span className="block truncate text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      {o.name}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--foreground-subtle)' }}>
                      {o.orgType.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <StatusPill status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <Link
          href="/platform?tab=audit"
          className="glass-panel flex items-center gap-3 rounded-2xl border p-4"
          style={{ borderColor: 'var(--panel-border)' }}
        >
          <ScrollText className="h-5 w-5" style={{ color: 'var(--primary)' }} />
          <span className="text-sm" style={{ color: 'var(--foreground)' }}>
            <strong>{data.auditEventsToday}</strong> audit event{data.auditEventsToday === 1 ? '' : 's'} recorded today
          </span>
          <span className="ml-auto text-xs font-bold" style={{ color: 'var(--primary)' }}>
            View audit trail →
          </span>
        </Link>
      </div>
    </div>
  );
}
