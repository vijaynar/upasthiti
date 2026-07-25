'use client';

import { useTheme, THEMES, ThemeName } from '@/lib/theme';
import { Moon, Sun, X, Check, Palette } from 'lucide-react';

interface ThemeSelectorProps {
  onClose: () => void;
}

export default function ThemeSelector({ onClose }: ThemeSelectorProps) {
  const { theme, mode, setTheme, toggleMode } = useTheme();

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed bottom-24 left-4 z-[70] w-72 glass-panel rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 duration-200 overflow-hidden"
        style={{ border: '1px solid var(--panel-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--panel-border)' }}>
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>
              Appearance
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: 'var(--foreground)', opacity: 0.5 }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Dark / Light toggle */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{ color: 'var(--foreground)', opacity: 0.45 }}>
              Mode
            </p>
            <div className="flex gap-2">
              {(['dark', 'light'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { if (mode !== m) toggleMode(); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer"
                  style={{
                    background: mode === m ? 'var(--primary)' : 'transparent',
                    borderColor: mode === m ? 'var(--primary)' : 'var(--panel-border)',
                    color: mode === m ? '#fff' : 'var(--foreground)',
                    opacity: mode === m ? 1 : 0.55,
                  }}
                >
                  {m === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                  {m === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
          </div>

          {/* Color themes */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{ color: 'var(--foreground)', opacity: 0.45 }}>
              Color Theme
            </p>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => {
                const active = theme === t.name;
                return (
                  <button
                    key={t.name}
                    onClick={() => setTheme(t.name as ThemeName)}
                    className="relative flex flex-col items-start gap-1.5 p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer group overflow-hidden"
                    style={{
                      borderColor: active ? t.vars.primary : 'var(--panel-border)',
                      background: active
                        ? `${t.vars.primaryGlow.replace('0.5', '0.12')}`
                        : 'transparent',
                    }}
                  >
                    {/* Swatch gradient */}
                    <div
                      className="w-full h-5 rounded-lg flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${t.preview[0]} 0%, ${t.preview[1]} 50%, ${t.preview[2]} 100%)`,
                        boxShadow: active ? `0 0 10px ${t.vars.primaryGlow}` : undefined,
                      }}
                    />
                    <div className="flex items-center justify-between w-full">
                      <div>
                        <p className="text-[10px] font-bold leading-none truncate"
                          style={{ color: active ? t.vars.primary : 'var(--foreground)' }}>
                          {t.label}
                        </p>
                        <p className="text-[9px] mt-0.5 leading-none"
                          style={{ color: 'var(--foreground)', opacity: 0.4 }}>
                          {t.description}
                        </p>
                      </div>
                      {active && (
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: t.vars.primary }}
                        >
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active theme summary */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px]"
            style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)' }}
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${THEMES.find(t => t.name === theme)?.preview[0]}, ${THEMES.find(t => t.name === theme)?.preview[2]})` }}
            />
            <span style={{ color: 'var(--foreground)', opacity: 0.6 }}>
              Saved · {THEMES.find(t => t.name === theme)?.label} · {mode === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
