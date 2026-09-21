import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { getAllEmployees } from '../lib/db/employees';
import { loginWithHROne } from '../lib/hrone/auth';
import { executePunch, getISTPunchTime } from '../lib/hrone/punch';
import { refreshHROneToken } from '../lib/hrone/token';
import {
  fetchAttendanceCalendarDetails,
  extractUnregularizedDays,
  submitAttendanceRegularization,
} from '../lib/hrone/regularization';
import { getDatabase } from '../lib/mongodb';
import { EmployeeProfile } from '../lib/types/employee';

const AUTH_DIR = path.resolve(process.cwd(), '.whatsapp_auth');
let sock: WASocket | null = null;

interface PendingLoginState {
  step: 'AWAITING_USERNAME' | 'AWAITING_PASSWORD';
  username?: string;
  timestamp: number;
}
const pendingLogins = new Map<string, PendingLoginState>();

interface PendingRegularizationState {
  employeeId: number;
  dates: string[];
  timestamp: number;
}
const pendingRegularizations = new Map<string, PendingRegularizationState>();

export function getWhatsAppBotStatus() {
  return {
    connected: sock !== null && !!sock.user,
    userJid: sock?.user?.id || null,
    userName: sock?.user?.name || null,
  };
}

export { resolveWhatsAppRecipient } from '../lib/whatsapp/recipient';

/**
 * Send a notification message via WhatsApp if bot is connected, with admin fallback
 */
export async function sendWhatsAppNotification(message: string, recipientJid?: string): Promise<boolean> {
  if (!sock) {
    console.warn('[WhatsApp Bot] Bot socket not connected. Notification skipped.');
    return false;
  }

  const primaryTarget = recipientJid || process.env.WHATSAPP_NOTIFY_NUMBER;
  if (!primaryTarget) {
    console.warn('[WhatsApp Bot] No recipient JID or WHATSAPP_NOTIFY_NUMBER configured.');
    return false;
  }

  const formatJid = (input: string) => {
    if (input.includes('@')) return input;
    const clean = input.replace(/\D/g, '');
    const finalDigits = clean.length === 10 ? '91' + clean : clean;
    return `${finalDigits}@s.whatsapp.net`;
  };

  const mainJid = formatJid(primaryTarget);

  try {
    await sock.sendMessage(mainJid, { text: message });
    console.log(`[WhatsApp Bot] Sent notification successfully to ${mainJid}`);
    return true;
  } catch (err) {
    console.error(`[WhatsApp Bot] Failed to send notification to ${mainJid}:`, err);

    // Fallback attempt to WHATSAPP_NOTIFY_NUMBER if primary recipient failed
    if (process.env.WHATSAPP_NOTIFY_NUMBER) {
      const fallbackJid = formatJid(process.env.WHATSAPP_NOTIFY_NUMBER);
      if (fallbackJid !== mainJid) {
        try {
          console.log(`[WhatsApp Bot] Retrying notification via admin fallback: ${fallbackJid}`);
          await sock.sendMessage(fallbackJid, { text: `[Alert Notification]\n\n${message}` });
          return true;
        } catch (fallbackErr) {
          console.error('[WhatsApp Bot] Fallback notification also failed:', fallbackErr);
        }
      }
    }
    return false;
  }
}

export interface BroadcastRecipient {
  employeeId?: string;
  name?: string;
  jid: string;
}

