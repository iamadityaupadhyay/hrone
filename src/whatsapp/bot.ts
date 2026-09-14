import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { getAllEmployees } from '../lib/db/employees';
import { executePunch, getISTPunchTime } from '../lib/hrone/punch';
import { refreshHROneToken } from '../lib/hrone/token';
import { getDatabase } from '../lib/mongodb';

const AUTH_DIR = path.resolve(process.cwd(), '.whatsapp_auth');
let sock: WASocket | null = null;

/**
 * Send a notification message via WhatsApp if bot is connected
 */
export async function sendWhatsAppNotification(message: string, recipientJid?: string) {
  if (!sock) {
    console.warn('[WhatsApp Bot] Bot not connected. Notification skipped.');
    return false;
  }

  try {
    const targetNumber = recipientJid || process.env.WHATSAPP_NOTIFY_NUMBER;
    if (!targetNumber) {
      console.warn('[WhatsApp Bot] No WHATSAPP_NOTIFY_NUMBER configured.');
      return false;
    }

    const jid = targetNumber.includes('@s.whatsapp.net')
      ? targetNumber
      : `${targetNumber.replace(/\D/g, '')}@s.whatsapp.net`;

    await sock.sendMessage(jid, { text: message });
    console.log(`[WhatsApp Bot] Sent notification to ${jid}`);
    return true;
  } catch (err) {
    console.error('[WhatsApp Bot] Failed to send notification:', err);
    return false;
  }
}

/**
 * Handle incoming WhatsApp commands
 */
