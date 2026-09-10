import { getAllEmployees } from '@/lib/db/employees';
import { executePunch, getISTPunchTime } from '@/lib/hrone/punch';
import { refreshHROneToken } from '@/lib/hrone/token';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action'); // 'checkin' | 'checkout' | 'refresh_all' | 'auto'
    const secret = req.headers.get('x-cron-secret') || searchParams.get('secret');

    // Optional simple security check if CRON_SECRET is set in env
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const employees = await getAllEmployees();
    const activeEmployees = employees.filter((e) => e.status === 'ACTIVE' && e.schedule.active);

    const istTime = getISTPunchTime(); // "YYYY-MM-DDTHH:mm"
    const istHour = parseInt(istTime.split('T')[1].split(':')[0], 10);
    const istMinute = parseInt(istTime.split('T')[1].split(':')[1], 10);
    const today = new Date();
    // In IST day of week (0 = Sunday, 1 = Monday ... 6 = Saturday)
    const istDayOfWeek = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'narrow',
    }).format(today);
    // Alternatively get numeric day:
    const dayOfWeek = new Date(
      today.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    ).getDay();

    const results: Array<Record<string, unknown>> = [];

    for (const emp of activeEmployees) {
      // Check working days
      if (!emp.schedule.workingDays.includes(dayOfWeek)) {
        results.push({
          employeeId: emp.employeeId,
          name: emp.name,
          skipped: true,
          reason: `Not a working day (day of week: ${dayOfWeek})`,
        });
        continue;
      }

      // Determine punch type if action is auto
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
          refreshed: refreshResult.success,
          error: refreshResult.error,
        });
        continue;
      } else {
        // Auto mode based on current IST hour
        // Check-in window (typically 9 to 10 AM)
        const [inStartH] = (emp.schedule.checkInMin || '09:00').split(':').map(Number);
        const [inEndH] = (emp.schedule.checkInMax || '10:00').split(':').map(Number);
        const [outStartH] = (emp.schedule.checkOutMin || '18:00').split(':').map(Number);
        const [outEndH] = (emp.schedule.checkOutMax || '20:00').split(':').map(Number);

        const todayStr = istTime.split('T')[0];
        const alreadyCheckedIn =
          emp.todayPunch?.date === todayStr && emp.todayPunch.checkInStatus === 'SUCCESS';
        const alreadyCheckedOut =
          emp.todayPunch?.date === todayStr && emp.todayPunch.checkOutStatus === 'SUCCESS';

        if (istHour >= inStartH && istHour < inEndH && !alreadyCheckedIn) {
          punchTypeToRun = 'CHECK_IN';
        } else if (istHour >= outStartH && istHour < outEndH && !alreadyCheckedOut) {
          punchTypeToRun = 'CHECK_OUT';
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
          error: punchResult.error,
        });
      } else {
        results.push({
          employeeId: emp.employeeId,
          name: emp.name,
          skipped: true,
          reason: `Outside scheduled windows or already completed for today (${istHour}:${istMinute})`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      time: istTime,
      totalActive: activeEmployees.length,
      results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cron trigger error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
