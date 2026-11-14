'use client';

import { useState, useEffect } from 'react';
import { CreditCard, X, Check, AlertCircle, RefreshCw, Sparkles, Shield, Clock } from 'lucide-react';
import { EmployeeProfile, SubscriptionPlan, SubscriptionStatus } from '@/lib/types/employee';

interface EmployeeSubscriptionModalProps {
  isOpen: boolean;
  employee: EmployeeProfile | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function EmployeeSubscriptionModal({
  isOpen,
  employee,
  onClose,
  onSaved,
}: EmployeeSubscriptionModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [plan, setPlan] = useState<SubscriptionPlan>('PRO_149');
  const [status, setStatus] = useState<SubscriptionStatus>('ACTIVE');
  const [durationDays, setDurationDays] = useState(30);
  const [isComped, setIsComped] = useState(false);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);

  useEffect(() => {
    if (!employee || !isOpen) return;
    setError(null);
    setSuccessMsg(null);

    const sub = employee.subscription;
    if (sub) {
      setPlan(sub.plan || 'PRO_149');
      setStatus(sub.status || 'ACTIVE');
      setIsComped(Boolean(sub.isComped || employee.isSuperAdmin));

      if (sub.validUntil) {
        const diffMs = new Date(sub.validUntil).getTime() - Date.now();
        const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        setDurationDays(days > 365 ? 365 : days);
      } else {
        setDurationDays(30);
      }
    } else {
      setPlan('PRO_149');
      setStatus('ACTIVE');
      setDurationDays(30);
      setIsComped(Boolean(employee.isSuperAdmin));
    }
  }, [employee, isOpen]);

  if (!isOpen || !employee) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/employees/${employee?._id || employee?.employeeId}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          status: isComped ? 'LIFETIME_FREE' : status,
          durationDays: isComped ? 36500 : Number(durationDays) || 30,
          isComped,
          notifyWhatsApp,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update subscription');
      }

      setSuccessMsg(data.message || 'Subscription successfully updated!');
      if (onSaved) onSaved();

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400 shadow-sm">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-100">{employee.name}</h2>
                <span className="text-xs font-mono text-zinc-400">#{employee.employeeId}</span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Manage individual subscription plan and access tier.
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

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto">
          {/* Plan Selector */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              Select Subscription Plan
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPlan('BASIC_99')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  plan === 'BASIC_99'
                    ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm ring-1 ring-emerald-500/30'
                    : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-emerald-400">🟢 Standard Plan</span>
                  <span className="font-mono text-xs font-bold text-zinc-200">₹99/mo</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                  Auto Check-in/out, Saturday remote punch, official holidays.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPlan('PRO_149')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  plan === 'PRO_149'
                    ? 'bg-purple-500/10 border-purple-500/40 shadow-sm ring-1 ring-purple-500/30'
                    : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-purple-400">⭐ Pro Suite</span>
                  <span className="font-mono text-xs font-bold text-zinc-200">₹149/mo</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                  Standard + 🏠 WFH GPS Pin Mode & ⚡ Attendance Auto-Regularize.
                </p>
              </button>
            </div>
          </div>

          {/* Access Status & VIP Option */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              Access Status & Tier
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setStatus('ACTIVE');
                  setIsComped(false);
                }}
                className={`p-2 rounded-lg border text-center text-xs font-medium transition-all ${
                  status === 'ACTIVE' && !isComped
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🟢 Active
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatus('TRIAL');
                  setIsComped(false);
                }}
                className={`p-2 rounded-lg border text-center text-xs font-medium transition-all ${
                  status === 'TRIAL' && !isComped
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                    : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                ⏳ Free Trial
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatus('EXPIRED');
                  setIsComped(false);
                }}
                className={`p-2 rounded-lg border text-center text-xs font-medium transition-all ${
                  status === 'EXPIRED' && !isComped
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🔴 Expired
              </button>
            </div>

            {/* Lifetime Free VIP Toggle */}
            <div className="mt-2.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  Grant Lifetime Free VIP Access
                </span>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Never expires and unlocks all features permanently with zero fees.
                </p>
              </div>
              <input
                type="checkbox"
                checked={isComped}
                onChange={(e) => {
                  setIsComped(e.target.checked);
                  if (e.target.checked) setStatus('LIFETIME_FREE');
                  else setStatus('ACTIVE');
                }}
                className="rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
              />
            </div>
          </div>

          {/* Duration Selector (Only if not Lifetime Free) */}
          {!isComped && (
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                Duration / Validity
              </label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[
                  { label: '30 Days', days: 30 },
                  { label: '60 Days', days: 60 },
                  { label: '90 Days', days: 90 },
                  { label: '1 Year', days: 365 },
                ].map((d) => (
                  <button
                    key={d.days}
                    type="button"
                    onClick={() => setDurationDays(d.days)}
                    className={`py-1.5 rounded-lg border text-xs font-mono transition-all ${
                      durationDays === d.days
                        ? 'bg-zinc-800 border-zinc-600 text-white font-semibold'
                        : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={durationDays}
                  onChange={(e) => setDurationDays(parseInt(e.target.value, 10) || 30)}
                  className="w-24 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs font-mono focus:outline-none focus:border-purple-500"
                />
                <span className="text-xs text-zinc-400">days from today</span>
              </div>
            </div>
          )}

          {/* WhatsApp Notification Checkbox */}
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-zinc-200">Notify employee on WhatsApp</span>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Sends a confirmation message with their active plan and expiry date.
              </p>
            </div>
            <input
              type="checkbox"
              checked={notifyWhatsApp}
              onChange={(e) => setNotifyWhatsApp(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0 w-4 h-4 cursor-pointer"
            />
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Save Subscription</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

