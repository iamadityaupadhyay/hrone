import { EmployeeProfile } from '@/lib/types/employee';

/**
 * Resolves the WhatsApp recipient JID for an employee with multi-layer fallbacks
 */
export function resolveWhatsAppRecipient(emp: EmployeeProfile | Record<string, unknown>): string | undefined {
  const anyEmp = emp as any;
  if (anyEmp.whatsappLid && String(anyEmp.whatsappLid).trim()) return String(anyEmp.whatsappLid).trim();
  if (anyEmp.whatsappJid && String(anyEmp.whatsappJid).trim()) return String(anyEmp.whatsappJid).trim();

  if (anyEmp.mobileNumber) {
    const clean = String(anyEmp.mobileNumber).replace(/\D/g, '');
    if (clean.length === 10) return `91${clean}@s.whatsapp.net`;
    if (clean.length >= 10) return `${clean}@s.whatsapp.net`;
  }

  if (anyEmp.username) {
    const cleanUser = String(anyEmp.username).replace(/\D/g, '');
    if (cleanUser.length === 10) return `91${cleanUser}@s.whatsapp.net`;
    if (cleanUser.length >= 10) return `${cleanUser}@s.whatsapp.net`;
  }

  if (process.env.WHATSAPP_NOTIFY_NUMBER) {
    const cleanNotify = process.env.WHATSAPP_NOTIFY_NUMBER.replace(/\D/g, '');
    if (cleanNotify.length === 10) return `91${cleanNotify}@s.whatsapp.net`;
    if (cleanNotify.length >= 10) return `${cleanNotify}@s.whatsapp.net`;
  }

  return undefined;
}
