'use client';

// Shared page-top header for V2 console pages — badge pill, title, and
// description, matching the /platform "Roles & Permissions" layout so every
// authenticated page opens with the same shape.

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function PageHeader({
  badge,
  badgeIcon: BadgeIcon,
  title,
  description,
  action,
}: {
  badge?: string;
  badgeIcon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {badge && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-indigo-400">
            {BadgeIcon && <BadgeIcon className="h-3 w-3" />}
            {badge}
          </div>
        )}
        <h1 className="text-2xl font-black text-white">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}
