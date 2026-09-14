import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import * as http from 'http';
import { getAllEmployees } from '../lib/db/employees';
import { executePunch, getISTPunchTime } from '../lib/hrone/punch';
import { refreshHROneToken } from '../lib/hrone/token';
import { getDatabase } from '../lib/mongodb';
import { EmployeeProfile } from '../lib/types/employee';
import { getWhatsAppBotStatus, sendWhatsAppNotification, startWhatsAppBot } from '../whatsapp/bot';

/**
 * Generate a random integer between min and max inclusive
 */
function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate humanized planned punch time (HH:mm) within min/max bounds
 */
function generateRandomPunchTime(minTimeStr: string, maxTimeStr: string): string {
  const [minH, minM] = minTimeStr.split(':').map(Number);
  const [maxH, maxM] = maxTimeStr.split(':').map(Number);

  const minTotalMinutes = minH * 60 + minM;
  const maxTotalMinutes = maxH * 60 + maxM;

  // Add a slight 5-min inner buffer so it never punches on the exact boundary
  const bufferedMin = Math.min(minTotalMinutes + 5, maxTotalMinutes - 5);
  const bufferedMax = Math.max(minTotalMinutes + 5, maxTotalMinutes - 5);

  const randomMinutes = getRandomInt(bufferedMin, bufferedMax);
  const h = Math.floor(randomMinutes / 60);
  const m = randomMinutes % 60;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Check if current time (HH:mm) matches or just passed planned time (within 3 mins)
 */
function isTimeTriggerMatch(currentTimeStr: string, plannedTimeStr: string): boolean {
  const [currH, currM] = currentTimeStr.split(':').map(Number);
  const [planH, planM] = plannedTimeStr.split(':').map(Number);

  const currTotal = currH * 60 + currM;
  const planTotal = planH * 60 + planM;

  return currTotal >= planTotal && currTotal <= planTotal + 3;
}

async function runSchedulerTick() {
  const now = new Date();
  const istPunchTime = getISTPunchTime(now); // "YYYY-MM-DDTHH:mm"
  const [todayDateStr, currentIstTime] = istPunchTime.split('T');

  const dayOfWeek = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  ).getDay(); // 0: Sun, 1: Mon ... 6: Sat

  console.log(`[Worker] Tick at ${todayDateStr} ${currentIstTime} IST (Day of week: ${dayOfWeek})`);

  let employees: EmployeeProfile[] = [];
  try {
    employees = await getAllEmployees();
  } catch (err) {
    console.error('[Worker] Failed to fetch employees from MongoDB:', err);
    return;
  }

  const activeEmployees = employees.filter(
    (e) => e.status === 'ACTIVE' && e.schedule.active
  );

  const db = await getDatabase();
  const collection = db.collection('employees');

  for (const emp of activeEmployees) {
    // 1. Proactively refresh token if older than 24 hours
    const lastRefreshTime = emp.lastTokenRefresh ? new Date(emp.lastTokenRefresh).getTime() : 0;
    const hoursSinceRefresh = (Date.now() - lastRefreshTime) / (1000 * 60 * 60);

    if (hoursSinceRefresh > 24) {
      console.log(`[Worker] Auto-refreshing sliding token for ${emp.name} (${emp.employeeId})...`);
      const refreshResult = await refreshHROneToken(emp);
      if (refreshResult.success) {
        console.log(`[Worker] Successfully refreshed token for ${emp.name}`);
      } else {
        console.warn(`[Worker] Token refresh failed for ${emp.name}:`, refreshResult.error);
      }
    }

    // 2. Check if today is a working day for this employee
    if (!emp.schedule.workingDays.includes(dayOfWeek)) {
      continue;
    }

    // 3. Ensure planned punch times exist for today
    let todayPunch = emp.todayPunch;
    if (!todayPunch || todayPunch.date !== todayDateStr) {
      const plannedIn = generateRandomPunchTime(
        emp.schedule.checkInMin || '08:00',
        emp.schedule.checkInMax || '10:00'
      );
      const plannedOut = generateRandomPunchTime(
        emp.schedule.checkOutMin || '19:00',
        emp.schedule.checkOutMax || '21:00'
      );

      todayPunch = {
        date: todayDateStr,
        plannedCheckIn: plannedIn,
        plannedCheckOut: plannedOut,
        checkInStatus: 'PENDING',
        checkOutStatus: 'PENDING',
      };

      await collection.updateOne(
        { employeeId: emp.employeeId },
        { $set: { todayPunch, updatedAt: new Date().toISOString() } }
      );

      console.log(
        `[Worker] Scheduled today's punches for ${emp.name}: Check-In at ${plannedIn}, Check-Out at ${plannedOut}`
      );
    }

    // 4. Evaluate Check-In Trigger
    if (
      todayPunch.checkInStatus === 'PENDING' &&
      todayPunch.plannedCheckIn &&
      isTimeTriggerMatch(currentIstTime, todayPunch.plannedCheckIn)
    ) {
      console.log(
        `[Worker] 🚀 Triggering Check-In for ${emp.name} (Scheduled: ${todayPunch.plannedCheckIn}, Actual: ${currentIstTime})`
      );
      const res = await executePunch(emp, 'CHECK_IN', 'AUTOMATED');
      console.log(
        `[Worker] Check-In outcome for ${emp.name}: ${res.success ? 'SUCCESS' : 'FAILED'} (HTTP ${res.httpStatus})`
      );
      const apiResponseStr = typeof res.responsePayload === 'object'
        ? JSON.stringify(res.responsePayload, null, 2)
        : String(res.responsePayload || res.error || 'Done');

      const recipient =
        (emp as any).whatsappLid ||
        (emp as any).whatsappJid ||
        (emp.mobileNumber ? `${emp.mobileNumber}@s.whatsapp.net` : undefined) ||
        (emp.username && /^\d{10}$/.test(emp.username) ? `91${emp.username}@s.whatsapp.net` : undefined);

      if (recipient) {
        if (res.success) {
          await sendWhatsAppNotification(
            `✅ *Good morning ${emp.name}!*\n\n` +
            `Your HROne Check-In has been marked automatically.\n` +
            `⏰ Time: *${currentIstTime} IST*\n` +
            `📍 Location: ${emp.geoLocation || 'Office'}\n\n` +
            `*HROne API Response:*\n` +
            `\`\`\`json\n${apiResponseStr}\n\`\`\``,
            recipient
          );
        } else {
          await sendWhatsAppNotification(
            `⚠️ *Attendance Alert for ${emp.name}*\n\n` +
            `Automated Check-In attempt at *${currentIstTime} IST* failed.\n\n` +
            `*HROne API Response:*\n` +
            `\`\`\`json\n${apiResponseStr}\n\`\`\`\n\n` +
            `Reply *in* to retry punching manually, or *status* to view your card.`,
            recipient
          );
        }
      }
    }

    // 5. Evaluate Check-Out Trigger
    if (
      todayPunch.checkOutStatus === 'PENDING' &&
      todayPunch.plannedCheckOut &&
      isTimeTriggerMatch(currentIstTime, todayPunch.plannedCheckOut)
    ) {
      console.log(
        `[Worker] 🚀 Triggering Check-Out for ${emp.name} (Scheduled: ${todayPunch.plannedCheckOut}, Actual: ${currentIstTime})`
      );
      const res = await executePunch(emp, 'CHECK_OUT', 'AUTOMATED');
      console.log(
        `[Worker] Check-Out outcome for ${emp.name}: ${res.success ? 'SUCCESS' : 'FAILED'} (HTTP ${res.httpStatus})`
      );

      const apiResponseStr = typeof res.responsePayload === 'object'
        ? JSON.stringify(res.responsePayload, null, 2)
        : String(res.responsePayload || res.error || 'Done');

      const recipient =
        (emp as any).whatsappLid ||
        (emp as any).whatsappJid ||
        (emp.mobileNumber ? `${emp.mobileNumber}@s.whatsapp.net` : undefined) ||
        (emp.username && /^\d{10}$/.test(emp.username) ? `91${emp.username}@s.whatsapp.net` : undefined);

      if (recipient) {
        if (res.success) {
          await sendWhatsAppNotification(
            `🔴 *Good evening ${emp.name}!*\n\n` +
            `Your HROne Check-Out has been marked automatically.\n` +
            `⏰ Time: *${currentIstTime} IST*\n` +
            `📍 Location: ${emp.geoLocation || 'Office'}\n\n` +
            `*HROne API Response:*\n` +
            `\`\`\`json\n${apiResponseStr}\n\`\`\``,
            recipient
          );
        } else {
          await sendWhatsAppNotification(
            `⚠️ *Attendance Alert for ${emp.name}*\n\n` +
            `Automated Check-Out attempt at *${currentIstTime} IST* failed.\n\n` +
            `*HROne API Response:*\n` +
            `\`\`\`json\n${apiResponseStr}\n\`\`\`\n\n` +
            `Reply *out* to retry punching manually, or *status* to view your card.`,
            recipient
          );
        }
      }
    }
  }
}

