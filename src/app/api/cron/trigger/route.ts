import { getAllEmployees } from '@/lib/db/employees';
import { executePunch, getISTPunchTime } from '@/lib/hrone/punch';
import { refreshHROneToken } from '@/lib/hrone/token';
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
      // 1. Check working days unless force=true
      if (!force && !emp.schedule.workingDays.includes(dayOfWeek)) {
        results.push({
          employeeId: emp.employeeId,
          name: emp.name,
          skipped: true,
          reason: `Skipped: Not a scheduled working day (day of week: ${dayOfWeek})`,
        });
        continue;
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
        const [inStartH] = (emp.schedule.checkInMin || '08:00').split(':').map(Number);
        const [inEndH] = (emp.schedule.checkInMax || '10:00').split(':').map(Number);
        const [outStartH] = (emp.schedule.checkOutMin || '18:00').split(':').map(Number);
        const [outEndH] = (emp.schedule.checkOutMax || '20:00').split(':').map(Number);

        // Generous window bounds for automated cloud crons
        const morningWindowStart = Math.min(inStartH, 8);
        const morningWindowEnd = Math.max(inEndH, 12);
        const eveningWindowStart = Math.min(outStartH, 17);
        const eveningWindowEnd = Math.max(outEndH, 23);

        if (istHour >= morningWindowStart && istHour < morningWindowEnd) {
          punchTypeToRun = 'CHECK_IN';
        } else if (istHour >= eveningWindowStart && istHour <= eveningWindowEnd) {
          punchTypeToRun = 'CHECK_OUT';
        }
      }

      // Check if already completed today unless force=true
      if (!force && punchTypeToRun) {
        const alreadyCheckedIn =
          emp.todayPunch?.date === todayDateStr && emp.todayPunch.checkInStatus === 'SUCCESS';
        const alreadyCheckedOut =
          emp.todayPunch?.date === todayDateStr && emp.todayPunch.checkOutStatus === 'SUCCESS';

        if (punchTypeToRun === 'CHECK_IN' && alreadyCheckedIn) {
          results.push({
            employeeId: emp.employeeId,
            name: emp.name,
            skipped: true,
            reason: `Already checked in today at ${emp.todayPunch?.checkedInAt}`,
          });
          continue;
        }

        if (punchTypeToRun === 'CHECK_OUT' && alreadyCheckedOut) {
          results.push({
            employeeId: emp.employeeId,
            name: emp.name,
            skipped: true,
            reason: `Already checked out today at ${emp.todayPunch?.checkedOutAt}`,
          });
          continue;
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