export interface BroadcastExecutionResult {
  sentCount: number;
  failedCount: number;
  results: Array<{
    employeeId?: string;
    name?: string;
    jid: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Send a broadcast message to multiple WhatsApp recipients with throttling
 */
export async function sendBroadcast(
  message: string,
  recipients: BroadcastRecipient[]
): Promise<BroadcastExecutionResult> {
  const results: BroadcastExecutionResult['results'] = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const r of recipients) {
    try {
      const ok = await sendWhatsAppNotification(message, r.jid);
      if (ok) {
        sentCount++;
        results.push({ employeeId: r.employeeId, name: r.name, jid: r.jid, success: true });
      } else {
        failedCount++;
        results.push({ employeeId: r.employeeId, name: r.name, jid: r.jid, success: false, error: 'Send returned false' });
      }
    } catch (err) {
      failedCount++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({ employeeId: r.employeeId, name: r.name, jid: r.jid, success: false, error: errorMsg });
    }

    // 350ms delay between sends to respect WhatsApp rate limiting
    await new Promise((res) => setTimeout(res, 350));
  }

  return { sentCount, failedCount, results };
}

/**
 * Send interactive buttons with fallback to formatted quick-action text options
 */
export async function sendWhatsAppButtons(
  fromJid: string,
  text: string,
  buttons: Array<{ id: string; text: string }>,
  footer: string = 'HROne Personal Assistant'
): Promise<boolean> {
  if (!sock) return false;

  try {
    // 1. Attempt native Baileys interactive buttons
    const buttonPayload = {
      text,
      footer,
      buttons: buttons.map((b) => ({
        buttonId: b.id,
        buttonText: { displayText: b.text },
        type: 1,
      })),
      headerType: 1,
    };

    await sock.sendMessage(fromJid, buttonPayload as any);
    return true;
  } catch (err) {
    console.warn('[WhatsApp Bot] Native buttons failed/unsupported, using formatted fallback:', err);

    // 2. High-reliability formatted fallback menu (works 100% on all WhatsApp clients)
    let fallbackMsg = `${text}\n\n`;
    buttons.forEach((b) => {
      fallbackMsg += `👉 Reply *${b.id}* for *${b.text}*\n`;
    });
    if (footer) fallbackMsg += `\n_${footer}_`;

    await sock.sendMessage(fromJid, { text: fallbackMsg });
    return true;
  }
}

/**
 * Cleanly format any timestamp or ISO string into Asia/Kolkata (IST) display format
 */
function formatISTDisplay(timeStr?: string | null): string {
  if (!timeStr) return '';
  if (timeStr.includes('T') && !timeStr.endsWith('Z')) {
    const parts = timeStr.split('T');
    const timePart = parts[1] || '';
    const [hourStr, minStr] = timePart.split(':');
    const hour = parseInt(hourStr || '0', 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:${minStr} ${ampm} IST`;
  }
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return timeStr;
  return (
    d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' IST'
  );
}

/**
 * Cleanly format any timestamp or ISO string into Date + Time (IST) format: "19 Sep, 09:30 AM"
 */
function formatISTDateTime(timeStr?: string | null): string {
  if (!timeStr) return '';
  if (timeStr.includes('T') && !timeStr.endsWith('Z')) {
    const parts = timeStr.split('T');
    const datePart = parts[0];
    const timePart = parts[1] || '';
    const [, month, day] = datePart.split('-');
    const [hourStr, minStr] = timePart.split(':');
    const hour = parseInt(hourStr || '0', 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parseInt(month, 10) - 1] || month;
    const hourFormatted = displayHour < 10 ? `0${displayHour}` : `${displayHour}`;
    return `${parseInt(day, 10)} ${monthName}, ${hourFormatted}:${minStr} ${ampm}`;
  }
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return timeStr;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Handle incoming WhatsApp commands with strict per-employee privacy and data isolation
 */
async function handleCommand(from: string, commandText: string, senderName: string) {
  if (!sock) return;

  const cmd = commandText.trim().toLowerCase();
  console.log(`[WhatsApp Bot] Received command from ${senderName} (${from}): "${commandText}"`);

  const allEmployees = await getAllEmployees();
  const cleanSenderDigits = from.replace(/\D/g, '');
  const senderLast10 = cleanSenderDigits.length >= 10 ? cleanSenderDigits.slice(-10) : '';

  // 0. CANCEL / ABORT / RESET / LOGOUT
  if (cmd === 'cancel' || cmd === 'abort' || cmd === 'reset' || cmd === 'logout') {
    pendingLogins.delete(from);

    // If logging out / unlinking active WhatsApp session
    if (cmd === 'logout' || cmd === 'reset') {
      try {
        const db = await getDatabase();
        await db.collection('employees').updateOne(
          { $or: [{ whatsappLid: from }, { whatsappJid: from }] },
          { $unset: { whatsappLid: '', whatsappJid: '', whatsappName: '' }, $set: { updatedAt: new Date().toISOString() } }
        );
      } catch {
        // ignore
      }
    }

    pendingLogins.set(from, { step: 'AWAITING_USERNAME', timestamp: Date.now() });
    await sock.sendMessage(from, {
      text: `🚫 *Session aborted.*\n\nEnter your *HROne Username or Employee Code* to start fresh:`,
    });
    return;
  }

  // 0b. CONVERSATIONAL STEP-BY-STEP LOGIN STATE MACHINE
  const pending = pendingLogins.get(from);
  if (pending) {
    if (pending.step === 'AWAITING_PASSWORD') {
      const username = pending.username!;
      const password = commandText.trim();
      pendingLogins.delete(from);

      await sock.sendMessage(from, { text: `🔐 Authenticating *${username}* with HROne Cloud...` });

      const loginRes = await loginWithHROne(username, password, 'uharvest');

      if (!loginRes.success || !loginRes.accessToken || !loginRes.employeeId) {
        pendingLogins.set(from, { step: 'AWAITING_USERNAME', timestamp: Date.now() });
        await sock.sendMessage(from, {
          text:
            `❌ *Login Failed:*\n\n${loginRes.error || 'Invalid credentials'}\n\n` +
            `Please reply with your *HROne Username / Employee Code* to try again:`,
        });
        return;
      }

      const db = await getDatabase();
      const existing = await db.collection('employees').findOne({ employeeId: loginRes.employeeId });

      if (existing) {
        await db.collection('employees').updateOne(
          { employeeId: loginRes.employeeId },
          {
            $set: {
              username: loginRes.username || username,
              password: password,
              jwtToken: loginRes.accessToken,
              refreshToken: loginRes.refreshToken || existing.refreshToken,
              tokenExpiry: loginRes.tokenExpiry,
              refreshTokenExpiry: loginRes.refreshTokenExpiry,
              whatsappLid: from,
              whatsappName: senderName,
              status: 'ACTIVE',
              updatedAt: new Date().toISOString(),
            },
          }
        );
      } else {
        await db.collection('employees').insertOne({
          employeeId: loginRes.employeeId,
          name: loginRes.name || username,
          username: loginRes.username || username,
          password: password,
          companyDomainCode: loginRes.domainCode || 'uharvest',
          jwtToken: loginRes.accessToken,
          refreshToken: loginRes.refreshToken || '',
          tokenExpiry: loginRes.tokenExpiry,
          refreshTokenExpiry: loginRes.refreshTokenExpiry,
          latitude: '28.5004327',
          longitude: '77.4150811',
          geoAccuracy: '12.126',
          geoLocation: '210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India',
          schedule: {
            active: true,
            checkInMin: '09:30',
            checkInMax: '09:55',
            checkOutMin: '19:00',
            checkOutMax: '19:30',
            workingDays: [1, 2, 3, 4, 5],
          },
          status: 'ACTIVE',
          whatsappLid: from,
          whatsappName: senderName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      await sock.sendMessage(from, {
        text: `🎉 *Connected as ${loginRes.name}* (ID: ${loginRes.employeeId})\nAuto-attendance is active.\n\n👉 Reply *status* to view card or *in* / *out* to punch`,
      });
      return;
    } else if (pending.step === 'AWAITING_USERNAME') {
      const username = commandText.trim();
      pendingLogins.set(from, { step: 'AWAITING_PASSWORD', username, timestamp: Date.now() });
      await sock.sendMessage(from, {
        text: `🔑 Username set to *${username}*.\n\nNow please reply with your *HROne Password*:\n\n_(Reply *cancel* anytime to abort)_`,
      });
      return;
    }
  }

  // 0c. STANDALONE "login" COMMAND: Trigger step-by-step flow
  if (cmd === 'login' || cmd === 'signin' || cmd === 'relogin') {
    pendingLogins.set(from, { step: 'AWAITING_USERNAME', timestamp: Date.now() });
    await sock.sendMessage(from, {
      text:
        `🔐 *HROne Login*\n\n` +
        `Please reply with your *HROne Username or Employee Code*:\n` +
        `👉 (Example: *E1885* or *9871251984*)\n\n` +
        `_(Reply *cancel* anytime to abort)_`,
    });
    return;
  }

  // 1. MATCH EMPLOYEE STRICTLY BY VERIFIED PHONE OR EXPLICIT LOGIN
  let matchedEmp = allEmployees.find((e) => {
    // a. Direct WhatsApp chat LID / JID match (set during login)
    const anyE = e as any;
    if (anyE.whatsappLid && anyE.whatsappLid === from) return true;
    if (anyE.whatsappJid && anyE.whatsappJid === from) return true;

    // b. Exact phone number digits match (if from has actual phone digits)
    if (senderLast10 && from.endsWith('@s.whatsapp.net')) {
      const userDigits = (e.username || '').replace(/\D/g, '');
      const mobileDigits = (e.mobileNumber || '').replace(/\D/g, '');
      if (userDigits.length >= 10 && userDigits.endsWith(senderLast10)) return true;
      if (mobileDigits.length >= 10 && mobileDigits.endsWith(senderLast10)) return true;
    }

    return false;
  });

  // 2. LINK / REGISTER COMMAND: link <employeeId or username>
  if (cmd.startsWith('link ') || cmd.startsWith('register ')) {
    const query = cmd.replace(/^(link|register)\s+/, '').trim().toLowerCase();
    const target = allEmployees.find(
      (e) =>
        String(e.employeeId) === query ||
        e.username.toLowerCase() === query ||
        e.name.toLowerCase().includes(query) ||
        (e.mobileNumber && e.mobileNumber.endsWith(query))
    );

    if (target) {
      const db = await getDatabase();
      await db.collection('employees').updateOne(
        { employeeId: target.employeeId },
        {
          $set: {
            whatsappLid: from,
            whatsappName: senderName,
            updatedAt: new Date().toISOString(),
          },
        }
      );

      await sock.sendMessage(from, {
        text: `✅ *Linked to ${target.name}* (ID: ${target.employeeId})\n\n👉 Reply *status* to view card or *in* / *out* to punch`,
      });
      return;
    } else {
      await sock.sendMessage(from, {
        text: `❌ Could not find employee matching *"${query}"*.\nPlease check your Employee ID or Username and try again.`,
      });
      return;
    }
  }

  // 2b. DIRECT ONE-LINE HROne LOGIN COMMAND: login <username> <password>
  if (cmd.startsWith('login ')) {
    const rawArgs = commandText.trim().slice(6).trim();
    const parts = rawArgs.split(/\s+/);
    const username = parts[0];
    const password = parts.slice(1).join(' ');

    if (!username || !password) {
      pendingLogins.set(from, { step: 'AWAITING_USERNAME', timestamp: Date.now() });
      await sock.sendMessage(from, {
        text: `🔐 Please reply with your *HROne Employee Code or Username or mobile*:`,
      });
      return;
    }

    await sock.sendMessage(from, { text: `🔐 Authenticating with HROne Cloud for *${username}*...` });

    const loginRes = await loginWithHROne(username, password, 'uharvest');

    if (!loginRes.success || !loginRes.accessToken || !loginRes.employeeId) {
      await sock.sendMessage(from, {
        text: `❌ *Login Failed:*\n\n${loginRes.error || 'Invalid credentials'}\n\nPlease verify your username/password and try again.`,
      });
      return;
    }

    const db = await getDatabase();
    const existing = await db.collection('employees').findOne({ employeeId: loginRes.employeeId });

    if (existing) {
      await db.collection('employees').updateOne(
        { employeeId: loginRes.employeeId },
        {
          $set: {
            username: loginRes.username || username,
            password: password,
            jwtToken: loginRes.accessToken,
            refreshToken: loginRes.refreshToken || existing.refreshToken,
            tokenExpiry: loginRes.tokenExpiry,
            refreshTokenExpiry: loginRes.refreshTokenExpiry,
            whatsappLid: from,
            whatsappName: senderName,
            status: 'ACTIVE',
            updatedAt: new Date().toISOString(),
          },
        }
      );
    } else {
      await db.collection('employees').insertOne({
        employeeId: loginRes.employeeId,
        name: loginRes.name || username,
        username: loginRes.username || username,
        password: password,
        companyDomainCode: loginRes.domainCode || 'uharvest',
        jwtToken: loginRes.accessToken,
        refreshToken: loginRes.refreshToken || '',
        tokenExpiry: loginRes.tokenExpiry,
        refreshTokenExpiry: loginRes.refreshTokenExpiry,
        latitude: '28.5004327',
        longitude: '77.4150811',
        geoAccuracy: '12.126',
        geoLocation: '210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India',
        schedule: {
          active: true,
          checkInMin: '09:30',
          checkInMax: '09:55',
          checkOutMin: '19:00',
          checkOutMax: '19:30',
          workingDays: [1, 2, 3, 4, 5],
        },
        status: 'ACTIVE',
        whatsappLid: from,
        whatsappName: senderName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    await sock.sendMessage(from, {
      text: `🎉 *Connected as ${loginRes.name}* (ID: ${loginRes.employeeId})\nAuto-attendance is active.\n\n👉 Reply *status* to view card or *in* / *out* to punch`,
    });
    return;
  }

  // If matched, ensure whatsappLid is saved to MongoDB for fast zero-latency future lookups
  if (matchedEmp && (matchedEmp as any).whatsappLid !== from) {
    try {
      const db = await getDatabase();
      await db.collection('employees').updateOne(
        { employeeId: matchedEmp.employeeId },
        { $set: { whatsappLid: from, whatsappName: senderName, updatedAt: new Date().toISOString() } }
      );
    } catch {
      // ignore
    }
  }

  // Pending Regularization Confirmation State
  const pendingReg = pendingRegularizations.get(from);
  if (pendingReg && matchedEmp) {
    if (cmd === 'yes' || cmd === 'y' || cmd === 'confirm' || cmd === 'regularize confirm' || cmd === '1') {
      pendingRegularizations.delete(from);
      const submitRes = await submitAttendanceRegularization(matchedEmp, pendingReg.dates, 'Tech Issue');
      if (submitRes.success) {
        await sock.sendMessage(from, {
          text: `✅ Regularization submitted for *${pendingReg.dates.length} date(s)* for approval.\n\n👉 Reply *status* for card or *logs* for history`,
        });
      } else {
        await sock.sendMessage(from, {
          text: `❌ Regularization failed: ${submitRes.error || 'Cloud error'}\n\n👉 Reply *regularize* to retry or *status* for card`,
        });
      }
      return;
    } else if (cmd === 'no' || cmd === 'n' || cmd === 'cancel' || cmd === 'abort') {
      pendingRegularizations.delete(from);
      await sock.sendMessage(from, { text: `❌ Regularization request cancelled.\n\n👉 Reply *status* for card or *regularize* to check again` });
      return;
    }
  }

  // 3. HELP / MENU
  if (cmd === 'help' || cmd === 'menu' || cmd === 'commands' || cmd === 'cmd' || cmd === 'hi' || cmd === 'hello') {
    const userLine = matchedEmp
      ? `👤 *${matchedEmp.name}* | Auto-Pilot: ${matchedEmp.schedule.active && matchedEmp.status === 'ACTIVE' ? '🟢' : '⏸️'}`
      : `🔒 *Not linked*`;

    const helpMsg =
      `📋 *HROne Commands*\n` +
      `${userLine}\n\n` +
      `• *in* / *out* – Punch attendance\n` +
      `• *status* – Today's punches\n` +
      `• *pause* / *resume* – Auto-pilot\n` +
      `• *regularize* – Absent days\n` +
      `• *logs* – Recent punches\n` +
      `• *refresh* – Extend session\n` +
      `• *login* – Link account\n\n` +
      `👉 Reply with any command (e.g. *status*, *in*, *out*)`;

    await sock.sendMessage(from, { text: helpMsg });
    return;
  }

  // PRIVACY GUARD: If sender is unlinked, trigger interactive login
  if (!matchedEmp) {
    pendingLogins.set(from, { step: 'AWAITING_USERNAME', timestamp: Date.now() });
    await sock.sendMessage(from, {
      text: `👋 Send your *HROne Employee Code* (e.g. *E1885*) to link your account:`,
    });
    return;
  }

  // 4. STATUS (Strictly for this sender only - Live HROne and MongoDB query)
  if (cmd === 'status' || cmd === 'today') {
    const db = await getDatabase();
    const istTime = getISTPunchTime();
    const todayStr = istTime.split('T')[0];

    // Query real live punch records from MongoDB for this employee today
    const todayLogs = await db
      .collection('punch_logs')
      .find({
        employeeId: matchedEmp.employeeId,
        $or: [
          { punchTime: { $regex: `^${todayStr}` } },
          { executedAt: { $gte: new Date(`${todayStr}T00:00:00.000Z`).toISOString() } },
        ],
        success: true,
      })
      .sort({ executedAt: 1 })
      .toArray();

    const inLog = todayLogs.find((l) => l.punchType === 'CHECK_IN');
    const outLog = todayLogs.find((l) => l.punchType === 'CHECK_OUT');

    let inStr = '⏳ Scheduled';
    if (inLog) {
      inStr = `✅ ${formatISTDisplay(inLog.punchTime || inLog.executedAt)}`;
    } else if (matchedEmp.todayPunch?.checkInStatus === 'SUCCESS' && matchedEmp.todayPunch.checkedInAt) {
      inStr = `✅ ${formatISTDisplay(matchedEmp.todayPunch.checkedInAt)}`;
    } else if (matchedEmp.todayPunch?.plannedCheckIn) {
      inStr = `⏳ ${matchedEmp.todayPunch.plannedCheckIn}`;
    }

    let outStr = '⏳ Scheduled';
    if (outLog) {
      outStr = `✅ ${formatISTDisplay(outLog.punchTime || outLog.executedAt)}`;
    } else if (matchedEmp.todayPunch?.checkOutStatus === 'SUCCESS' && matchedEmp.todayPunch.checkedOutAt) {
      outStr = `✅ ${formatISTDisplay(matchedEmp.todayPunch.checkedOutAt)}`;
    } else if (matchedEmp.todayPunch?.plannedCheckOut) {
      outStr = `⏳ ${matchedEmp.todayPunch.plannedCheckOut}`;
    }

    const statusMsg =
      `📊 *Status* (${todayStr})\n` +
      `• In: ${inStr}\n` +
      `• Out: ${outStr}\n` +
      `📍 ${matchedEmp.geoLocation || 'Office'}\n\n` +
      `👉 Reply *in* for Check-In, or *out* for Check-Out`;

    await sock.sendMessage(from, { text: statusMsg });
    return;
  }

  // 5. PUNCH IN (Strictly for this sender only - Live HROne API execution)
  if (cmd === 'punch in' || cmd === 'in' || cmd === 'check in' || cmd === 'checkin') {
    const res = await executePunch(matchedEmp, 'CHECK_IN', 'MANUAL');
    const replyMsg = res.success
      ? `🟢 Checked In at *${formatISTDisplay(res.punchTime)}*\n\n👉 Reply *out* to Check-Out or *status* for card`
      : `❌ Check-In Failed: ${res.error || 'Cloud error'}\n\n👉 Reply *in* to retry or *status* for card`;
    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 6. PUNCH OUT (Strictly for this sender only - Live HROne API execution)
  if (cmd === 'punch out' || cmd === 'out' || cmd === 'check out' || cmd === 'checkout') {
    const res = await executePunch(matchedEmp, 'CHECK_OUT', 'MANUAL');
    const replyMsg = res.success
      ? `🔴 Checked Out at *${formatISTDisplay(res.punchTime)}*\n\n👉 Reply *status* for summary or *logs* for history`
      : `❌ Check-Out Failed: ${res.error || 'Cloud error'}\n\n👉 Reply *out* to retry or *status* for card`;
    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 7. PAUSE AUTO-ATTENDANCE (Strictly for this sender only)
  if (
    cmd === 'pause' ||
    cmd === 'stop' ||
    cmd === 'off' ||
    cmd === 'leave' ||
    cmd === 'disable' ||
    cmd === 'pause today' ||
    cmd === 'pause attendance'
  ) {
    const db = await getDatabase();
    await db.collection('employees').updateOne(
      { employeeId: matchedEmp.employeeId },
      {
        $set: {
          status: 'PAUSED',
          'schedule.active': false,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    const pauseMsg = `⏸️ Auto-pilot *paused* for today.\n\n👉 Reply *resume* to turn back on or *in* / *out* to punch`;
    await sock.sendMessage(from, { text: pauseMsg });
    return;
  }

  // 8. RESUME AUTO-ATTENDANCE (Strictly for this sender only)
  if (
    cmd === 'resume' ||
    cmd === 'start' ||
    cmd === 'on' ||
    cmd === 'active' ||
    cmd === 'enable' ||
    cmd === 'unpause' ||
    cmd === 'resume attendance'
  ) {
    const db = await getDatabase();
    await db.collection('employees').updateOne(
      { employeeId: matchedEmp.employeeId },
      {
        $set: {
          status: 'ACTIVE',
          'schedule.active': true,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    const resumeMsg = `▶️ Auto-pilot *resumed*.\n\n👉 Reply *status* to view scheduled times or *pause* to pause`;
    await sock.sendMessage(from, { text: resumeMsg });
    return;
  }

  // 9. REFRESH LOGIN SESSION (Strictly for this sender only)
  if (cmd === 'refresh') {
    const res = await refreshHROneToken(matchedEmp);
    const replyMsg = res.success
      ? `🔄 Session extended for 7 days.\n\n👉 Reply *status* or *in* / *out* to punch`
      : `❌ Token refresh failed: ${res.error}\n\n👉 Reply *login* to re-authenticate`;
    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 10. LOGS (Strictly for this sender only)
  if (cmd === 'logs' || cmd === 'history') {
    const db = await getDatabase();
    const logs = await db
      .collection('punch_logs')
      .find({ employeeId: matchedEmp.employeeId })
      .sort({ executedAt: -1 })
      .limit(5)
      .toArray();

    if (logs.length === 0) {
      await sock.sendMessage(from, { text: `📜 No punch logs found for *${matchedEmp.name}*.` });
      return;
    }

    let replyMsg = `📜 *Recent Punches*\n`;
    for (const l of logs) {
      const timeStr = formatISTDateTime(l.punchTime || l.executedAt);
      const icon = l.success ? '✅' : '❌';
      const type = l.punchType === 'CHECK_IN' ? 'In' : 'Out';
      replyMsg += `• ${icon} ${type}: ${timeStr}\n`;
    }
    replyMsg += `\n👉 Reply *status* for today's card or *in* / *out* to punch`;

    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 11. REGULARIZE ATTENDANCE COMMAND: Query calendar & offer interactive submission
  if (
    cmd === 'regularize' ||
    cmd === 'regularise' ||
    cmd === 'ar' ||
    cmd === 'absent' ||
    cmd === 'missing punch' ||
    cmd === 'regularization'
  ) {
    await sock.sendMessage(from, {
      text: `⏳ Fetching attendance calendar & checking unregularized days for *${matchedEmp.name}*...`,
    });

    const now = new Date();
    const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
    const [currY, currM] = istDateStr.split('-').map(Number);

    const calendarRes = await fetchAttendanceCalendarDetails(matchedEmp, currY, currM);

    if (!calendarRes.success) {
      await sock.sendMessage(from, {
        text: `❌ *Failed to fetch attendance calendar:*\n\n${calendarRes.error}`,
      });
      return;
    }

    const unregDays = extractUnregularizedDays(calendarRes.data);

    if (unregDays.length === 0) {
      await sock.sendMessage(from, {
        text: `✅ No absent or missed punch days found for this month.`,
      });
      return;
    }

    const datesList = unregDays.map((d) => d.date);
    pendingRegularizations.set(from, {
      employeeId: matchedEmp.employeeId,
      dates: datesList,
      timestamp: Date.now(),
    });

    const datesStr = unregDays.map((d) => `• ${d.date} (${d.status})`).join('\n');
    await sock.sendMessage(from, {
      text: `📅 *Absent Days:*\n${datesStr}\n\nReply *yes* to regularize or *cancel*.`,
    });
    return;
  }

  // Block any attempts to access team-wide data
  if (
    cmd === 'team' ||
    cmd === 'all in' ||
    cmd === 'all out' ||
    cmd === 'all punch in' ||
    cmd === 'pause all' ||
    cmd === 'resume all'
  ) {
    await sock.sendMessage(from, {
      text: `🔒 Team-wide commands are restricted for privacy.`,
    });
    return;
  }

  // Unknown command fallback
  await sock.sendMessage(from, {
    text: `❓ Unknown command.\n\n👉 Reply *in*, *out*, *status*, or *help*`,
  });
}

async function syncAuthFromMongoDB() {
  try {
    const db = await getDatabase();
    const docs = await db.collection('whatsapp_auth_store').find({}).toArray();
    if (docs.length > 0) {
      if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
      for (const doc of docs) {
        const filePath = path.join(AUTH_DIR, String(doc._id));
        fs.writeFileSync(filePath, Buffer.from(doc.content, 'base64'));
      }
      console.log(`[WhatsApp Bot] Restored ${docs.length} auth credential files from MongoDB.`);
    }
  } catch (err) {
    console.warn('[WhatsApp Bot] Could not restore auth from MongoDB:', err);
  }
}

async function syncAuthToMongoDB() {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;
    const files = fs.readdirSync(AUTH_DIR);
    const db = await getDatabase();
    for (const file of files) {
      const fullPath = path.join(AUTH_DIR, file);
      if (fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath).toString('base64');
        await db.collection('whatsapp_auth_store').updateOne(
          { _id: file as unknown as import('mongodb').ObjectId },
          { $set: { content, updatedAt: new Date() } },
          { upsert: true }
        );
      }
    }
  } catch (err) {
    console.warn('[WhatsApp Bot] Could not backup auth to MongoDB:', err);
  }
}

/**
 * Start the WhatsApp Bot Socket
 */
export async function startWhatsAppBot() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  // Restore any previous session from MongoDB first
  await syncAuthFromMongoDB();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await syncAuthToMongoDB();
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n======================================================');
      console.log('📱 SCAN THIS QR CODE WITH YOUR WHATSAPP TO LINK BOT:');
      console.log('WhatsApp > Settings / Menu > Linked Devices > Link a Device');
      console.log('======================================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\n======================================================\n');

      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
        const db = await getDatabase();
        await db.collection('whatsapp_session').updateOne(
          { _id: 'current_session' as unknown as import('mongodb').ObjectId },
          {
            $set: {
              status: 'PAIRING',
              qrDataUrl,
              updatedAt: new Date().toISOString(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error('[WhatsApp Bot] Failed to save QR to MongoDB:', err);
      }
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log(
        `[WhatsApp Bot] Connection closed. Reason: ${(lastDisconnect?.error as Boom)?.message || 'Unknown'}. Reconnecting: ${shouldReconnect}`
      );

      try {
        const db = await getDatabase();
        await db.collection('whatsapp_session').updateOne(
          { _id: 'current_session' as unknown as import('mongodb').ObjectId },
          {
            $set: {
              status: 'DISCONNECTED',
              qrDataUrl: null,
              updatedAt: new Date().toISOString(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        // ignore
      }

      if (shouldReconnect) {
        setTimeout(startWhatsAppBot, 3000);
      } else {
        console.log('[WhatsApp Bot] Logged out. Clearing auth store...');
        try {
          const db = await getDatabase();
          await db.collection('whatsapp_auth_store').deleteMany({});
          if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    } else if (connection === 'open') {
      console.log('\n✅ [WhatsApp Bot] Connected successfully to WhatsApp!');
      console.log('🤖 Send "help" to this number from any chat to interact.\n');

      try {
        const db = await getDatabase();
        const userJid = sock?.user?.id || '';
        const phoneNumber = userJid.split(':')[0] || userJid.split('@')[0];
        await db.collection('whatsapp_session').updateOne(
          { _id: 'current_session' as unknown as import('mongodb').ObjectId },
          {
            $set: {
              status: 'CONNECTED',
              phoneNumber: phoneNumber ? `+${phoneNumber}` : 'Connected',
              qrDataUrl: null,
              updatedAt: new Date().toISOString(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error('[WhatsApp Bot] Failed to save connected state to DB:', err);
      }
    }
  });

  // Listen for incoming messages
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      // Ignore messages sent by the bot itself
      if (msg.key.fromMe) continue;
      // Don't respond to status broadcasts
      if (msg.key.remoteJid === 'status@broadcast') continue;
      // Don't respond in group chats (attendance commands are 1-on-1 private only)
      if (msg.key.remoteJid?.endsWith('@g.us')) continue;

      const from = msg.key.remoteJid;
      if (!from) continue;

      // Extract text content from various message types
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';

      if (!text) continue;

      const senderName = msg.pushName || 'User';
      try {
        await handleCommand(from, text, senderName);
      } catch (err) {
        console.error('[WhatsApp Bot] Error handling command:', err);
      }
    }
  });

  return sock;
}

// Auto-run if executed directly
if (require.main === module) {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
  startWhatsAppBot().catch((err) => console.error('[WhatsApp Bot] Fatal:', err));
}
