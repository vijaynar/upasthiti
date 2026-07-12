'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  icon,
  className = '',
  disabled = false
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const selectedOption = options.find((opt) => opt.value === value);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`w-full pl-10 pr-10 h-9 rounded-xl glass-input text-xs font-semibold text-left flex items-center justify-between cursor-pointer relative select-none disabled:opacity-40 disabled:cursor-not-allowed
        ${open ? 'border-indigo-500 shadow-[0_0_14px_rgba(99,102,241,0.25)]' : ''}`}
      >
        {/* Left Icon (if provided) */}
        {icon && (
          <span className="absolute left-3.5 top-2.5 flex items-center justify-center pointer-events-none">
            {icon}
          </span>
        )}
        
        {/* Label */}
        <span className="truncate text-slate-200">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        
        {/* Arrow */}
        <ChevronDown className={`w-4 h-4 text-slate-400 absolute right-3 transition-transform duration-200 pointer-events-none ${open ? 'rotate-180 text-indigo-400' : ''}`} />
      </button>

      {/* Floating Options Panel */}
      {open && (
        <div 
          className="absolute z-50 w-full mt-1.5 glass-panel rounded-xl max-h-60 overflow-y-auto no-scrollbar shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150"
          style={{ 
            backgroundColor: 'rgba(11, 13, 25, 0.96)',
            border: '1px solid var(--panel-border)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)'
          }}
        >
          <div className="p-1.5 space-y-0.5">
            {options.length === 0 ? (
              <div className="text-[10px] text-slate-500 text-center py-3 italic">
                No options available
              </div>
            ) : (
              options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all duration-150 cursor-pointer select-none
                    ${isSelected 
                      ? 'bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 font-bold' 
                      : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'}`}
                  >
                    <span className="truncate pr-4">{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
