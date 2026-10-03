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
import { isHolidayToday } from '../lib/db/holidays';
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

export interface WhatsAppLocationData {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  accuracy?: number;
}

interface PendingSaturdayLocationState {
  employeeId: number;
  timestamp: number;
}
const pendingSaturdayLocations = new Map<string, PendingSaturdayLocationState>();

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
 * Calculate distance in meters between a point and the Noida Sector 142 Office (28.5004327, 77.4150811)
 */
function getDistanceFromOfficeMeters(lat: number, lng: number): number {
  const officeLat = 28.5004327;
  const officeLng = 77.4150811;
  const R = 6371e3; // meters
  const phi1 = (lat * Math.PI) / 180;
  const phi2 = (officeLat * Math.PI) / 180;
  const deltaPhi = ((officeLat - lat) * Math.PI) / 180;
  const deltaLambda = ((officeLng - lng) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Reverse geocode a GPS point or return clean fallback name
 */
async function resolveLocationAddress(
  lat: number,
  lng: number,
  fallbackName?: string,
  fallbackAddress?: string
): Promise<string> {
  if (fallbackAddress && fallbackAddress.trim().length > 5) return fallbackAddress.trim();
  if (fallbackName && fallbackName.trim().length > 5) return fallbackName.trim();
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: { 'User-Agent': 'HROneAttendanceBot/1.0' },
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.display_name) {
        return data.display_name;
      }
    }
  } catch {
    // fallback
  }
  return fallbackName || fallbackAddress || `Home / Remote (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}

/**
 * Get representative residential NCR coordinates for a typed address/area safely away from Sector 142
 */
function getCoordinatesForAddress(address: string): { latitude: string; longitude: string } {
  const lower = address.toLowerCase();
  let baseLat = 28.6289;
  let baseLng = 77.3650;

  if (lower.includes('indirapuram') || lower.includes('ghaziabad') || lower.includes('vaishali') || lower.includes('vasundhara')) {
    baseLat = 28.6425;
    baseLng = 77.3732;
  } else if (lower.includes('gaur') || lower.includes('greater noida') || lower.includes('grenowest') || lower.includes('noida ext')) {
    baseLat = 28.6080;
    baseLng = 77.4320;
  } else if (lower.includes('sector 62') || lower.includes('sec 62') || lower.includes('sector 63')) {
    baseLat = 28.6275;
    baseLng = 77.3725;
  } else if (lower.includes('sector 50') || lower.includes('sector 76') || lower.includes('sector 75') || lower.includes('sector 78')) {
    baseLat = 28.5680;
    baseLng = 77.3750;
  } else if (lower.includes('gurgaon') || lower.includes('gurugram')) {
    baseLat = 28.4595;
    baseLng = 77.0266;
  } else if (lower.includes('delhi')) {
    baseLat = 28.6353;
    baseLng = 77.2250;
  } else if (lower.includes('faridabad')) {
    baseLat = 28.4089;
    baseLng = 77.3178;
  } else {
    // Random residential NCR anchor safely away from Sector 142
    baseLat = 28.5800 + (Math.random() - 0.5) * 0.06;
    baseLng = 77.3400 + (Math.random() - 0.5) * 0.06;
  }

  const jitterLat = (Math.random() - 0.5) * 0.0006;
  const jitterLng = (Math.random() - 0.5) * 0.0006;

  return {
    latitude: (baseLat + jitterLat).toFixed(7),
    longitude: (baseLng + jitterLng).toFixed(7),
  };
}

/**
 * Handle incoming WhatsApp commands with strict per-employee privacy and data isolation
 */
async function handleCommand(
  from: string,
  commandText: string,
  senderName: string,
  locationData?: WhatsAppLocationData
) {
  if (!sock) return;

  const cmd = commandText.trim().toLowerCase();
  console.log(`[WhatsApp Bot] Received command from ${senderName} (${from}): "${commandText}"`);

  const allEmployees = await getAllEmployees();
  const cleanSenderDigits = from.replace(/\D/g, '');
  const senderLast10 = cleanSenderDigits.length >= 10 ? cleanSenderDigits.slice(-10) : '';

  // 0. CANCEL / ABORT / RESET / LOGOUT
  if (cmd === 'cancel' || cmd === 'abort' || cmd === 'reset' || cmd === 'logout') {
    pendingLogins.delete(from);
    pendingSaturdayLocations.delete(from);

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

  // Pending Saturday Location Confirmation State
  const pendingSat = pendingSaturdayLocations.get(from);
  if (pendingSat && matchedEmp) {
    if (cmd === 'skip' || cmd === 'cancel' || cmd === 'abort') {
      pendingSaturdayLocations.delete(from);
      await sock.sendMessage(from, {
        text: `👍 Saturday location setup skipped. Saturday auto-punch remains active.\n\n👉 Share a *Location Pin 📎* anytime to update your Saturday location.`,
      });
      return;
    }

    if (cmd === 'ok' || cmd === 'keep') {
      pendingSaturdayLocations.delete(from);
      await sock.sendMessage(from, {
        text: `✅ Current Saturday location retained.\n\n👉 Reply *status* to view your card.`,
      });
      return;
    }

    // 1. WhatsApp Location Pin received
    if (locationData) {
      const lat = locationData.latitude;
      const lng = locationData.longitude;
      const acc = locationData.accuracy || 15.0;

      // Distance from Sector 142 Office check
      if (getDistanceFromOfficeMeters(lat, lng) < 400) {
        await sock.sendMessage(from, {
          text:
            `⚠️ *Office Location Detected!*\n\n` +
            `The GPS pin you sent is at the office (Sector 142). Management requirement states Saturday location *must not* be the office address.\n\n` +
            `Please share your *Home/Remote location pin (📎)* or reply with your home area address.`,
        });
        return;
      }

      const resolvedAddress = await resolveLocationAddress(
        lat,
        lng,
        locationData.name,
        locationData.address
      );

      const db = await getDatabase();
      await db.collection('employees').updateOne(
        { employeeId: matchedEmp.employeeId },
        {
          $set: {
            saturdayLatitude: lat.toFixed(7),
            saturdayLongitude: lng.toFixed(7),
            saturdayGeoAccuracy: acc.toFixed(3),
            saturdayGeoLocation: resolvedAddress,
            updatedAt: new Date().toISOString(),
          },
        }
      );
      pendingSaturdayLocations.delete(from);

      await sock.sendMessage(from, {
        text:
          `✅ *Saturday Location Saved from WhatsApp Pin!* 📍\n\n` +
          `• *Location:* ${resolvedAddress}\n` +
          `• *Coordinates:* ${lat.toFixed(6)}, ${lng.toFixed(6)}\n\n` +
          `Your Saturday punches will strictly use this location instead of the office.\n\n` +
          `👉 Reply *status* for today's summary or *sat off* to disable`,
      });
      return;
    }

    // 2. User replied with a text address
    if (cmd && cmd !== '__location_pin__') {
      const lower = commandText.trim().toLowerCase();
      if (lower.includes('sector 142') || lower.includes('altf') || lower.includes('210-211')) {
        await sock.sendMessage(from, {
          text:
            `⚠️ *Office Address Not Allowed!*\n\n` +
            `Management requirement states Saturday location *must not* be the office address.\n\n` +
            `Please share your *Home Location Pin (📎)* or reply with your home area address.`,
        });
        return;
      }

      const coords = getCoordinatesForAddress(commandText.trim());
      const db = await getDatabase();
      await db.collection('employees').updateOne(
        { employeeId: matchedEmp.employeeId },
        {
          $set: {
            saturdayLatitude: coords.latitude,
            saturdayLongitude: coords.longitude,
            saturdayGeoAccuracy: '15.000',
            saturdayGeoLocation: commandText.trim(),
            updatedAt: new Date().toISOString(),
          },
        }
      );
      pendingSaturdayLocations.delete(from);

      await sock.sendMessage(from, {
        text:
          `✅ *Saturday Location Saved!* 📍\n\n` +
          `• *Location:* ${commandText.trim()}\n` +
          `• *Coordinates:* ${coords.latitude}, ${coords.longitude}\n\n` +
          `Your Saturday punches will use this remote location instead of the office.\n\n` +
          `👉 Reply *status* for card or *sat off* to disable`,
      });
      return;
    }
  }

  // If matched employee sends a Location Pin anytime (outside pending state)
  if (locationData && matchedEmp) {
    const lat = locationData.latitude;
    const lng = locationData.longitude;
    const acc = locationData.accuracy || 15.0;

    if (getDistanceFromOfficeMeters(lat, lng) < 400) {
      await sock.sendMessage(from, {
        text:
          `⚠️ *Office Location Detected!*\n\n` +
          `The GPS pin you sent is at the office (Sector 142). Saturday location *must not* be the office address.\n\n` +
          `Please share your *Home/Remote location pin (📎)*.`,
      });
      return;
    }

    const resolvedAddress = await resolveLocationAddress(
      lat,
      lng,
      locationData.name,
      locationData.address
    );

    const db = await getDatabase();
    await db.collection('employees').updateOne(
      { employeeId: matchedEmp.employeeId },
      {
        $set: {
          saturdayLatitude: lat.toFixed(7),
          saturdayLongitude: lng.toFixed(7),
          saturdayGeoAccuracy: acc.toFixed(3),
          saturdayGeoLocation: resolvedAddress,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    await sock.sendMessage(from, {
      text:
        `📍 *Saturday Location Updated via GPS Pin!* ✅\n\n` +
        `• *Location:* ${resolvedAddress}\n` +
        `• *Coordinates:* ${lat.toFixed(6)}, ${lng.toFixed(6)}\n\n` +
        `Saturday punches will use this pin instead of the office.\n\n` +
        `👉 Reply *status* to view your card`,
    });
    return;
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
      `• *sat on* / *sat off* – Saturday auto-punch\n` +
      `• *sat loc* – View/update Saturday location\n` +
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

    const holidayCheck = await isHolidayToday(matchedEmp.employeeId, todayStr, matchedEmp);

    let inStr = holidayCheck.isHoliday ? `🌴 Holiday (${holidayCheck.holidayName})` : '⏳ Scheduled';
    if (inLog) {
      inStr = `✅ ${formatISTDisplay(inLog.punchTime || inLog.executedAt)}`;
    } else if (matchedEmp.todayPunch?.checkInStatus === 'SUCCESS' && matchedEmp.todayPunch.checkedInAt) {
      inStr = `✅ ${formatISTDisplay(matchedEmp.todayPunch.checkedInAt)}`;
    } else if (matchedEmp.todayPunch?.plannedCheckIn && !holidayCheck.isHoliday) {
      inStr = `⏳ ${matchedEmp.todayPunch.plannedCheckIn}`;
    }

    let outStr = holidayCheck.isHoliday ? `🌴 Holiday (${holidayCheck.holidayName})` : '⏳ Scheduled';
    if (outLog) {
      outStr = `✅ ${formatISTDisplay(outLog.punchTime || outLog.executedAt)}`;
    } else if (matchedEmp.todayPunch?.checkOutStatus === 'SUCCESS' && matchedEmp.todayPunch.checkedOutAt) {
      outStr = `✅ ${formatISTDisplay(matchedEmp.todayPunch.checkedOutAt)}`;
    } else if (matchedEmp.todayPunch?.plannedCheckOut && !holidayCheck.isHoliday) {
      outStr = `⏳ ${matchedEmp.todayPunch.plannedCheckOut}`;
    }

    const isSatEnabled = (matchedEmp.schedule?.workingDays || [1, 2, 3, 4, 5]).includes(6);
    const dayOfWeek = new Date(`${todayStr}T12:00:00+05:30`).getDay();
    const isSaturday = dayOfWeek === 6;

    const holidayLine = holidayCheck.isHoliday ? `• 🌴 Holiday: *${holidayCheck.holidayName}*\n` : '';
    let locLine = `📍 Office: ${matchedEmp.geoLocation || 'Office'}\n`;
    if (isSaturday && matchedEmp.saturdayGeoLocation) {
      locLine = `📍 Today's Punch Location: *${matchedEmp.saturdayGeoLocation}* (Saturday Remote)\n`;
    } else if (isSatEnabled) {
      locLine += `📍 Saturday Remote: ${matchedEmp.saturdayGeoLocation ? `*${matchedEmp.saturdayGeoLocation}*` : '⚠️ _Not set (share pin 📎)_'}\n`;
    }

    const statusMsg =
      `📊 *Status* (${todayStr})\n` +
      holidayLine +
      `• In: ${inStr}\n` +
      `• Out: ${outStr}\n` +
      `• Saturday Auto-Punch: ${isSatEnabled ? '🟢 Enabled' : '⚪ Disabled'}\n` +
      locLine +
      `\n👉 Reply *in* for Check-In, or *out* for Check-Out`;

    await sock.sendMessage(from, { text: statusMsg });
    return;
  }

  // 5. PUNCH IN (Strictly for this sender only - Live HROne API execution)
  if (cmd === 'punch in' || cmd === 'in' || cmd === 'check in' || cmd === 'checkin') {
    const res = await executePunch(matchedEmp, 'CHECK_IN', 'MANUAL');
    const loc = matchedEmp.geoLocation || 'Office';
    const replyMsg = res.success
      ? `🌅 *Good morning ${matchedEmp.name}!* ☀️\n\n🟢 Checked In at *${formatISTDisplay(res.punchTime)}*\n📍 Location: *${loc}*\n\n👉 Reply *out* to Check-Out or *status* for card`
      : `🌅 *Good morning ${matchedEmp.name}!*\n\n❌ Check-In Failed: ${res.error || 'Cloud error'}\n📍 Location: *${loc}*\n\n👉 Reply *in* to retry or *status* for card`;
    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 6. PUNCH OUT (Strictly for this sender only - Live HROne API execution)
  if (cmd === 'punch out' || cmd === 'out' || cmd === 'check out' || cmd === 'checkout') {
    const res = await executePunch(matchedEmp, 'CHECK_OUT', 'MANUAL');
    const loc = matchedEmp.geoLocation || 'Office';
    const replyMsg = res.success
      ? `🌆 *Good evening ${matchedEmp.name}!* 🌙\n\n🔴 Checked Out at *${formatISTDisplay(res.punchTime)}*\n📍 Location: *${loc}*\n\n👉 Reply *status* for summary or *logs* for history`
      : `🌆 *Good evening ${matchedEmp.name}!*\n\n❌ Check-Out Failed: ${res.error || 'Cloud error'}\n📍 Location: *${loc}*\n\n👉 Reply *out* to retry or *status* for card`;
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

    const pauseMsg = `⏸️ Auto-pilot *paused* and you have to send resume again when needed.\n\n👉 Reply *resume* to turn back on or *in* / *out* to punch`;
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

  // 8b. TOGGLE SATURDAY AUTO-ATTENDANCE (Strictly for this sender only)
  if (
    cmd === 'sat on' ||
    cmd === 'saturday on' ||
    cmd === 'enable sat' ||
    cmd === 'enable saturday' ||
    cmd === 'sat punch on'
  ) {
    const currentDays = matchedEmp.schedule?.workingDays || [1, 2, 3, 4, 5];
    const newDays = Array.from(new Set([...currentDays, 6])).sort();
    const db = await getDatabase();
    await db.collection('employees').updateOne(
      { employeeId: matchedEmp.employeeId },
      {
        $set: {
          'schedule.workingDays': newDays,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    pendingSaturdayLocations.set(from, {
      employeeId: matchedEmp.employeeId,
      timestamp: Date.now(),
    });

    if (matchedEmp.saturdayGeoLocation) {
      const msg =
        `📅 *Saturday Auto-Punch: Enabled* for *${matchedEmp.name}*!\n\n` +
        `📍 *Current Saturday Location:*\n_${matchedEmp.saturdayGeoLocation}_\n\n` +
        `⚠️ *Requirement:* Saturday location *must not* be the office address.\n\n` +
        `👉 Share a *Location Pin (📎)* to update it, or reply *ok* to keep this location.`;
      await sock.sendMessage(from, { text: msg });
    } else {
      const msg =
        `📅 *Saturday Auto-Punch: Enabled* for *${matchedEmp.name}*!\n\n` +
        `⚠️ *Saturday Location Required:*\n` +
        `Saturday punches *must not* show the office address.\n\n` +
        `📍 *Please send your Saturday location now:*\n` +
        `• 📌 Tap *📎* (or *+* on iPhone) ➔ *Location* ➔ *Send your current location* (from home)\n` +
        `• OR reply with your *Home Area / Address* (e.g. \`Gaur City, Greater Noida\` or \`Indirapuram, Ghaziabad\`)`;
      await sock.sendMessage(from, { text: msg });
    }
    return;
  }

  if (
    cmd === 'sat off' ||
    cmd === 'saturday off' ||
    cmd === 'disable sat' ||
    cmd === 'disable saturday' ||
    cmd === 'sat punch off'
  ) {
    pendingSaturdayLocations.delete(from);
    const currentDays = matchedEmp.schedule?.workingDays || [1, 2, 3, 4, 5];
    const newDays = currentDays.filter((d) => d !== 6);
    const db = await getDatabase();
    await db.collection('employees').updateOne(
      { employeeId: matchedEmp.employeeId },
      {
        $set: {
          'schedule.workingDays': newDays,
          updatedAt: new Date().toISOString(),
        },
      }
    );
    const msg = `📅 *Saturday Auto-Punch: Disabled* for *${matchedEmp.name}*.\n\nAttendance will skip Saturdays (Mon–Fri only).\n\n👉 Reply *sat on* to enable or *status* for today's summary`;
    await sock.sendMessage(from, { text: msg });
    return;
  }

  // 8c. VIEW OR SET SATURDAY LOCATION DIRECTLY
  if (cmd === 'sat loc' || cmd === 'sat location' || cmd.startsWith('sat loc ') || cmd.startsWith('sat location ')) {
    const rawLoc = commandText.replace(/^sat\s+(location|loc)\s*/i, '').trim();
    if (!rawLoc) {
      if (matchedEmp.saturdayGeoLocation) {
        await sock.sendMessage(from, {
          text:
            `📍 *Saturday Location for ${matchedEmp.name}:*\n_${matchedEmp.saturdayGeoLocation}_\n\n` +
            `• GPS: ${matchedEmp.saturdayLatitude || 'Auto'}, ${matchedEmp.saturdayLongitude || 'Auto'}\n\n` +
            `👉 Share a *Location Pin 📎* or reply *sat loc <address>* to update.`,
        });
      } else {
        pendingSaturdayLocations.set(from, { employeeId: matchedEmp.employeeId, timestamp: Date.now() });
        await sock.sendMessage(from, {
          text:
            `📍 *No Saturday location set yet for ${matchedEmp.name}.*\n\n` +
            `⚠️ Saturday location *must not* be the office address.\n\n` +
            `Please share your location:\n` +
            `• 📌 Tap *📎* ➔ *Location* to send GPS pin, OR\n` +
            `• ✍️ Reply *sat loc <your home address>*`,
        });
      }
      return;
    }

    const lower = rawLoc.toLowerCase();
    if (lower.includes('sector 142') || lower.includes('altf') || lower.includes('210-211')) {
      await sock.sendMessage(from, {
        text: `⚠️ Saturday location cannot be the office address. Please provide your home/remote location.`,
      });
      return;
    }

    const coords = getCoordinatesForAddress(rawLoc);
    const db = await getDatabase();
    await db.collection('employees').updateOne(
      { employeeId: matchedEmp.employeeId },
      {
        $set: {
          saturdayLatitude: coords.latitude,
          saturdayLongitude: coords.longitude,
          saturdayGeoAccuracy: '15.000',
          saturdayGeoLocation: rawLoc,
          updatedAt: new Date().toISOString(),
        },
      }
    );
    pendingSaturdayLocations.delete(from);

    await sock.sendMessage(from, {
      text:
        `✅ *Saturday Location Updated!* 📍\n\n` +
        `• *Location:* ${rawLoc}\n` +
        `• *Coordinates:* ${coords.latitude}, ${coords.longitude}\n\n` +
        `Saturday punches will use this remote address instead of the office.`,
    });
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

      // Extract text content or location message
      const locMsg = msg.message?.locationMessage || msg.message?.liveLocationMessage;
      let text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';

      let locationData: WhatsAppLocationData | undefined;
      if (
        locMsg &&
        typeof locMsg.degreesLatitude === 'number' &&
        typeof locMsg.degreesLongitude === 'number'
      ) {
        const regularLoc = locMsg as { name?: string | null; address?: string | null; accuracyInMeters?: number | null };
        locationData = {
          latitude: locMsg.degreesLatitude,
          longitude: locMsg.degreesLongitude,
          name: regularLoc.name || undefined,
          address: regularLoc.address || undefined,
          accuracy: regularLoc.accuracyInMeters || undefined,
        };
        if (!text) {
          text = '__LOCATION_PIN__';
        }
      }

      if (!text && !locationData) continue;

      const senderName = msg.pushName || 'User';
      try {
        await handleCommand(from, text, senderName, locationData);
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
