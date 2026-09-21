'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Megaphone,
  X,
  Send,
  Users,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Clock,
  Sparkles,
  Smartphone,
  CheckCheck,
  Radio,
  History,
  MessageSquare,
  Copy,
} from 'lucide-react';
import { EmployeeProfile } from '@/lib/types/employee';

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: EmployeeProfile[];
  whatsAppStatus?: { status: string; phoneNumber?: string } | null;
  onSuccessNotification?: (msg: string) => void;
}

interface BroadcastHistoryItem {
  id: string;
  message: string;
  target: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt?: string;
}

const TEMPLATES = [
  {
    name: '🎉 Holiday Notice',
    text: `🎉 *Holiday Announcement*\n\nDear Team,\n\nPlease note that our office will remain closed on *[Date]* on account of *[Occasion]*.\n\nRegular operations will resume on *[Next Working Day]*.\n\nBest regards,\n*Management*`,
  },
  {
    name: '📢 Important Update',
    text: `📢 *Team Announcement*\n\nDear Team,\n\n[Please insert your important company announcement or policy update here].\n\nIf you have any questions, feel free to reach out.\n\nThank you,\n*Management*`,
  },
  {
    name: '⏰ Attendance Reminder',
    text: `⏰ *Attendance Reminder*\n\nDear Team,\n\nPlease make sure to check your punch-in / punch-out attendance status today on HROne.\n\n👉 Reply *status* or *in* anytime to view your personal status.\n\nHave a productive day!`,
  },
];

