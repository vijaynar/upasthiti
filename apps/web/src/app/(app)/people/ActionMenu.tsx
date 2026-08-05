'use client';

// Reusable row-level "⋮" action menu (Students page roster table / New
// Requests list) — a small popover of icon+label actions, mirroring the
// kebab-menu pattern used for row actions elsewhere in the product (status +
// profile management), with items mapped to what's actually actionable here
// rather than copied verbatim from that reference.

import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  icon: typeof MoreVertical;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'success';
  disabled?: boolean;
}

export function ActionMenu({ items }: { items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const toneClass: Record<NonNullable<ActionMenuItem['tone']>, string> = {
    default: 'text-slate-300',
    danger: 'text-red-400',
    success: 'text-emerald-400',
  };

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border py-1.5 shadow-2xl"
          style={{ backgroundColor: 'var(--background)', borderColor: 'var(--panel-border)' }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 ${toneClass[item.tone ?? 'default']}`}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
