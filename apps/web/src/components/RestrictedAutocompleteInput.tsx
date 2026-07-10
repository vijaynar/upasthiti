'use client';

import { useEffect, useRef, useState } from 'react';

interface RestrictedAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  theme?: 'light' | 'dark';
  // strict=true (State): only a value that exactly matches an option
  // (case-insensitive) is accepted — anything else reverts on blur.
  // strict=false (City): options are shown as suggestions only; free text
  // is still accepted since a "common cities" list can't be exhaustive.
  strict?: boolean;
}

export function RestrictedAutocompleteInput({
  value, onChange, options, placeholder, theme = 'light', strict = true,
}: RestrictedAutocompleteInputProps) {
  const isDark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const lastValidRef = useRef(value);

  useEffect(() => {
    if (!strict || !value || options.some(o => o.toLowerCase() === value.toLowerCase())) {
      lastValidRef.current = value;
    }
  }, [value, options, strict]);

  const term = value.trim().toLowerCase();
  const suggestions = (term ? options.filter(o => o.toLowerCase().includes(term)) : options).slice(0, 8);

  const select = (option: string) => {
    onChange(option);
    lastValidRef.current = option;
    setOpen(false);
  };

  const handleBlur = () => {
    // Delayed so a suggestion's onMouseDown fires first.
    setTimeout(() => {
      if (strict) {
        const exact = options.find(o => o.toLowerCase() === value.trim().toLowerCase());
        if (exact) {
          if (exact !== value) onChange(exact);
          lastValidRef.current = exact;
        } else {
          onChange(lastValidRef.current);
        }
      }
      setOpen(false);
    }, 150);
  };

  const inputClass = `rounded-xl px-3 py-2 text-xs w-full outline-none border ${
    isDark ? 'glass-input border-white/10 bg-[#060814]/40 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
  }`;

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClass}
      />
      {open && suggestions.length > 0 && (
        <div className={`absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border shadow-lg ${
          isDark ? 'bg-[#0b0e1c] border-white/10' : 'bg-white border-slate-200'
        }`}>
          {suggestions.map(o => (
            <button
              key={o}
              type="button"
              onMouseDown={() => select(o)}
              className={`w-full text-left px-3 py-2 text-[11px] transition-colors ${
                isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
