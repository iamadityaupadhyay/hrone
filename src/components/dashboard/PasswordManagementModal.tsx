'use client';

import {
  Lock,
  X,
  CheckCircle2,
  Key,
  Eye,
  EyeOff,
  RotateCw,
  Save,
  Check,
} from 'lucide-react';
import { EmployeeProfile } from '@/lib/types/employee';

interface PasswordManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: EmployeeProfile[];
  passwordInputs: Record<number, string>;
  setPasswordInputs: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  showPasswordVisibility: Record<number, boolean>;
  setShowPasswordVisibility: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  savingPasswordId: number | null;
  passwordSaveStatus: Record<number, string>;
  actionLoading: string | null;
  onSavePassword: (emp: EmployeeProfile, passToSave?: string) => Promise<void>;
  onSaveAllPasswords: () => Promise<void>;
}

export function PasswordManagementModal({
  isOpen,
  onClose,
  employees,
  passwordInputs,
  setPasswordInputs,
  showPasswordVisibility,
  setShowPasswordVisibility,
  savingPasswordId,
  passwordSaveStatus,
  actionLoading,
  onSavePassword,
  onSaveAllPasswords,
}: PasswordManagementModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
          <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-zinc-300">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              Save & Manage Employee Passwords
            </h3>
            <p className="text-xs text-zinc-400">
              Store passwords for automatic token renewals and seamless bulk re-authentication
            </p>
          </div>
        </div>

        <div className="overflow-y-auto space-y-3 pr-1 flex-1 text-xs">
          {employees.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 font-mono">No employees enrolled yet.</div>
          ) : (
            employees.map((emp) => {
              const currentInput =
                passwordInputs[emp.employeeId] !== undefined
                  ? passwordInputs[emp.employeeId]
                  : emp.password || '';
              const isSaving = savingPasswordId === emp.employeeId;
              const isVisible = !!showPasswordVisibility[emp.employeeId];
              const statusMsg = passwordSaveStatus[emp.employeeId];

              return (
                <div
                  key={emp.employeeId}
                  className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-300 font-mono">
                        {emp.name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-100">{emp.name}</span>
                          <span className="text-[10px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">
                            #{emp.employeeId}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          Username: {emp.username || emp.employeeId}
                        </span>
                      </div>
                    </div>

                    <div>
                      {emp.password ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium font-mono">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> saved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-medium font-mono">
                          <Key className="w-3 h-3 text-amber-400" /> missing
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={isVisible ? 'text' : 'password'}
                        value={currentInput}
                        onChange={(e) =>
                          setPasswordInputs({ ...passwordInputs, [emp.employeeId]: e.target.value })
                        }
                        placeholder="Enter HROne Password"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-3 pr-9 text-xs text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowPasswordVisibility({
                            ...showPasswordVisibility,
                            [emp.employeeId]: !isVisible,
                          })
                        }
                        className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
                      >
                        {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isSaving || !currentInput.trim()}
                      onClick={() => onSavePassword(emp, currentInput)}
                      className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-medium disabled:opacity-40 flex items-center gap-1.5 transition-colors"
                    >
                      {isSaving ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </>
                      )}
                    </button>
                  </div>

                  {statusMsg && (
                    <div
                      className={`text-[11px] font-mono pt-0.5 ${
                        statusMsg.includes('✅')
                          ? 'text-emerald-400'
                          : statusMsg.includes('⚠️')
                          ? 'text-amber-300'
                          : 'text-rose-400'
                      }`}
                    >
                      {statusMsg}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-[11px] text-zinc-400">
            Passwords are stored safely and used strictly for HROne authentication.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
            >
              Done
            </button>
            <button
              onClick={onSaveAllPasswords}
              disabled={actionLoading === 'save-all-passwords'}
              className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {actionLoading === 'save-all-passwords' ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving All...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save All</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

