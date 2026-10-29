'use client';

import { Key, FileCode, Sliders, X, RotateCw, Check } from 'lucide-react';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionLoading: string | null;
  importTab: 'login' | 'curl' | 'manual';
  setImportTab: (tab: 'login' | 'curl' | 'manual') => void;
  loginForm: {
    username: string;
    password: string;
    companyDomainCode: string;
  };
  setLoginForm: React.Dispatch<
    React.SetStateAction<{
      username: string;
      password: string;
      companyDomainCode: string;
    }>
  >;
  rawCurl: string;
  setRawCurl: (val: string) => void;
  manualForm: {
    name: string;
    employeeId: string;
    username: string;
    companyDomainCode: string;
    refreshToken: string;
    jwtToken: string;
    checkInMin: string;
    checkInMax: string;
    checkOutMin: string;
    checkOutMax: string;
    includeSaturday: boolean;
    geoLocation: string;
    latitude: string;
    longitude: string;
    geoAccuracy: string;
  };
  setManualForm: React.Dispatch<
    React.SetStateAction<{
      name: string;
      employeeId: string;
      username: string;
      companyDomainCode: string;
      refreshToken: string;
      jwtToken: string;
      checkInMin: string;
      checkInMax: string;
      checkOutMin: string;
      checkOutMax: string;
      includeSaturday: boolean;
      geoLocation: string;
      latitude: string;
      longitude: string;
      geoAccuracy: string;
    }>
  >;
  onDirectLogin: (e: React.FormEvent) => Promise<void>;
  onOnboardSubmit: (e: React.FormEvent) => Promise<void>;
}

export function AddEmployeeModal({
  isOpen,
  onClose,
  actionLoading,
  importTab,
  setImportTab,
  loginForm,
  setLoginForm,
  rawCurl,
  setRawCurl,
  manualForm,
  setManualForm,
  onDirectLogin,
  onOnboardSubmit,
}: AddEmployeeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-2xl relative">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-base font-semibold text-zinc-100">Enroll Team Member</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-800 text-xs font-medium gap-1">
          <button
            type="button"
            onClick={() => setImportTab('login')}
            className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              importTab === 'login'
                ? 'bg-zinc-800 text-zinc-100 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>HROne Login</span>
          </button>
          <button
            type="button"
            onClick={() => setImportTab('curl')}
            className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              importTab === 'curl'
                ? 'bg-zinc-800 text-zinc-100 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Paste cURL</span>
          </button>
          <button
            type="button"
            onClick={() => setImportTab('manual')}
            className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              importTab === 'manual'
                ? 'bg-zinc-800 text-zinc-100 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Manual</span>
          </button>
        </div>

        {importTab === 'login' ? (
          <form onSubmit={onDirectLogin} className="space-y-4">
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-300 mb-1 block font-medium">
                  HROne Username / Employee Code
                </label>
                <input
                  type="text"
                  required
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  placeholder="E1885 or 8112299688"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                />
              </div>
              <div>
                <label className="text-zinc-300 mb-1 block font-medium">HROne Password</label>
                <input
                  type="password"
                  required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                />
              </div>
              <div>
                <label className="text-zinc-300 mb-1 block font-medium">Company Domain Code</label>
                <input
                  type="text"
                  required
                  value={loginForm.companyDomainCode}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, companyDomainCode: e.target.value })
                  }
                  placeholder="uharvest"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                />
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80">
                ⚡ Authenticates directly with HROne Cloud, fetches your sliding refresh token, and
                configures 24/7 attendance auto-pilot automatically.
              </p>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading === 'login'}
                className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-colors"
              >
                {actionLoading === 'login' ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <Key className="w-3.5 h-3.5" />
                    <span>Log In & Enroll</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={onOnboardSubmit} className="space-y-4">
            {importTab === 'curl' ? (
              <div className="space-y-2">
                <label className="text-xs text-zinc-300 block">Paste HROne cURL from DevTools:</label>
                <textarea
                  rows={7}
                  value={rawCurl}
                  onChange={(e) => setRawCurl(e.target.value)}
                  placeholder="curl --request POST --url https://app.hrone.cloud/api/timeoffice/... --header 'Cookie: JwtTokenCookie=...'"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                />
                <p className="text-[11px] text-zinc-400">
                  Auto-detects employee name, ID, credentials, and office coordinates.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-zinc-400 mb-1 block">Name</label>
                  <input
                    type="text"
                    value={manualForm.name}
                    onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                    placeholder="Rachit Sharma"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-100"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 mb-1 block">Employee ID</label>
                  <input
                    type="number"
                    value={manualForm.employeeId}
                    onChange={(e) => setManualForm({ ...manualForm, employeeId: e.target.value })}
                    placeholder="2358"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-100"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-zinc-400 mb-1 block">RefreshTokenCookie</label>
                  <input
                    type="text"
                    value={manualForm.refreshToken}
                    onChange={(e) => setManualForm({ ...manualForm, refreshToken: e.target.value })}
                    placeholder="UUID from cookies"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 font-mono text-zinc-200"
                  />
                </div>
                <div className="col-span-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-zinc-300 text-xs">
                    <input
                      type="checkbox"
                      checked={manualForm.includeSaturday}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, includeSaturday: e.target.checked })
                      }
                      className="rounded border-zinc-700 bg-zinc-950 text-zinc-100 focus:ring-zinc-700 w-4 h-4"
                    />
                    <span>Enable Saturday Auto-Punch (Mon–Sat)</span>
                  </label>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading === 'onboard'}
                className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-colors"
              >
                {actionLoading === 'onboard' ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Employee</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

