'use client';

import { cloneElement, isValidElement, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { X } from 'lucide-react';

export type ChipSize = 'xs' | 'sm' | 'md';

interface ChipProps {
  children: ReactNode;
  size?: ChipSize;
  selected?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  removable?: boolean;
  onRemove?: () => void;
  icon?: ReactNode;
  trailing?: ReactNode;
  theme?: 'light' | 'dark';
  disabled?: boolean;
  className?: string;
}

// Fixed height (not just padding) per size — a chip's outer box must not grow
// when an icon/remove-button is present vs a plain-text sibling, which is
// exactly the inconsistency this component replaces ad-hoc padding for.
const SIZE_STYLES: Record<ChipSize, { box: string; icon: string }> = {
  xs: { box: 'h-4 px-1.5 rounded-lg text-[9px] gap-1', icon: 'w-2.5 h-2.5' },
  sm: { box: 'h-[1.125rem] px-2 rounded-lg text-[10px] gap-1', icon: 'w-3 h-3' },
  md: { box: 'h-6 px-3 rounded-lg text-xs gap-1.5', icon: 'w-3.5 h-3.5' },
};

export function Chip({
  children,
  size = 'sm',
  selected = false,
  clickable = false,
  onClick,
  removable = false,
  onRemove,
  icon,
  trailing,
  theme = 'light',
  disabled = false,
  className = '',
}: ChipProps) {
  const isDark = theme === 'dark';
  const { box, icon: iconSize } = SIZE_STYLES[size];

  const colorClass = selected
    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
    : isDark
      ? 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200';

  // A project-wide `button { min-height: 36px }` touch-target rule
  // (globals.css) otherwise doubles a clickable chip's height. That rule is
  // unlayered plain CSS, and unlayered always beats Tailwind's @layer
  // utilities regardless of specificity — so a `min-h-0` class can't win.
  // An inline style outranks any stylesheet rule short of !important, so
  // it's the one reliable override that stays inside this component.
  const noMinHeight = { minHeight: 0 };
  const sharedClass = `inline-flex items-center leading-none border font-semibold whitespace-nowrap transition-all ${box} ${colorClass} ${
    disabled ? 'opacity-40 cursor-not-allowed' : ''
  } ${className}`;

  // Callers pass a bare icon element (e.g. <Check className="stroke-[3]" />)
  // without knowing which size slot it'll render into, so force it to fill
  // the slot here rather than relying on every call site to size it right.
  const sizedIcon =
    icon && isValidElement(icon)
      ? cloneElement(icon as ReactElement<{ className?: string }>, {
          className: `w-full h-full ${(icon as ReactElement<{ className?: string }>).props.className ?? ''}`,
        })
      : icon;

  const content = (
    <>
      {icon && (
        <span className={`shrink-0 inline-flex items-center justify-center ${iconSize}`}>{sizedIcon}</span>
      )}
      <span className="truncate">{children}</span>
      {trailing}
      {removable && (
        <button
          type="button"
          disabled={disabled}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            onRemove?.();
          }}
          style={noMinHeight}
          className={`shrink-0 inline-flex items-center justify-center ${iconSize} ${selected ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}
          aria-label="Remove"
        >
          <X className="w-full h-full" />
        </button>
      )}
    </>
  );

  if (clickable) {
    return (
      <button type="button" disabled={disabled} onClick={onClick} style={noMinHeight} className={`${sharedClass} cursor-pointer`}>
        {content}
      </button>
    );
  }

  return <span className={sharedClass}>{content}</span>;
}
