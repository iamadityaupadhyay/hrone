import { getDatabase } from '@/lib/mongodb';
import { resolveWhatsAppRecipient } from './recipient';
import { getISTPunchTime } from '../hrone/punch';
import { getAllEmployees } from '../db/employees';
import { isHolidayToday } from '../db/holidays';

export interface SuperAdminInfo {
  name: string;
  employeeId: number;
  recipientJid: string;
}

export type AlertType = 'HOLIDAY' | 'PUNCH_FAILURE' | 'TOKEN_FAILURE' | 'SYSTEM' | 'DAILY_SUMMARY' | 'INFO';

export interface NotifyOptions {
  alertType?: AlertType;
  urgent?: boolean;
  throttleMinutes?: number;
  dedupKey?: string;
}

// In-memory alert cache for anti-spam throttling
const alertHistory = new Map<string, number>();

/**
 * Resolves the primary Super Admin contact (Aditya Upadhyay)
 */
export async function getSuperAdminRecipient(): Promise<SuperAdminInfo> {
  const fallbackLid = '273095696904333@lid'; // Aditya Upadhyay verified WhatsApp LID
  const fallbackName = 'Aditya Upadhyay';
  const fallbackId = 2357;

  try {
    const db = await getDatabase();
    const adminDoc = await db.collection('employees').findOne({
      $or: [
        { isSuperAdmin: true },
        { employeeId: 2357 },
        { name: { $regex: /Aditya Upadhyay/i } },
      ],
    });

    if (adminDoc) {
      const jid = resolveWhatsAppRecipient(adminDoc as any) || fallbackLid;
      return {
        name: adminDoc.name || fallbackName,
        employeeId: adminDoc.employeeId || fallbackId,
        recipientJid: jid,
      };
    }
  } catch (err) {
    console.error('[Admin Notify] Error querying super admin from DB:', err);
  }

  // Fallback to environment variables or hardcoded verified LID
  const envJid = process.env.WHATSAPP_ADMIN_JID || (process.env.WHATSAPP_ADMIN_NUMBER ? `${process.env.WHATSAPP_ADMIN_NUMBER.replace(/\D/g, '')}@s.whatsapp.net` : fallbackLid);

  return {
    name: fallbackName,
    employeeId: fallbackId,
    recipientJid: envJid,
  };
}

/**
 * Send an admin-level notification specifically to Super Admin (Aditya Upadhyay) on WhatsApp
 */
export async function notifySuperAdmin(
  message: string,
  options: NotifyOptions = {}
): Promise<boolean> {
  const { alertType = 'INFO', urgent = false, throttleMinutes = 15, dedupKey } = options;

  // Throttle check
  const key = dedupKey || `${alertType}:${message.slice(0, 80)}`;
  const now = Date.now();
  const lastSent = alertHistory.get(key);

  if (!urgent && lastSent && now - lastSent < throttleMinutes * 60 * 1000) {
    console.log(`[Admin Notify] Alert throttled (cooldown active): ${key}`);
    return false;
  }

  const admin = await getSuperAdminRecipient();
  if (!admin.recipientJid) {
    console.warn('[Admin Notify] No valid WhatsApp recipient found for Super Admin.');
    return false;
  }

  const istNow = getISTPunchTime();
  const [datePart, timePart] = istNow.split('T');

  let headerIcon = '🛡️';
  let headerTitle = 'SUPER ADMIN ALERT';

  switch (alertType) {
    case 'HOLIDAY':
      headerIcon = '🌴';
      headerTitle = 'HOLIDAY NOTICE';
      break;
    case 'PUNCH_FAILURE':
      headerIcon = '⚠️';
      headerTitle = 'PUNCH FAILURE ALERT';
      break;
    case 'TOKEN_FAILURE':
      headerIcon = '⚠️';
      headerTitle = 'TOKEN REFRESH FAILURE';
      break;
    case 'SYSTEM':
      headerIcon = '🚨';
      headerTitle = 'SYSTEM ERROR ALERT';
      break;
    case 'DAILY_SUMMARY':
      headerIcon = '📊';
      headerTitle = 'DAILY ATTENDANCE RECAP';
      break;
    case 'INFO':
    default:
      headerIcon = '🛡️';
      headerTitle = 'ADMIN NOTIFICATION';
      break;
  }

  const formattedMessage =
    `${headerIcon} *[${headerTitle}]*\n` +
    `👤 *Recipient:* ${admin.name} (Super Admin)\n` +
    `⏰ *Time:* ${timePart} IST (${datePart})\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${message.trim()}`;

  try {
    // Dynamic import to prevent circular dependencies with bot.ts
    const { sendWhatsAppNotification } = await import('../../whatsapp/bot');
    const sent = await sendWhatsAppNotification(formattedMessage, admin.recipientJid);

    if (sent) {
      alertHistory.set(key, now);
      console.log(`[Admin Notify] Sent ${alertType} alert to Super Admin (${admin.recipientJid})`);

      // Persist in MongoDB admin_alerts collection for audit
      try {
        const db = await getDatabase();
        await db.collection('admin_alerts').insertOne({
          alertType,
          message,
          recipientJid: admin.recipientJid,
          recipientName: admin.name,
          recipientEmployeeId: admin.employeeId,
          sentAt: new Date().toISOString(),
          timeIST: istNow,
          success: true,
        });
      } catch (logErr) {
        console.warn('[Admin Notify] Could not log alert in DB:', logErr);
      }

      return true;
    }
  } catch (err) {
    console.error('[Admin Notify] Failed to send notification to Super Admin:', err);
  }

  return false;
}

