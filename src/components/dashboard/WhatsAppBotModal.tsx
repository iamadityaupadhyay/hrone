'use client';

import { MessageSquare, X, Smartphone, RotateCw } from 'lucide-react';

interface WhatsAppBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  whatsAppStatus: {
    status: string;
    phoneNumber?: string;
    qrDataUrl?: string;
    updatedAt?: string;
  } | null;
}

export function WhatsAppBotModal({
  isOpen,
  onClose,
  whatsAppStatus,
}: WhatsAppBotModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-zinc-300">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">WhatsApp Attendance Bot</h3>
            <p className="text-xs text-zinc-400">
              Execute punches, receive notifications, and run admin audits
            </p>
          </div>
        </div>

        {whatsAppStatus?.status === 'CONNECTED' ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-zinc-200">Bot Connected & Online</span>
                </div>
                <span className="text-xs font-mono font-medium text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                  {whatsAppStatus.phoneNumber || 'Active'}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Your bot session is active. Send messages directly from your WhatsApp number to interact with HROne.
              </p>
            </div>

            <div className="space-y-2 text-xs text-zinc-400 bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800">
              <span className="text-zinc-200 font-medium block">Available Commands:</span>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] pt-1">
                <div className="bg-zinc-900 border border-zinc-800/80 px-2 py-1 rounded text-zinc-300">• status</div>
                <div className="bg-zinc-900 border border-zinc-800/80 px-2 py-1 rounded text-zinc-300">• in / punch in</div>
                <div className="bg-zinc-900 border border-zinc-800/80 px-2 py-1 rounded text-zinc-300">• out / punch out</div>
                <div className="bg-zinc-900 border border-zinc-800/80 px-2 py-1 rounded text-zinc-300">• refresh</div>
                <div className="bg-zinc-900 border border-zinc-800/80 px-2 py-1 rounded text-zinc-300">• logs</div>
                <div className="bg-zinc-900 border border-zinc-800/80 px-2 py-1 rounded text-zinc-300">• stats (admin)</div>
                <div className="bg-zinc-900 border border-zinc-800/80 px-2 py-1 rounded text-zinc-300">• pending in/out</div>
                <div className="bg-zinc-900 border border-zinc-800/80 px-2 py-1 rounded text-zinc-300">• broadcast &lt;msg&gt;</div>
              </div>
            </div>

            <div className="text-center text-xs text-zinc-400 pt-1">
              💡 Send <strong className="text-zinc-200 font-mono">help</strong> on WhatsApp for full documentation.
            </div>
          </div>
        ) : whatsAppStatus?.status === 'PAIRING' && whatsAppStatus?.qrDataUrl ? (
          <div className="space-y-4 text-center">
            <div className="p-3 bg-white rounded-2xl inline-block shadow-lg border border-zinc-700 mx-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={whatsAppStatus.qrDataUrl}
                alt="WhatsApp QR Code"
                className="w-56 h-56 object-contain rounded-lg"
              />
            </div>

            <div className="space-y-1.5 text-xs text-zinc-300">
              <p className="font-medium text-zinc-200">Scan this QR code with WhatsApp:</p>
              <ol className="text-zinc-400 space-y-1 text-left max-w-xs mx-auto list-decimal list-inside text-[11px]">
                <li>Open WhatsApp on your phone</li>
                <li>Tap <strong className="text-zinc-200">Settings</strong> → <strong className="text-zinc-200">Linked Devices</strong></li>
                <li>Tap <strong className="text-zinc-200">Link a Device</strong> and point camera here</li>
              </ol>
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-400">
              <RotateCw className="w-3 h-3 animate-spin text-zinc-400" />
              <span>Waiting for scan...</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
              <div className="flex items-center gap-2 text-zinc-300 text-xs font-semibold">
                <Smartphone className="w-4 h-4 text-zinc-400" />
                <span>Start WhatsApp Worker</span>
              </div>
              <p className="text-xs text-zinc-400">
                To link WhatsApp, run the worker command in your terminal. It will stream the QR code to this dialog:
              </p>
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-300 select-all">
                npm run whatsapp
              </div>
            </div>

            <div className="text-xs text-zinc-500 text-center">
              Once started, the QR code appears here automatically.
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

