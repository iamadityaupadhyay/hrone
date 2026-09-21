import { getAllEmployees } from '@/lib/db/employees';
import { isHolidayToday } from '@/lib/db/holidays';
import { executePunch, generateRandomPunchTime, getISTPunchTime, isTimeTriggerMatch } from '@/lib/hrone/punch';
import { refreshHROneToken } from '@/lib/hrone/token';
import { getDatabase } from '@/lib/mongodb';
import { resolveWhatsAppRecipient } from '@/lib/whatsapp/recipient';
import { sendWhatsAppNotification } from '@/whatsapp/bot';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function handleCronTrigger(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action'); // 'checkin' | 'checkout' | 'refresh_all' | 'auto'
    const force = searchParams.get('force') === 'true';

    // Verify secret if CRON_SECRET is set in environment variables
    if (process.env.CRON_SECRET) {
      const authHeader = req.headers.get('authorization') || '';
      const secretHeader = req.headers.get('x-cron-secret') || '';
      const secretParam = searchParams.get('secret') || '';

      const isAuthorized =
        authHeader === `Bearer ${process.env.CRON_SECRET}` ||
        authHeader === process.env.CRON_SECRET ||
        secretHeader === process.env.CRON_SECRET ||
        secretParam === process.env.CRON_SECRET;

      if (!isAuthorized) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: invalid cron secret' },
          { status: 401 }
        );
      }
    }

    const employees = await getAllEmployees();
    const activeEmployees = employees.filter((e) => e.status === 'ACTIVE' && e.schedule.active);

    const istTime = getISTPunchTime(); // "YYYY-MM-DDTHH:mm"
    const [todayDateStr, currentIstHHMM] = istTime.split('T');
    const istHour = parseInt(currentIstHHMM.split(':')[0], 10);
    const today = new Date();

    const dayOfWeek = new Date(
      today.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    ).getDay(); // 0 = Sun, 1 = Mon ... 5 = Fri, 6 = Sat

    const results: Array<Record<string, unknown>> = [];

    for (const emp of activeEmployees) {
      // 1. Check working days (Mon-Fri by default; Sat=6 if configured for employee)
      const workingDays = emp.schedule?.workingDays?.length ? emp.schedule.workingDays : [1, 2, 3, 4, 5];
      if (!force && !workingDays.includes(dayOfWeek)) {
        results.push({
          employeeId: emp.employeeId,
          name: emp.name,
          skipped: true,
          reason: `Skipped: Not a scheduled working day for ${emp.name} (day of week: ${dayOfWeek})`,
        });
        continue;
      }

      // 1b. Check official holiday calendar unless force=true
      if (!force) {
        const holidayCheck = await isHolidayToday(emp.employeeId, todayDateStr);
        if (holidayCheck.isHoliday) {
          results.push({
            employeeId: emp.employeeId,
            name: emp.name,
            skipped: true,
            reason: `Skipped: Today (${todayDateStr}) is an official holiday (${holidayCheck.holidayName})`,
          });
          continue;
        }
      }

      // 2. Determine punch action
      let punchTypeToRun: 'CHECK_IN' | 'CHECK_OUT' | null = null;

      if (action === 'checkin') {
        punchTypeToRun = 'CHECK_IN';
      } else if (action === 'checkout') {
        punchTypeToRun = 'CHECK_OUT';
      } else if (action === 'refresh_all') {
        const refreshResult = await refreshHROneToken(emp);
        results.push({
          employeeId: emp.employeeId,
          name: emp.name,
          action: 'REFRESH',
          refreshed: refreshResult.success,
          error: refreshResult.error,
        });
        continue;
      } else {
        // Auto mode based on current IST hour
        // Morning Window (8:00 AM - 12:00 PM) -> Check In
        // Evening Window (5:00 PM - 11:00 PM) -> Check Out
        const [inStartH] = (emp.schedule.checkInMin || '09:30').split(':').map(Number);
        const [inEndH] = (emp.schedule.checkInMax || '09:55').split(':').map(Number);
        const [outStartH] = (emp.schedule.checkOutMin || '19:00').split(':').map(Number);
        const [outEndH] = (emp.schedule.checkOutMax || '19:30').split(':').map(Number);

        // Generous window bounds for automated cloud crons
        const morningWindowStart = Math.min(inStartH, 9);
        const morningWindowEnd = Math.max(inEndH, 11);
        const eveningWindowStart = Math.min(outStartH, 17);
        const eveningWindowEnd = Math.max(outEndH, 23);

        if (istHour >= morningWindowStart && istHour < morningWindowEnd) {
          punchTypeToRun = 'CHECK_IN';
        } else if (istHour >= eveningWindowStart && istHour <= eveningWindowEnd) {
          punchTypeToRun = 'CHECK_OUT';
        }
      }

      // Ensure planned punch times exist for today
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

        const db = await getDatabase();
        await db.collection('employees').updateOne(
          { employeeId: emp.employeeId },
          { $set: { todayPunch, updatedAt: new Date().toISOString() } }
        );
      }

      // Check if already completed today or if planned time hasn't arrived (unless force=true)
      if (!force && punchTypeToRun) {
        if (punchTypeToRun === 'CHECK_IN') {
          if (todayPunch.checkInStatus === 'SUCCESS') {
            results.push({
              employeeId: emp.employeeId,
              name: emp.name,
              skipped: true,
              reason: `Already checked in today at ${todayPunch.checkedInAt}`,
            });
            continue;
          }

          if (!isTimeTriggerMatch(currentIstHHMM, todayPunch.plannedCheckIn || '09:00')) {
            results.push({
              employeeId: emp.employeeId,
              name: emp.name,
              skipped: true,
              reason: `Scheduled for Check-In at ${todayPunch.plannedCheckIn} (current: ${currentIstHHMM})`,
            });
            continue;
          }
        }

        if (punchTypeToRun === 'CHECK_OUT') {
          if (todayPunch.checkOutStatus === 'SUCCESS') {
            results.push({
              employeeId: emp.employeeId,
              name: emp.name,
              skipped: true,
              reason: `Already checked out today at ${todayPunch.checkedOutAt}`,
            });
            continue;
          }

          if (!isTimeTriggerMatch(currentIstHHMM, todayPunch.plannedCheckOut || '19:30')) {
            results.push({
              employeeId: emp.employeeId,
              name: emp.name,
              skipped: true,
              reason: `Scheduled for Check-Out at ${todayPunch.plannedCheckOut} (current: ${currentIstHHMM})`,
            });
            continue;
          }
        }
      }

      if (punchTypeToRun) {
        const punchResult = await executePunch(emp, punchTypeToRun, 'AUTOMATED');
        results.push({
          employeeId: emp.employeeId,
          name: emp.name,
          punchType: punchTypeToRun,
          success: punchResult.success,
          httpStatus: punchResult.httpStatus,
          punchTime: punchResult.punchTime,
          error: punchResult.error,
        });

        // Send WhatsApp notification for automated cron punch
        const recipient = resolveWhatsAppRecipient(emp);

        if (recipient) {
          const isCheckIn = punchTypeToRun === 'CHECK_IN';
          const greeting = isCheckIn ? `🌅 *Good morning ${emp.name}!* ☀️` : `🌆 *Good evening ${emp.name}!* 🌙`;
          const location = emp.geoLocation || 'Office';
          const icon = isCheckIn ? '🟢' : '🔴';
          const actionName = isCheckIn ? 'Check-In' : 'Check-Out';
          const followBack = isCheckIn ? 'Reply *status* or *out*' : 'Reply *status* or *logs*';
          if (punchResult.success) {
            await sendWhatsAppNotification(
              `${greeting}\n\n${icon} Auto ${actionName}: *${currentIstHHMM}*\n📍 Location: *${location}*\n\n👉 ${followBack}`,
              recipient
            );
          } else if (isCheckIn) {
            await sendWhatsAppNotification(
              `${greeting}\n\n⚠️ Auto Check-In failed at *${currentIstHHMM}*.\n📍 Location: *${location}*\n\n👉 Reply *in* to punch manually`,
              recipient
            );
          } else {
            await sendWhatsAppNotification(
              `${greeting}\n\n⚠️ Auto Check-Out failed at *${currentIstHHMM}*.\n📍 Location: *${location}*\n\n👉 Reply *out* to punch manually`,
              recipient
            );
          }
        }
      } else {
        results.push({
          employeeId: emp.employeeId,
          name: emp.name,
          skipped: true,
          reason: `Outside scheduled windows (Current IST: ${currentIstHHMM})`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      time: istTime,
      totalActive: activeEmployees.length,
      processed: results.length,
      results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cron trigger failure';
    console.error('[Cron API Error]:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// Support both GET (for Vercel Crons & webhooks) and POST (for scripts & curls)
export async function GET(req: NextRequest) {
  return handleCronTrigger(req);
}

export async function POST(req: NextRequest) {
  return handleCronTrigger(req);
}
