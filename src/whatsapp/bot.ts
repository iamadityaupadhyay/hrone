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
 * Handle incoming WhatsApp commands with strict per-employee privacy and data isolation
 */
async function handleCommand(from: string, commandText: string, senderName: string) {
  if (!sock) return;

  const cmd = commandText.trim().toLowerCase();
  console.log(`[WhatsApp Bot] Received command from ${senderName} (${from}): "${commandText}"`);

  const allEmployees = await getAllEmployees();
  const cleanSenderDigits = from.replace(/\D/g, '');
  const senderLast10 = cleanSenderDigits.length >= 10 ? cleanSenderDigits.slice(-10) : '';

  // 1. MATCH EMPLOYEE STRICTLY FOR THIS SENDER
  let matchedEmp = allEmployees.find((e) => {
    // a. Direct WhatsApp LID / JID match
    const anyE = e as any;
    if (anyE.whatsappLid === from || anyE.whatsappJid === from) return true;

    // b. Phone digits match
    if (senderLast10) {
      const userDigits = (e.username || '').replace(/\D/g, '');
      const mobileDigits = (e.mobileNumber || '').replace(/\D/g, '');
      if (userDigits.length >= 10 && userDigits.endsWith(senderLast10)) return true;
      if (mobileDigits.length >= 10 && mobileDigits.endsWith(senderLast10)) return true;
    }

    // c. Sender PushName match against Employee Name (e.g. "Aditya Upadhyay")
    if (senderName && senderName !== 'User') {
      const sNorm = senderName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      const eNorm = e.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      if (sNorm.length > 3 && (sNorm === eNorm || (sNorm.length >= 5 && eNorm.includes(sNorm)))) {
        return true;
      }
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
        text: `✅ *Linked Successfully!*\n\nYour WhatsApp account is now linked to *${target.name}* (ID: ${target.employeeId}).\n\n📌 *Available Commands:*\n• *status* - View your attendance today\n• *in* - Mark your Check-In\n• *out* - Mark your Check-Out\n• *pause* - Turn OFF auto-attendance\n• *resume* - Turn ON auto-attendance\n• *logs* - View your recent punches\n• *refresh* - Extend your login session`,
      });
      return;
    } else {
      await sock.sendMessage(from, {
        text: `❌ Could not find employee matching *"${query}"*.\nPlease check your Employee ID or Username and try again.`,
      });
      return;
    }
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

  // 3. HELP / MENU
  if (cmd === 'help' || cmd === 'menu' || cmd === 'hi' || cmd === 'hello') {
    if (matchedEmp) {
      const helpMsg =
        `👋 *Hello ${matchedEmp.name}!* (ID: ${matchedEmp.employeeId})\n\n` +
        `🤖 *Your Personal Attendance Bot*\n\n` +
        `📌 *status* - View your attendance status today\n` +
        `🟢 *in* - Mark your Check-In now\n` +
        `🔴 *out* - Mark your Check-Out now\n` +
        `⏸️ *pause* - Turn OFF auto-attendance for today/leave\n` +
        `▶️ *resume* - Turn ON auto-attendance\n` +
        `🔄 *refresh* - Extend your login session\n` +
        `📜 *logs* - View your recent punch activity\n\n` +
        `_All data is private and strictly for your profile._`;
      await sock.sendMessage(from, { text: helpMsg });
    } else {
      const unlinkedMsg =
        `👋 *Hello ${senderName}!*\n\n` +
        `🤖 *HROne Attendance Bot*\n\n` +
        `🔒 Your WhatsApp account is not linked to an employee profile yet.\n\n` +
        `To link your account, reply:\n` +
        `👉 *link <Your Employee ID or Username>*\n` +
        `Example: *link 2357* or *link E1885*`;
      await sock.sendMessage(from, { text: unlinkedMsg });
    }
    return;
  }

  // PRIVACY GUARD: If sender is unlinked, reject all data access commands
  if (!matchedEmp) {
    await sock.sendMessage(from, {
      text:
        `🔒 *Authentication Required*\n\n` +
        `We could not identify your employee profile from this WhatsApp account.\n\n` +
        `To securely link your account, please reply:\n` +
        `👉 *link <Your Employee ID or Username>*\n` +
        `Example: *link 2357* or *link E1885*`,
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

    let statusMsg = `📊 *Your Live Attendance Status*\n`;
    statusMsg += `📅 *Date:* ${todayStr}\n`;
    statusMsg += `👤 *${matchedEmp.name}* (ID: ${matchedEmp.employeeId})\n\n`;

    if (inLog) {
      const refCode = (inLog.responsePayload as any)?.messageCode;
      statusMsg += `• Check-In: ✅ *Done at ${formatISTDisplay(inLog.punchTime || inLog.executedAt)}* (${inLog.triggerType || 'AUTOMATED'}${refCode ? `, Ref: ${refCode}` : ''})\n`;
    } else if (matchedEmp.todayPunch?.checkInStatus === 'SUCCESS' && matchedEmp.todayPunch.checkedInAt) {
      statusMsg += `• Check-In: ✅ *Done at ${formatISTDisplay(matchedEmp.todayPunch.checkedInAt)}*\n`;
    } else {
      statusMsg += `• Check-In: ⏳ *Scheduled* (${matchedEmp.todayPunch?.plannedCheckIn || matchedEmp.schedule.checkInMin} IST)\n`;
    }

    if (outLog) {
      const refCode = (outLog.responsePayload as any)?.messageCode;
      statusMsg += `• Check-Out: ✅ *Done at ${formatISTDisplay(outLog.punchTime || outLog.executedAt)}* (${outLog.triggerType || 'AUTOMATED'}${refCode ? `, Ref: ${refCode}` : ''})\n`;
    } else if (matchedEmp.todayPunch?.checkOutStatus === 'SUCCESS' && matchedEmp.todayPunch.checkedOutAt) {
      statusMsg += `• Check-Out: ✅ *Done at ${formatISTDisplay(matchedEmp.todayPunch.checkedOutAt)}*\n`;
    } else {
      statusMsg += `• Check-Out: ⏳ *Scheduled* (${matchedEmp.todayPunch?.plannedCheckOut || matchedEmp.schedule.checkOutMin} IST)\n`;
    }

    statusMsg += `• Auto-Pilot: ${matchedEmp.schedule.active && matchedEmp.status === 'ACTIVE' ? '🟢 Active' : '⏸️ Paused'}\n`;
    statusMsg += `📍 Location: ${matchedEmp.geoLocation || 'Office'}\n`;

    if (matchedEmp.refreshTokenExpiry) {
      const daysLeft = Math.ceil(
        (new Date(matchedEmp.refreshTokenExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      statusMsg += `🔑 Cloud Session: ${daysLeft > 0 ? `🟢 Active (${daysLeft} days left)` : '🔴 Expired'}\n`;
    }
    statusMsg += `\n_Send *in* to mark Check-In, or *out* for Check-Out!_`;

    await sock.sendMessage(from, { text: statusMsg });
    return;
  }

  // 5. PUNCH IN (Strictly for this sender only - Live HROne API execution)
  if (cmd === 'punch in' || cmd === 'in' || cmd === 'check in' || cmd === 'checkin') {
    await sock.sendMessage(from, { text: `⏳ Contacting HROne Cloud to mark Check-In for *${matchedEmp.name}*...` });
    const res = await executePunch(matchedEmp, 'CHECK_IN', 'MANUAL');
    const refCode = (res.responsePayload as any)?.messageCode;
    const replyMsg = res.success
      ? `🟢 *Check-In Successful!*\n\n` +
        `👤 *${matchedEmp.name}*\n` +
        `⏰ Time: *${formatISTDisplay(res.punchTime)}*\n` +
        `📍 Location: ${matchedEmp.geoLocation || 'Office'}\n` +
        `⚡ HROne Ref: ${refCode || 'Record saved successfully'}`
      : `❌ *Check-In Failed:*\n\n${res.error}`;
    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 6. PUNCH OUT (Strictly for this sender only - Live HROne API execution)
  if (cmd === 'punch out' || cmd === 'out' || cmd === 'check out' || cmd === 'checkout') {
    await sock.sendMessage(from, { text: `⏳ Contacting HROne Cloud to mark Check-Out for *${matchedEmp.name}*...` });
    const res = await executePunch(matchedEmp, 'CHECK_OUT', 'MANUAL');
    const refCode = (res.responsePayload as any)?.messageCode;
    const replyMsg = res.success
      ? `🔴 *Check-Out Successful!*\n\n` +
        `👤 *${matchedEmp.name}*\n` +
        `⏰ Time: *${formatISTDisplay(res.punchTime)}*\n` +
        `📍 Location: ${matchedEmp.geoLocation || 'Office'}\n` +
        `⚡ HROne Ref: ${refCode || 'Record saved successfully'}`
      : `❌ *Check-Out Failed:*\n\n${res.error}`;
    await sock.sendMessage(from, { text: replyMsg });
    return;
  }

  // 7. PAUSE AUTO-ATTENDANCE (Strictly for this sender only)
  if (cmd === 'pause' || cmd === 'stop' || cmd === 'off' || cmd === 'leave' || cmd === 'pause today') {
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

    const pauseMsg =
      `⏸️ *Auto-Attendance Paused for ${matchedEmp.name}*\n\n` +
      `Your automated autopilot has been turned *OFF*.\n` +
      `• No automated punches will run for your account.\n` +
      `• You can still manually clock in/out with *in* or *out*.\n` +
      `• To turn auto-attendance back on, reply *resume* or *start*.`;

    await sock.sendMessage(from, { text: pauseMsg });
    return;
  }

  // 8. RESUME AUTO-ATTENDANCE (Strictly for this sender only)
  if (cmd === 'resume' || cmd === 'start' || cmd === 'on' || cmd === 'active') {
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

    const resumeMsg =
      `▶️ *Auto-Attendance Resumed for ${matchedEmp.name}!*\n\n` +
      `Your automated autopilot is now *ON*.\n` +
      `• Check-In window: ${matchedEmp.schedule.checkInMin} - ${matchedEmp.schedule.checkInMax}\n` +
      `• Check-Out window: ${matchedEmp.schedule.checkOutMin} - ${matchedEmp.schedule.checkOutMax}\n` +
      `• The worker will autonomously handle your attendance.`;

    await sock.sendMessage(from, { text: resumeMsg });
    return;
  }

  // 9. REFRESH LOGIN SESSION (Strictly for this sender only)
  if (cmd === 'refresh') {
    await sock.sendMessage(from, { text: `⏳ Refreshing session for *${matchedEmp.name}*...` });
    const res = await refreshHROneToken(matchedEmp);
    const replyMsg = res.success
      ? `🔄 *Session Refreshed!*\n\nLogin session for *${matchedEmp.name}* has been extended for another 7 days.`
      : `❌ *Token Refresh Failed:*\n\n${res.error}`;
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

    let replyMsg = `📜 *Your Recent Punch Activity (Last 5)*\n\n`;
    for (const l of logs) {
      const timeStr = formatISTDisplay(l.punchTime || l.executedAt);
      const statusIcon = l.success ? '✅' : '❌';
      const refCode = (l.responsePayload as any)?.messageCode;
      replyMsg += `${statusIcon} *${l.punchType}* (${l.triggerType || 'AUTOMATED'})\n`;
      replyMsg += `  ⏰ ${timeStr}\n`;
      if (refCode) replyMsg += `  ⚡ HROne Ref: ${refCode}\n`;
      if (l.error) replyMsg += `  ⚠️ Reason: ${l.error}\n`;
      replyMsg += `\n`;
    }

    await sock.sendMessage(from, { text: replyMsg });
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
      text: `🔒 Team-wide commands are restricted for privacy and security. You can only view and manage your own attendance.`,
    });
    return;
  }

  // Unknown command fallback
  await sock.sendMessage(from, {
    text: `❓ Unrecognized command: *"${commandText}"*\n\nSend *help* to see your available commands.`,
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
