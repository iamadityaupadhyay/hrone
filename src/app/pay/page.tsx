'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Smartphone,
  QrCode,
  ArrowRight,
  Sparkles,
  Lock,
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface GatewayData {
  upiId: string;
  upiName: string;
  amount: number;
  planType: string;
  planName: string;
  note: string;
  upiUri: string;
  qrDataUrl: string;
}

interface EmployeeInfo {
  id: number;
  name: string;
  username: string;
  mobileNumber?: string;
}

function PaymentCheckoutContent() {
  const searchParams = useSearchParams();
  const empParam = searchParams.get('emp') || searchParams.get('id') || '';
  const initialPlan = searchParams.get('plan') === '99' ? 99 : 149;

  const [selectedPlan, setSelectedPlan] = useState<99 | 149>(initialPlan);
  const [empInput, setEmpInput] = useState(empParam);
  const [loading, setLoading] = useState(true);
  const [gatewayData, setGatewayData] = useState<GatewayData | null>(null);
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);

  const [copied, setCopied] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Load Gateway Details
  useEffect(() => {
    setLoading(true);
    fetch(`/api/pay?emp=${encodeURIComponent(empInput)}&plan=${selectedPlan}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setGatewayData(data.gateway);
          setEmployee(data.employee);
        }
      })
      .catch((err) => console.error('Failed to load gateway:', err))
      .finally(() => setLoading(false));
  }, [selectedPlan, empInput]);

  function handleCopyUpi() {
    if (!gatewayData?.upiId) return;
    navigator.clipboard.writeText(gatewayData.upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSubmitUtr(e: React.FormEvent) {
    e.preventDefault();
    if (!utrInput || utrInput.trim().length < 6) {
      setSubmitError('Please enter a valid 12-digit UPI reference number / UTR.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee?.id || (empInput ? Number(empInput) || null : null),
          plan: selectedPlan === 149 ? 'PRO_149' : 'BASIC_99',
          amount: selectedPlan,
          utr: utrInput.trim(),
          senderName: employee?.name || 'Web Checkout',
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to submit payment reference');
      }

      setSubmittedSuccess(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error submitting payment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans antialiased selection:bg-purple-900 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-15 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-sm">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                HROne Gateway <span className="text-[10px] text-zinc-400 font-mono font-normal">SECURE CHECKOUT</span>
              </h1>
              <p className="text-[11px] text-zinc-400">Official Attendance Subscription Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">256-bit Encrypted UPI</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 py-8 flex-1 w-full">
        {submittedSuccess ? (
          /* Success Screen */
          <div className="max-w-md mx-auto p-8 rounded-2xl bg-zinc-900 border border-zinc-800 text-center shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Payment Submitted!</h2>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Thank you! Your UTR <strong className="text-zinc-200 font-mono">{utrInput}</strong> has been logged.
                Our automated system verifies transactions within minutes and unlocks your account.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 text-left text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500">Plan:</span>
                <span className="text-zinc-200 font-bold">{selectedPlan === 149 ? '⭐ Pro Suite' : '🟢 Standard'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Amount Paid:</span>
                <span className="text-emerald-400 font-bold">₹{selectedPlan}.00</span>
              </div>
              {employee && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Employee:</span>
                  <span className="text-zinc-200">{employee.name}</span>
                </div>
              )}
            </div>

            <p className="text-[11px] text-zinc-500">
              You will receive a confirmation message directly on WhatsApp once approved.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Plan Selection & Employee Info (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Employee Identification Card */}
              <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Employee Details
                  </span>
                  {employee && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                      ● Verified Account
                    </span>
                  )}
                </div>

                {employee ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                    <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center font-bold text-purple-400 font-mono text-sm">
                      {employee.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-zinc-100 truncate">{employee.name}</div>
                      <div className="text-xs font-mono text-zinc-400">
                        ID: #{employee.id} {employee.username ? `• ${employee.username}` : ''}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Enter Employee ID or Mobile Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 102 or E1885"
                      value={empInput}
                      onChange={(e) => setEmpInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950/80 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                )}
              </div>

              {/* Tier Selection */}
              <div className="space-y-3">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Select Your Plan
                </h2>

                {/* Option 1: Standard Plan (₹99) */}
                <div
                  onClick={() => setSelectedPlan(99)}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all relative ${
                    selectedPlan === 99
                      ? 'bg-emerald-950/15 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/30'
                      : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-zinc-100">🟢 Standard Plan</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">Core attendance auto-pilot with human jitter</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold font-mono text-emerald-400">₹99</div>
                      <span className="text-[11px] text-zinc-500 font-mono">per month</span>
                    </div>
                  </div>

                  <ul className="mt-3 pt-3 border-t border-zinc-800/80 text-xs text-zinc-300 space-y-1.5">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Daily Automated Check-In & Check-Out</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Randomized Human-Realistic Punch Timings</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Saturday Remote Punching Support</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Official Holidays Auto-Detection & Pause</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>WhatsApp Live Punch Cards & Session Refresh</span>
                    </li>
                  </ul>
                </div>

                {/* Option 2: Pro Suite (₹149) */}
                <div
                  onClick={() => setSelectedPlan(149)}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all relative ${
                    selectedPlan === 149
                      ? 'bg-purple-950/20 border-purple-500/50 shadow-md ring-1 ring-purple-500/30'
                      : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-purple-500 text-white shadow-sm flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> RECOMMENDED
                  </div>

                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-zinc-100">⭐ Pro Suite</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">Everything in Standard + Exclusive Pro Features</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold font-mono text-purple-400">₹149</div>
                      <span className="text-[11px] text-zinc-500 font-mono">per month</span>
                    </div>
                  </div>

                  <ul className="mt-3 pt-3 border-t border-zinc-800/80 text-xs text-zinc-300 space-y-1.5">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>Everything included in Standard (₹99)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <strong className="text-white">🏠 Unlimited WFH Location Pin Mode</strong>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <strong className="text-white">⚡ Missed Punch Auto-Regularization</strong>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>Priority sliding token auto-refresh queue</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Right Column: Payment Gateway Interactive Console (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Scan & Pay with UPI
                  </span>
                  <span className="font-mono text-sm font-bold text-emerald-400">₹{selectedPlan}.00</span>
                </div>

                {/* QR Code Container */}
                <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-white text-zinc-950 shadow-inner">
                  {loading ? (
                    <div className="h-64 flex items-center justify-center text-zinc-400">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                    </div>
                  ) : gatewayData?.qrDataUrl ? (
                    <>
                      <img
                        src={gatewayData.qrDataUrl}
                        alt="UPI Payment QR Code"
                        className="w-56 h-56 rounded-lg object-contain"
                      />
                      <div className="text-[11px] text-zinc-600 font-mono mt-1 font-semibold flex items-center gap-1">
                        <Lock className="w-3 h-3 text-zinc-500" /> Exact Amount: ₹{selectedPlan} • Verified UPI
                      </div>
                    </>
                  ) : (
                    <div className="h-56 flex items-center justify-center text-xs text-zinc-500">
                      Failed to load QR code
                    </div>
                  )}
                </div>

                {/* UPI Details Bar */}
                {gatewayData && (
                  <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between text-xs font-mono">
                    <div className="min-w-0 pr-2">
                      <div className="text-[10px] text-zinc-500">PAYEE UPI ID:</div>
                      <div className="text-zinc-200 font-bold truncate">{gatewayData.upiId}</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyUpi}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center gap-1 transition-colors shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                )}

                {/* Direct 1-Tap Mobile Button */}
                {gatewayData?.upiUri && (
                  <a
                    href={gatewayData.upiUri}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all sm:hidden"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Pay with PhonePe / GPay / Paytm</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}

                {/* UTR Reference Submission Form */}
                <form onSubmit={handleSubmitUtr} className="pt-3 border-t border-zinc-800 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Already Paid? Enter 12-Digit UTR / Ref No:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 432198765432"
                      value={utrInput}
                      onChange={(e) => setUtrInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Found in your GPay / PhonePe / Paytm transaction receipt as &quot;UPI Ref ID&quot; or &quot;UTR&quot;.
                    </p>
                  </div>

                  {submitError && (
                    <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-center gap-2 text-xs text-rose-300">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit & Activate Subscription</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PaymentGatewayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center font-mono text-xs">
          Loading HROne Gateway...
        </div>
      }
    >
      <PaymentCheckoutContent />
    </Suspense>
  );
}