async function handleCommand(from: string, commandText: string, senderName: string) {
  if (!sock) return;

  const cmd = commandText.trim().toLowerCase();
  console.log(`[WhatsApp Bot] Received command from ${senderName} (${from}): "${commandText}"`);

  const allEmployees = await getAllEmployees();
  const cleanSenderDigits = from.replace(/\D/g, '');
  const senderLast10 = cleanSenderDigits.slice(-10);

  // Identify employee if their username or mobileNumber matches the sender's phone number
  const matchedEmp = allEmployees.find((e) => {
    const userDigits = (e.username || '').replace(/\D/g, '');
    const mobileDigits = (e.mobileNumber || '').replace(/\D/g, '');
    return (
      (userDigits.length >= 10 && userDigits.endsWith(senderLast10)) ||
      (mobileDigits.length >= 10 && mobileDigits.endsWith(senderLast10))
    );
  });

  const displayName = matchedEmp ? matchedEmp.name : senderName;

  // 1. HELP / MENU
  if (cmd === 'help' || cmd === 'menu' || cmd === 'hi' || cmd === 'hello') {
    const greeting = matchedEmp ? `👋 *Hello ${matchedEmp.name}!*` : `👋 *Hello ${senderName}!*`;
    const helpMsg = `${greeting}\n🤖 *HROne Personal Attendance Bot*\n\n` +
      `Here are your commands:\n\n` +
      `📌 *status* - View your attendance status today\n` +
      `🟢 *in* (or *punch in*) - Mark your Check-In now\n` +
      `🔴 *out* (or *punch out*) - Mark your Check-Out now\n` +
      `🔄 *refresh* - Extend your login session\n` +
      `📜 *logs* - View recent attendance logs\n` +
      `👥 *team* - View attendance for all team members\n` +
      `⚡ *all in* / *all out* - Mark attendance for entire team\n\n` +
      `_Type any command to execute!_`;

    await sock.sendMessage(from, { text: helpMsg });
    return;
  }

  // 2. STATUS
  if (cmd === 'status' || cmd === 'today') {
    const istTime = getISTPunchTime();
    const todayStr = istTime.split('T')[0];

    // If sender is a recognized employee, show their personal status
    if (matchedEmp) {
      const inDone = matchedEmp.todayPunch?.date === todayStr && matchedEmp.todayPunch.checkInStatus === 'SUCCESS';
      const outDone = matchedEmp.todayPunch?.date === todayStr && matchedEmp.todayPunch.checkOutStatus === 'SUCCESS';

      let statusMsg = `📊 *Your Attendance Status (${todayStr})*\n`;
      statusMsg += `👤 *${matchedEmp.name}* (ID: ${matchedEmp.employeeId})\n\n`;
      statusMsg += `• Check-In: ${inDone ? `✅ Done at ${matchedEmp.todayPunch?.checkedInAt?.split('T')[1]?.slice(0, 5)} IST` : `⏳ Scheduled (${matchedEmp.todayPunch?.plannedCheckIn || matchedEmp.schedule.checkInMin})`}\n`;
      statusMsg += `• Check-Out: ${outDone ? `✅ Done at ${matchedEmp.todayPunch?.checkedOutAt?.split('T')[1]?.slice(0, 5)} IST` : `⏳ Scheduled (${matchedEmp.todayPunch?.plannedCheckOut || matchedEmp.schedule.checkOutMin})`}\n`;

      if (matchedEmp.refreshTokenExpiry) {
        const daysLeft = Math.ceil(
          (new Date(matchedEmp.refreshTokenExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        statusMsg += `• Session: ${daysLeft > 0 ? `🟢 ${daysLeft} days left` : '🔴 Expired'}\n`;
      }
      statusMsg += `\n_Send *in* to punch in, or *out* to punch out!_`;

      await sock.sendMessage(from, { text: statusMsg });
      return;
    }

    // Otherwise show whole team
    const active = allEmployees.filter((e) => e.status === 'ACTIVE');
    let statusMsg = `📊 *Team Attendance Status (${todayStr})*\n\n`;
    for (const emp of active) {
      const inDone = emp.todayPunch?.date === todayStr && emp.todayPunch.checkInStatus === 'SUCCESS';
      const outDone = emp.todayPunch?.date === todayStr && emp.todayPunch.checkOutStatus === 'SUCCESS';
      statusMsg += `👤 *${emp.name}*: In ${inDone ? '✅' : '⏳'} | Out ${outDone ? '✅' : '⏳'}\n`;
    }
    await sock.sendMessage(from, { text: statusMsg });
    return;
  }

  // 3. PUNCH IN
  if (cmd === 'punch in' || cmd === 'in' || cmd === 'check in' || cmd === 'checkin') {
    // If sent by specific employee, punch only for them!
    const targets = matchedEmp ? [matchedEmp] : allEmployees.filter((e) => e.status === 'ACTIVE' && e.schedule.active);

    if (targets.length === 0) {
      await sock.sendMessage(from, { text: '⚠️ No active employee found to punch in.' });
      return;
    }

    await sock.sendMessage(from, {
      text: matchedEmp
        ? `⏳ Marking Check-In for *${matchedEmp.name}*...`
        : `⏳ Marking Check-In for all ${targets.length} active employee(s)...`,
    });

    let replyMsg = `🟢 *Check-In Outcome:*\n\n`;
    for (const emp of targets) {
      const res = await executePunch(emp, 'CHECK_IN', 'MANUAL');
      replyMsg += `• *${emp.name}*: ${res.success ? '✅ Marked Successfully (200 OK)' : `❌ Failed: ${res.error}`}\n`;
    }

    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 4. PUNCH OUT
  if (cmd === 'punch out' || cmd === 'out' || cmd === 'check out' || cmd === 'checkout') {
    const targets = matchedEmp ? [matchedEmp] : allEmployees.filter((e) => e.status === 'ACTIVE' && e.schedule.active);

    if (targets.length === 0) {
      await sock.sendMessage(from, { text: '⚠️ No active employee found to punch out.' });
      return;
    }

    await sock.sendMessage(from, {
      text: matchedEmp
        ? `⏳ Marking Check-Out for *${matchedEmp.name}*...`
        : `⏳ Marking Check-Out for all ${targets.length} active employee(s)...`,
    });

    let replyMsg = `🔴 *Check-Out Outcome:*\n\n`;
    for (const emp of targets) {
      const res = await executePunch(emp, 'CHECK_OUT', 'MANUAL');
      replyMsg += `• *${emp.name}*: ${res.success ? '✅ Marked Successfully (200 OK)' : `❌ Failed: ${res.error}`}\n`;
    }

    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 4b. ALL IN / ALL OUT (Admin commands)
  if (cmd === 'all in' || cmd === 'all punch in') {
    const targets = allEmployees.filter((e) => e.status === 'ACTIVE' && e.schedule.active);
    await sock.sendMessage(from, { text: `⏳ Punching in all ${targets.length} employees...` });
    let replyMsg = `🟢 *Team Check-In Results:*\n\n`;
    for (const emp of targets) {
      const res = await executePunch(emp, 'CHECK_IN', 'MANUAL');
      replyMsg += `• *${emp.name}*: ${res.success ? '✅ Success' : `❌ ${res.error}`}\n`;
    }
    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  if (cmd === 'all out' || cmd === 'all punch out') {
    const targets = allEmployees.filter((e) => e.status === 'ACTIVE' && e.schedule.active);
    await sock.sendMessage(from, { text: `⏳ Punching out all ${targets.length} employees...` });
    let replyMsg = `🔴 *Team Check-Out Results:*\n\n`;
    for (const emp of targets) {
      const res = await executePunch(emp, 'CHECK_OUT', 'MANUAL');
      replyMsg += `• *${emp.name}*: ${res.success ? '✅ Success' : `❌ ${res.error}`}\n`;
    }
    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 5. REFRESH SESSIONS
  if (cmd === 'refresh') {
    const employees = await getAllEmployees();
    const active = employees.filter((e) => e.status === 'ACTIVE');

    await sock.sendMessage(from, { text: `⏳ Refreshing tokens for ${active.length} employee(s)...` });

    let replyMsg = `🔄 *Token Refresh Results:*\n\n`;
    for (const emp of active) {
      const res = await refreshHROneToken(emp);
      replyMsg += `• *${emp.name}*: ${res.success ? '✅ Session extended (7-day window)' : `❌ Failed: ${res.error}`}\n`;
    }

    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 6. LOGS
  if (cmd === 'logs' || cmd === 'history') {
    const db = await getDatabase();
    const logs = await db.collection('punch_logs').find({}).sort({ executedAt: -1 }).limit(5).toArray();

    if (logs.length === 0) {
      await sock.sendMessage(from, { text: '📜 No recent punch logs found.' });
      return;
    }

    let replyMsg = `📜 *Recent Punch Activity (Last 5)*\n\n`;
    for (const l of logs) {
      const timeStr = new Date(l.executedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const statusIcon = l.success ? '✅' : '❌';
      replyMsg += `${statusIcon} *${l.employeeName}* (${l.punchType})\n`;
      replyMsg += `  Time: ${timeStr}\n`;
      replyMsg += `  Type: ${l.triggerType || 'AUTOMATED'}\n\n`;
    }

    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 7. TEAM
  if (cmd === 'team') {
    const employees = await getAllEmployees();
    let replyMsg = `👥 *Enrolled Team Members (${employees.length}):*\n\n`;
    for (const emp of employees) {
      replyMsg += `• *${emp.name}* (ID: ${emp.employeeId}) - Status: ${emp.status === 'ACTIVE' ? '🟢 Active' : '⏸️ Paused'}\n`;
      replyMsg += `  Hours: ${emp.schedule.checkInMin}-${emp.schedule.checkInMax} In, ${emp.schedule.checkOutMin}-${emp.schedule.checkOutMax} Out\n\n`;
    }
    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // Unknown command fallback
  await sock.sendMessage(from, {
    text: `❓ Unrecognized command: *"${commandText}"*\n\nSend *help* to see all available commands.`,
  });
}

/**
 * Start the WhatsApp Bot Socket
 */
export async function startWhatsAppBot() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

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

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n======================================================');
      console.log('📱 SCAN THIS QR CODE WITH YOUR WHATSAPP TO LINK BOT:');
      console.log('WhatsApp > Settings / Menu > Linked Devices > Link a Device');
      console.log('======================================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\n======================================================\n');
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log(
        `[WhatsApp Bot] Connection closed. Reason: ${(lastDisconnect?.error as Boom)?.message || 'Unknown'}. Reconnecting: ${shouldReconnect}`
      );

      if (shouldReconnect) {
        setTimeout(startWhatsAppBot, 3000);
      } else {
        console.log('[WhatsApp Bot] Logged out. Delete .whatsapp_auth and restart to scan again.');
      }
    } else if (connection === 'open') {
      console.log('\n✅ [WhatsApp Bot] Connected successfully to WhatsApp!');
      console.log('🤖 Send "help" to this number from any chat to interact.\n');
    }
  });

  // Listen for incoming messages
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      // Don't respond to status broadcasts
      if (msg.key.remoteJid === 'status@broadcast') continue;

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
