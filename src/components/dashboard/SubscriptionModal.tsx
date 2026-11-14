'use client';

import { useState, useEffect } from 'react';
import { CreditCard, X, Check, AlertCircle, RefreshCw, Sparkles, Shield, Users, Clock, Zap } from 'lucide-react';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

interface SubscriptionStats {
  totalEmployees: number;
  compedCount: number;
  trialCount: number;
  proCount: number;
  basicCount: number;
  expiredCount: number;
  mrr: number;
}

interface SubscriptionSettings {
  enforced: boolean;
  trialDaysDefault: number;
  updatedAt?: string;
}

export function SubscriptionModal({ isOpen, onClose, onSaved }: SubscriptionModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [enforced, setEnforced] = useState(false);
  const [trialDays, setTrialDays] = useState(7);
  const [resetAllTrials, setResetAllTrials] = useState(true);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    fetch('/api/settings/subscription')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setEnforced(Boolean(data.settings?.enforced));
          setTrialDays(data.settings?.trialDaysDefault || 7);
          setStats(data.stats);
        } else {
          setError(data.error || 'Failed to load subscription settings');
        }
      })
      .catch((err) => {
        setError(err.message || 'Network error');
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      const res = await fetch('/api/settings/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enforced,
          trialDaysDefault: Number(trialDays) || 7,
          resetAllTrials: enforced ? resetAllTrials : false,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update subscription settings');
      }

      setSuccessMsg(data.message || 'Settings updated successfully!');
      if (onSaved) onSaved();

      // Refresh stats
      const statsRes = await fetch('/api/settings/subscription');
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.stats);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center border shadow-sm ${
              enforced
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}>
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-100">Subscription & Monetization</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
                  enforced
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}>
                  {enforced ? 'ACTIVE' : 'DEACTIVATED'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Control the subscription paywall and tier enforcement.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto">
          {/* Master Toggle Banner */}
          <div className={`p-4 rounded-xl border transition-all ${
            enforced
              ? 'bg-emerald-950/20 border-emerald-500/30'
              : 'bg-zinc-950/60 border-zinc-800'
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-zinc-100 text-sm">
                    {enforced ? 'Monetization Active (Enforced)' : 'Monetization Deactivated (Free Mode)'}
                  </h3>
                </div>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  {enforced
                    ? 'Employees must have an active subscription or free trial to use autopilot punches. WFH and regularization are gated to the Pro plan (₹149).'
                    : 'All employees enjoy 100% free, unrestricted access to daily autopilot, Saturday punches, WFH mode, and auto-regularization with no payment blocks.'}
                </p>
              </div>

              {/* Master Switch */}
              <button
                type="button"
                onClick={() => setEnforced(!enforced)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  enforced ? 'bg-emerald-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    enforced ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Activation Options (Visible when toggling on or active) */}
          {enforced && (
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                Activation Options
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Default Trial Duration (Days)</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={trialDays}
                    onChange={(e) => setTrialDays(parseInt(e.target.value, 10) || 7)}
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
                    <input
                      type="checkbox"
                      checked={resetAllTrials}
                      onChange={(e) => setResetAllTrials(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-850 text-emerald-500 focus:ring-0"
                    />
                    <span>Reset trials for all from today</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Quick Metrics */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-xl bg-zinc-950/40 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-500 font-mono">TOTAL USERS</div>
                <div className="text-base font-bold text-zinc-100 font-mono mt-0.5">{stats.totalEmployees}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-950/40 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-500 font-mono">PRO SUITE (₹149)</div>
                <div className="text-base font-bold text-purple-400 font-mono mt-0.5">{stats.proCount}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-950/40 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-500 font-mono">STANDARD (₹99)</div>
                <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">{stats.basicCount}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-950/40 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-500 font-mono">ACTIVE TRIALS</div>
                <div className="text-base font-bold text-blue-400 font-mono mt-0.5">{stats.trialCount}</div>
              </div>
            </div>
          )}

          {/* Plan Breakdown Card Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800/80 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-400">🟢 Standard Plan</span>
                <span className="font-mono text-zinc-300 font-bold">₹99/mo</span>
              </div>
              <ul className="text-[11px] text-zinc-400 space-y-1">
                <li>• Daily auto check-in & check-out</li>
                <li>• Realistic human jitter times</li>
                <li>• Saturday remote auto-punching</li>
                <li>• Official holiday auto-pause</li>
                <li>• WhatsApp live status cards</li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/40 border border-purple-500/20 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-purple-400">⭐ Pro Suite</span>
                <span className="font-mono text-zinc-300 font-bold">₹149/mo</span>
              </div>
              <ul className="text-[11px] text-zinc-400 space-y-1">
                <li>• Everything in Standard Plan</li>
                <li>• 🏠 <strong className="text-zinc-200">Unlimited WFH GPS Pin Mode</strong></li>
                <li>• ⚡ <strong className="text-zinc-200">Attendance Auto-Regularization</strong></li>
                <li>• Priority token refresh queue</li>
              </ul>
            </div>
          </div>

          {/* Feedback */}
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

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
            >
              Close
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
                  <span>{enforced ? 'Save & Enforce Subscription' : 'Save & Keep Deactivated'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