async function startWorker() {
  console.log('====================================================');
  console.log('      HROne Autonomous Attendance Worker Started    ');
  console.log('====================================================');
  console.log('Worker is active. Checking schedule every 60 seconds...\n');

  // Launch HTTP health server for cloud port checkers (Render, Railway, Fly)
  if (!process.env.NO_HTTP) {
    const port = Number(process.env.PORT) || 10000;
    try {
      const server = http.createServer(async (req, res) => {
        try {
          const istTime = getISTPunchTime();
          const emps = await getAllEmployees().catch(() => []);
          const activeCount = emps.filter((e) => e.status === 'ACTIVE' && e.schedule.active).length;
          const botStatus = getWhatsAppBotStatus();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify(
              {
                status: 'healthy',
                service: 'HROne Autonomous Attendance Worker & WhatsApp Bot',
                currentTimeIST: istTime,
                bot: botStatus,
                totalEmployees: emps.length,
                activeEmployeesInQueue: activeCount,
                timestamp: new Date().toISOString(),
              },
              null,
              2
            )
          );
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        }
      });

      server.listen(port, '0.0.0.0', () => {
        console.log(`[Worker] Health server actively listening on 0.0.0.0:${port}`);
      });
    } catch (err) {
      console.warn('[Worker] Could not bind health server port:', err);
    }
  }

  // Launch WhatsApp Bot in background
  try {
    console.log('[Worker] Launching WhatsApp Bot socket...');
    await startWhatsAppBot();
  } catch (err) {
    console.error('[Worker] Error launching WhatsApp Bot:', err);
  }

  // Run initial tick immediately
  await runSchedulerTick();

  // Run every 60 seconds
  const interval = setInterval(async () => {
    try {
      await runSchedulerTick();
    } catch (err) {
      console.error('[Worker] Unhandled error during tick:', err);
    }
  }, 60 * 1000);

  const cleanup = () => {
    console.log('\n[Worker] Stopping attendance worker...');
    clearInterval(interval);
    process.exit(0);
  };

  process.on('uncaughtException', (err) => {
    console.error('[Worker Process] Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Worker Process] Unhandled Rejection:', reason);
  });

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// Start if executed directly
if (require.main === module || process.argv[1]?.includes('scheduler')) {
  startWorker().catch((err) => {
    console.error('Fatal worker error:', err);
    process.exit(1);
  });
}
