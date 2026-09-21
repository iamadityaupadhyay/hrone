import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import * as http from 'http';
import { getAllEmployees } from '../lib/db/employees';
import { executePunch, generateRandomPunchTime, getISTPunchTime, isTimeTriggerMatch } from '../lib/hrone/punch';
import { refreshHROneToken } from '../lib/hrone/token';
import { getDatabase } from '../lib/mongodb';
import { EmployeeProfile } from '../lib/types/employee';
import { getWhatsAppBotStatus, resolveWhatsAppRecipient, sendBroadcast, sendWhatsAppNotification, startWhatsAppBot } from '../whatsapp/bot';

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

    // 2. Check if today is a scheduled working day for this employee (Mon-Fri by default; Sat=6 if configured)
    const workingDays = emp.schedule?.workingDays?.length ? emp.schedule.workingDays : [1, 2, 3, 4, 5];
    if (!workingDays.includes(dayOfWeek)) {
      continue;
    }

    // 3. Ensure planned punch times exist for today
    let todayPunch = emp.todayPunch;
    if (!todayPunch || todayPunch.date !== todayDateStr) {
      const plannedIn = generateRandomPunchTime(
        emp.schedule.checkInMin || '09:30',
        emp.schedule.checkInMax || '09:55'
      );
      const plannedOut = generateRandomPunchTime(
        emp.schedule.checkOutMin || '19:00',
        emp.schedule.checkOutMax || '19:30'
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
      const recipient = resolveWhatsAppRecipient(emp);

      if (recipient) {
        const location = emp.geoLocation || 'Office';
        if (res.success) {
          await sendWhatsAppNotification(
            `🌅 *Good morning ${emp.name}!* ☀️\n\n🟢 Auto Check-In: *${currentIstTime}*\n📍 Location: *${location}*\n\n👉 Reply *status* for today or *out* to Check-Out`,
            recipient
          );
        } else {
          await sendWhatsAppNotification(
            `🌅 *Good morning ${emp.name}!*\n\n⚠️ Auto Check-In failed at *${currentIstTime}*.\n📍 Location: *${location}*\n\n👉 Reply *in* to punch manually`,
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

      const recipient = resolveWhatsAppRecipient(emp);

      if (recipient) {
        const location = emp.geoLocation || 'Office';
        if (res.success) {
          await sendWhatsAppNotification(
            `🌆 *Good evening ${emp.name}!* 🌙\n\n🔴 Auto Check-Out: *${currentIstTime}*\n📍 Location: *${location}*\n\n👉 Reply *status* for summary or *logs* for history`,
            recipient
          );
        } else {
          await sendWhatsAppNotification(
            `🌆 *Good evening ${emp.name}!*\n\n⚠️ Auto Check-Out failed at *${currentIstTime}*.\n📍 Location: *${location}*\n\n👉 Reply *out* to punch manually`,
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

async function processPendingBroadcasts() {
  try {
    const db = await getDatabase();
    const pending = await db.collection('broadcasts').findOne({ status: 'QUEUED' });
    if (!pending) return;

    console.log(`[Worker] Picked up queued broadcast: ${pending._id}. Sending to ${pending.recipients?.length || 0} recipients...`);
    await db.collection('broadcasts').updateOne(
      { _id: pending._id },
      { $set: { status: 'SENDING', startedAt: new Date().toISOString() } }
    );

    const { sentCount, failedCount, results } = await sendBroadcast(pending.message, pending.recipients || []);

    await db.collection('broadcasts').updateOne(
      { _id: pending._id },
      {
        $set: {
          status: 'COMPLETED',
          sentCount,
          failedCount,
          results,
          completedAt: new Date().toISOString(),
        },
      }
    );

    console.log(`[Worker] Broadcast ${pending._id} successfully completed! (Sent: ${sentCount}, Failed: ${failedCount})`);
  } catch (err) {
    console.error('[Worker] Error processing pending broadcast:', err);
  }
}

  // Run initial tick immediately
  await runSchedulerTick();
  await processPendingBroadcasts();

  // Check for queued broadcasts every 5 seconds
  const broadcastInterval = setInterval(async () => {
    try {
      await processPendingBroadcasts();
    } catch (err) {
      console.error('[Worker] Error in broadcast polling loop:', err);
    }
  }, 5000);

  // Run attendance scheduler every 60 seconds
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
    clearInterval(broadcastInterval);
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