export default function BroadcastModal({
  isOpen,
  onClose,
  employees,
  whatsAppStatus,
  onSuccessNotification,
}: BroadcastModalProps) {
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');
  const [message, setMessage] = useState<string>('');
  const [target, setTarget] = useState<'all' | 'active' | 'test'>('all');
  const [testNumber, setTestNumber] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [confirmSend, setConfirmSend] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [progress, setProgress] = useState<{
    id?: string;
    status: string;
    total: number;
    sent: number;
    failed: number;
  } | null>(null);

  const [history, setHistory] = useState<BroadcastHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const activeEmployees = employees.filter((e) => e.status === 'ACTIVE' && e.schedule?.active);
  const recipientCount =
    target === 'test' ? 1 : target === 'active' ? activeEmployees.length : employees.length;

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/broadcast');
      const data = await res.json();
      if (data.success && data.history) {
        setHistory(data.history);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      setConfirmSend(false);
      setErrorMsg(null);
    }
  }, [isOpen, fetchHistory]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!message.trim()) {
      setErrorMsg('Please enter an announcement message.');
      return;
    }

    if (target === 'test' && !testNumber.trim()) {
      setErrorMsg('Please enter a test WhatsApp phone number.');
      return;
    }

    setErrorMsg(null);
    setSending(true);
    setProgress({ status: 'SENDING', total: recipientCount, sent: 0, failed: 0 });

    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          target,
          testNumber: testNumber.trim(),
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to dispatch broadcast');
      }

      const broadcastId = data.broadcastId;

      if (data.status === 'COMPLETED') {
        setProgress({
          id: broadcastId,
          status: 'COMPLETED',
          total: data.totalRecipients || recipientCount,
          sent: data.sentCount || 0,
          failed: data.failedCount || 0,
        });
        setSending(false);
        setConfirmSend(false);
        fetchHistory();
        if (onSuccessNotification) {
          onSuccessNotification(`Broadcast sent to ${data.sentCount} recipients successfully!`);
        }
      } else {
        // Broadcast was queued for the worker; poll for completion
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          try {
            const pollRes = await fetch(`/api/broadcast/${broadcastId}`);
            const pollData = await pollRes.json();
            if (pollData.success && pollData.broadcast) {
              const b = pollData.broadcast;
              setProgress({
                id: b.id,
                status: b.status,
                total: b.totalRecipients,
                sent: b.sentCount,
                failed: b.failedCount,
              });

              if (b.status === 'COMPLETED' || b.status === 'FAILED' || attempts > 30) {
                clearInterval(interval);
                setSending(false);
                setConfirmSend(false);
                fetchHistory();
                if (onSuccessNotification) {
                  onSuccessNotification(
                    `Broadcast complete! Sent: ${b.sentCount}, Failed: ${b.failedCount}`
                  );
                }
              }
            }
          } catch {
            // ignore
          }
        }, 1500);
      }
    } catch (err) {
      setSending(false);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    }
  };

  // Format WhatsApp formatted text preview (replace *bold*, _italic_, ~strike~)
  const renderFormattedPreview = (text: string) => {
    if (!text) return <span className="text-slate-500 italic">Preview will appear here...</span>;
    return (
      <div className="whitespace-pre-wrap leading-relaxed break-words font-sans text-xs text-slate-100">
        {text}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl shadow-violet-950/20 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                WhatsApp Broadcast
                {whatsAppStatus?.status === 'CONNECTED' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online {whatsAppStatus.phoneNumber ? `(${whatsAppStatus.phoneNumber})` : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Bot Standby
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Send company announcements, holiday alerts, and reminders to employees
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center px-5 pt-3 border-b border-slate-800/60 gap-4">
          <button
            onClick={() => setActiveTab('compose')}
            className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'compose'
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Compose Message
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'history'
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Past Broadcasts ({history.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'compose' ? (
            <>
              {/* Target Audience Selector */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                  Select Target Audience
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTarget('all')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      target === 'all'
                        ? 'bg-violet-600/15 border-violet-500 text-white shadow-sm'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">All Employees</span>
                      <Users className="w-3.5 h-3.5 text-violet-400" />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {employees.length} total recipients
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTarget('active')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      target === 'active'
                        ? 'bg-violet-600/15 border-violet-500 text-white shadow-sm'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Active Only</span>
                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {activeEmployees.length} autopilot active
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTarget('test')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      target === 'test'
                        ? 'bg-violet-600/15 border-violet-500 text-white shadow-sm'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Test Single</span>
                      <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Send to 1 number only</p>
                  </button>
                </div>

                {target === 'test' && (
                  <div className="mt-2.5">
                    <input
                      type="text"
                      placeholder="Enter 10-digit mobile number (e.g. 9876543210)"
                      value={testNumber}
                      onChange={(e) => setTestNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                )}
              </div>

              {/* Quick Template Presets */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Quick Templates
                  </label>
                  {message && (
                    <button
                      onClick={() => setMessage('')}
                      className="text-[11px] text-slate-400 hover:text-rose-300"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.name}
                      type="button"
                      onClick={() => setMessage(tmpl.text)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800 text-slate-300 hover:text-white text-[11px] font-medium transition-all"
                    >
                      {tmpl.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Composer Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Announcement Message
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {message.length} characters • Markdown allowed (*bold*, _italic_)
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message here... Employees will receive this directly from the WhatsApp bot."
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950/70 border border-slate-800 text-white text-xs leading-relaxed placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                />
              </div>

              {/* WhatsApp Live Preview */}
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
                  WhatsApp Mobile Preview
                </label>
                <div className="p-4 rounded-2xl bg-[#0b141a] border border-slate-800/80 shadow-inner">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] bg-[#005c4b] text-white p-3 rounded-2xl rounded-tr-none shadow-md space-y-1.5 relative">
                      <div className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider flex items-center gap-1">
                        <span>HROne Announcement</span>
                      </div>
                      {renderFormattedPreview(message)}
                      <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/60 pt-1">
                        <span>
                          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <CheckCheck className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Progress Bar if sending or finished */}
              {progress && (
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white flex items-center gap-2">
                      {progress.status === 'COMPLETED' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Broadcast Complete
                        </>
                      ) : (
                        <>
                          <RotateCw className="w-4 h-4 text-violet-400 animate-spin" />
                          Sending Announcement ({progress.sent}/{progress.total})...
                        </>
                      )}
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      {progress.sent} Sent • {progress.failed} Failed
                    </span>
                  </div>

                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        progress.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-violet-500'
                      }`}
                      style={{
                        width: `${
                          progress.total > 0
                            ? Math.min(100, Math.round(((progress.sent + progress.failed) / progress.total) * 100))
                            : 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            /* History Tab */
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RotateCw className="w-6 h-6 animate-spin text-violet-400" />
                  <span className="text-xs">Loading broadcast logs...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
                  <p className="text-xs">No previous broadcasts recorded yet.</p>
                </div>
              ) : (
                history.map((h) => (
                  <div
                    key={h.id}
                    className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            h.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : h.status === 'QUEUED'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {h.status}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          Target: <strong className="text-slate-200 uppercase">{h.target}</strong>
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-400 text-[11px]">
                          Sent: <strong className="text-emerald-400">{h.sentCount}</strong> / {h.totalRecipients}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {new Date(h.createdAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 line-clamp-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60 font-sans whitespace-pre-wrap">
                      {h.message}
                    </p>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => {
                          setMessage(h.message);
                          setActiveTab('compose');
                        }}
                        className="inline-flex items-center gap-1.5 text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Reuse Message</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {activeTab === 'compose' && (
          <div className="p-4 border-t border-slate-800/80 bg-slate-900/95 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Audience:{' '}
              <strong className="text-white">
                {recipientCount} {recipientCount === 1 ? 'employee' : 'employees'}
              </strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              {confirmSend ? (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !message.trim()}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/30 transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 animate-pulse"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Confirm & Send to {recipientCount}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!message.trim()) {
                      setErrorMsg('Please type an announcement message.');
                      return;
                    }
                    if (target === 'test' && !testNumber.trim()) {
                      setErrorMsg('Please enter a test phone number.');
                      return;
                    }
                    setErrorMsg(null);
                    setConfirmSend(true);
                  }}
                  disabled={sending || !message.trim()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-violet-600/30 transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Broadcast</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