/**
 * Notify Super Admin when today is an official holiday (sent max once per day)
 */
export async function notifyHolidayAlert(holidayName: string, dateStr: string): Promise<boolean> {
  const dedupKey = `HOLIDAY_${dateStr}`;
  const dayName = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${dateStr}T12:00:00+05:30`));

  const text =
    `📅 *Today is an Official Holiday!*\n\n` +
    `• *Date:* ${dateStr} (${dayName})\n` +
    `• *Occasion:* *${holidayName}*\n\n` +
    `⏸️ *Action Taken:* Automated check-ins and check-outs are *suspended* for all employees today. Have a wonderful holiday! 🌴✨`;

  return notifySuperAdmin(text, {
    alertType: 'HOLIDAY',
    dedupKey,
    throttleMinutes: 24 * 60, // 24 hours cooldown
  });
}

/**
 * Notify Super Admin when an employee's punch fails
 */
export async function notifyPunchFailure(
  emp: { name: string; username?: string; employeeId: number },
  punchType: string,
  error: string,
  httpStatus?: number
): Promise<boolean> {
  const dedupKey = `PUNCH_FAIL_${emp.employeeId}_${punchType}`;
  const statusStr = httpStatus ? ` (HTTP ${httpStatus})` : '';

  const text =
    `⚠️ *Employee Punch Failed!*\n\n` +
    `• *Employee:* *${emp.name}* (ID: ${emp.employeeId})\n` +
    `• *Username:* ${emp.username || 'N/A'}\n` +
    `• *Action:* *${punchType}*\n` +
    `• *Error:* ${error || 'Unknown server error'}${statusStr}\n\n` +
    `👉 You can verify employee token or re-punch manually from the dashboard.`;

  return notifySuperAdmin(text, {
    alertType: 'PUNCH_FAILURE',
    dedupKey,
    throttleMinutes: 30, // Don't spam repeated punch fails within 30 mins
  });
}

/**
 * Notify Super Admin when token refresh fails for an employee
 */
export async function notifyTokenRefreshFailure(
  emp: { name: string; username?: string; employeeId: number },
  error: string
): Promise<boolean> {
  const dedupKey = `TOKEN_FAIL_${emp.employeeId}`;

  const text =
    `⚠️ *HROne Token Refresh Failed!*\n\n` +
    `• *Employee:* *${emp.name}* (ID: ${emp.employeeId})\n` +
    `• *Username:* ${emp.username || 'N/A'}\n` +
    `• *Error:* ${error || 'Sliding token refresh rejected by HROne'}\n\n` +
    `💡 *Resolution:* The employee may need to send *login* via WhatsApp or update password.`;

  return notifySuperAdmin(text, {
    alertType: 'TOKEN_FAILURE',
    dedupKey,
    throttleMinutes: 60 * 12, // Alert at most once per 12 hours per employee
  });
}

/**
 * Notify Super Admin when an uncaught system or worker exception happens
 */
export async function notifySystemError(source: string, error: Error | string): Promise<boolean> {
  const errMsg = error instanceof Error ? (error.stack || error.message) : String(error);
  const text =
    `🚨 *Critical Worker Exception!*\n\n` +
    `• *Source:* ${source}\n` +
    `• *Details:*\n\`\`\`\n${errMsg.slice(0, 300)}\n\`\`\`\n\n` +
    `⚠️ Please review Render / cloud service logs immediately.`;

  return notifySuperAdmin(text, {
    alertType: 'SYSTEM',
    urgent: true,
    throttleMinutes: 10,
  });
}

/**
 * Generate formatted text recap of daily fleet check-ins and check-outs
 */
