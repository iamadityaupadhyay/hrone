'use client';

import { useState, useEffect } from 'react';
import { Clock, X, Check, AlertCircle, Sparkles, RefreshCw, Users, Shield } from 'lucide-react';

interface TimingRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

interface Preset {
  label: string;
  checkInMin: string;
  checkInMax: string;
  checkOutMin: string;
  checkOutMax: string;
}

const PRESETS: Preset[] = [
  {
    label: 'Standard (9:30 AM – 7:00 PM)',
    checkInMin: '09:30',
    checkInMax: '09:55',
    checkOutMin: '19:00',
    checkOutMax: '19:30',
  },
  {
    label: 'Early (9:00 AM – 6:30 PM)',
    checkInMin: '09:00',
    checkInMax: '09:25',
    checkOutMin: '18:30',
    checkOutMax: '19:00',
  },
  {
    label: 'Late (10:00 AM – 7:30 PM)',
    checkInMin: '10:00',
    checkInMax: '10:25',
    checkOutMin: '19:30',
    checkOutMax: '20:00',
  },
  {
    label: 'Strict 9 to 6 (9:00 AM – 6:00 PM)',
    checkInMin: '09:00',
    checkInMax: '09:15',
    checkOutMin: '18:00',
    checkOutMax: '18:20',
  },
];

function format12h(timeStr: string): string {
  if (!timeStr || !timeStr.includes(':')) return timeStr;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function TimingRulesModal({ isOpen, onClose, onSaved }: TimingRulesModalProps) {
  const [checkInMin, setCheckInMin] = useState('09:30');
  const [checkInMax, setCheckInMax] = useState('09:55');
  const [checkOutMin, setCheckOutMin] = useState('19:00');
  const [checkOutMax, setCheckOutMax] = useState('19:30');
  const [applyToAll, setApplyToAll] = useState(true);
  const [regenerateToday, setRegenerateToday] = useState(true);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [totalEmployees, setTotalEmployees] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSuccessMsg(null);
      return;
    }

    async function loadCurrentConfig() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/settings/schedule');
        const data = await res.json();
        if (data.success && data.config) {
          setCheckInMin(data.config.checkInMin || '09:30');
          setCheckInMax(data.config.checkInMax || '09:55');
          setCheckOutMin(data.config.checkOutMin || '19:00');
          setCheckOutMax(data.config.checkOutMax || '19:30');
          if (data.stats?.totalEmployees !== undefined) {
            setTotalEmployees(data.stats.totalEmployees);
          }
        }
      } catch (err) {
        console.warn('Failed to load current timing config:', err);
      } finally {
        setLoading(false);
      }
    }

    loadCurrentConfig();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: Preset) => {
    setCheckInMin(preset.checkInMin);
    setCheckInMax(preset.checkInMax);
    setCheckOutMin(preset.checkOutMin);
    setCheckOutMax(preset.checkOutMax);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      const res = await fetch('/api/settings/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkInMin,
          checkInMax,
          checkOutMin,
          checkOutMax,
          applyToAllEmployees: applyToAll,
          regenerateTodayPunches: regenerateToday,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save timings');
      }

      setSuccessMsg(
        applyToAll
          ? `✅ Successfully updated timing rules for ${data.updatedEmployeesCount ?? 'all'} employees!`
          : `✅ Default timing rules saved!`
      );

      if (onSaved) onSaved();

      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update timings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Punch Timing Rules</h3>
            <p className="text-xs text-zinc-400">
              Configure company-wide check-in and check-out windows
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Quick Shift Presets:</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="text-left px-2.5 py-1.5 rounded-lg bg-zinc-950/70 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 transition-all font-mono hover:border-zinc-700"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Check-In Window */}
          <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Morning Check-In Window
              </span>
              <span className="text-[11px] font-mono text-zinc-400">
                {format12h(checkInMin)} – {format12h(checkInMax)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1 font-mono">Earliest Check-In</label>
                <input
                  type="time"
                  required
                  value={checkInMin}
                  onChange={(e) => setCheckInMin(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1 font-mono">Latest Check-In</label>
                <input
                  type="time"
                  required
                  value={checkInMax}
                  onChange={(e) => setCheckInMax(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 font-mono">
              Auto-pilot picks a random minute between {format12h(checkInMin)} and {format12h(checkInMax)} to avoid suspicion.
            </p>
          </div>

          {/* Check-Out Window */}
          <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                Evening Check-Out Window
              </span>
              <span className="text-[11px] font-mono text-zinc-400">
                {format12h(checkOutMin)} – {format12h(checkOutMax)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1 font-mono">Earliest Check-Out</label>
                <input
                  type="time"
                  required
                  value={checkOutMin}
                  onChange={(e) => setCheckOutMin(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1 font-mono">Latest Check-Out</label>
                <input
                  type="time"
                  required
                  value={checkOutMax}
                  onChange={(e) => setCheckOutMax(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 font-mono">
              Auto-pilot picks a random minute between {format12h(checkOutMin)} and {format12h(checkOutMax)}.
            </p>
          </div>

          {/* Bulk Update Controls */}
          <div className="space-y-2 pt-1 border-t border-zinc-800/80">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="mt-0.5 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
              />
              <div>
                <span className="font-medium text-zinc-200">Apply to all existing employees immediately</span>
                <p className="text-[11px] text-zinc-500">
                  Updates schedule on all {totalEmployees !== null ? `${totalEmployees} ` : ''}employee records in database.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={regenerateToday}
                onChange={(e) => setRegenerateToday(e.target.checked)}
                className="mt-0.5 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
              />
              <div>
                <span className="font-medium text-zinc-200">Recalculate today&apos;s pending punches</span>
                <p className="text-[11px] text-zinc-500">
                  If today&apos;s check-in or check-out hasn&apos;t executed yet, rolls a new random time in the new window.
                </p>
              </div>
            </label>
          </div>

          {/* Error / Success Feedback */}
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-center gap-2 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-xs text-emerald-300">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Save & Apply Timings</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