export async function generateDailyAttendanceSummary(targetDateStr?: string): Promise<{
  text: string;
  totalActive: number;
  checkedInCount: number;
  checkedOutCount: number;
  pendingInNames: string[];
  pendingOutNames: string[];
  errorsCount: number;
}> {
  const istTime = getISTPunchTime();
  const todayStr = targetDateStr || istTime.split('T')[0];
  const db = await getDatabase();
  const allEmps = await getAllEmployees();
  const active = allEmps.filter((e) => e.status === 'ACTIVE' && e.schedule.active);

  const checkedIn = active.filter(
    (e) => e.todayPunch?.date === todayStr && e.todayPunch.checkInStatus === 'SUCCESS'
  );
  const checkedOut = active.filter(
    (e) => e.todayPunch?.date === todayStr && e.todayPunch.checkOutStatus === 'SUCCESS'
  );

  const pendingIn = active.filter(
    (e) => e.todayPunch?.date !== todayStr || e.todayPunch?.checkInStatus !== 'SUCCESS'
  );
  const pendingOut = active.filter(
    (e) => e.todayPunch?.date !== todayStr || e.todayPunch?.checkOutStatus !== 'SUCCESS'
  );

  const errorsCount = await db.collection('punch_logs').countDocuments({
    $or: [
      { punchTime: { $regex: `^${todayStr}` } },
      { executedAt: { $gte: new Date(`${todayStr}T00:00:00.000Z`).toISOString() } },
    ],
    success: false,
  });

  const holidayCheck = await isHolidayToday(undefined, todayStr);
  const holidayNote = holidayCheck.isHoliday ? `🌴 *Holiday Note:* Today was an official holiday (*${holidayCheck.holidayName}*)\n\n` : '';

  const dayName = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${todayStr}T12:00:00+05:30`));

  const checkInPct = active.length > 0 ? Math.round((checkedIn.length / active.length) * 100) : 0;
  const checkOutPct = active.length > 0 ? Math.round((checkedOut.length / active.length) * 100) : 0;

  let text =
    `📊 *Daily Fleet Attendance Recap*\n` +
    `📅 *${todayStr}* (${dayName}) | ⏰ *11:00 PM IST*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    holidayNote +
    `👥 *Total Fleet (Autopilot):* *${active.length}* employees\n` +
    `🟢 *Checked In:* *${checkedIn.length}* / ${active.length} (${checkInPct}%)\n` +
    `🔴 *Checked Out:* *${checkedOut.length}* / ${active.length} (${checkOutPct}%)\n` +
    `⚠️ *Punch Errors Today:* *${errorsCount}*\n\n`;

  if (pendingIn.length > 0) {
    const list = pendingIn.slice(0, 5).map((e) => `• ${e.name} (ID: ${e.employeeId})`).join('\n');
    text += `⏳ *Missed Check-In (${pendingIn.length}):*\n${list}${pendingIn.length > 5 ? `\n• ...+${pendingIn.length - 5} more` : ''}\n\n`;
  } else {
    text += `✅ *Check-In:* 100% of active employees checked in!\n\n`;
  }

  if (pendingOut.length > 0) {
    const list = pendingOut.slice(0, 5).map((e) => `• ${e.name} (ID: ${e.employeeId})`).join('\n');
    text += `⏳ *Missed Check-Out (${pendingOut.length}):*\n${list}${pendingOut.length > 5 ? `\n• ...+${pendingOut.length - 5} more` : ''}\n\n`;
  } else {
    text += `✅ *Check-Out:* 100% of active employees checked out!\n\n`;
  }

  text += `👉 Send *pending in*, *pending out*, or *fleet* for details.`;

  return {
    text,
    totalActive: active.length,
    checkedInCount: checkedIn.length,
    checkedOutCount: checkedOut.length,
    pendingInNames: pendingIn.map((e) => e.name),
    pendingOutNames: pendingOut.map((e) => e.name),
    errorsCount,
  };
}

/**
 * Send the 11:00 PM IST daily attendance recap to Super Admin
 */
export async function sendDailyAttendanceSummary(targetDateStr?: string, force = false): Promise<boolean> {
  const istTime = getISTPunchTime();
  const todayStr = targetDateStr || istTime.split('T')[0];
  const dedupKey = `DAILY_SUMMARY_${todayStr}`;

  if (!force) {
    try {
      const db = await getDatabase();
      const existing = await db.collection('admin_alerts').findOne({
        alertType: 'DAILY_SUMMARY',
        timeIST: { $regex: `^${todayStr}` },
      });
      if (existing) {
        console.log(`[Admin Notify] Daily summary for ${todayStr} was already sent today.`);
        return false;
      }
    } catch (err) {
      console.warn('[Admin Notify] DB check error for daily summary deduplication:', err);
    }
  }

  const { text } = await generateDailyAttendanceSummary(todayStr);
  return notifySuperAdmin(text, {
    alertType: 'DAILY_SUMMARY',
    dedupKey,
    throttleMinutes: force ? 0 : 60 * 12,
  });
}
