import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { DEFAULT_SCHEDULE_CONFIG, ScheduleConfig } from '@/lib/config/schedule';
import { getSystemScheduleConfig } from '@/lib/db/settings';
import { generateRandomPunchTime, getISTPunchTime } from '@/lib/hrone/punch';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export async function GET() {
  try {
    const config = await getSystemScheduleConfig();
    const db = await getDatabase();
    const activeCount = await db.collection('employees').countDocuments({ status: 'ACTIVE' });
    const totalCount = await db.collection('employees').countDocuments();

    return NextResponse.json({
      success: true,
      config,
      stats: {
        activeEmployees: activeCount,
        totalEmployees: totalCount,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to retrieve schedule config';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      checkInMin,
      checkInMax,
      checkOutMin,
      checkOutMax,
      applyToAllEmployees = true,
      regenerateTodayPunches = true,
    } = body;

    // 1. Validation
    if (!checkInMin || !checkInMax || !checkOutMin || !checkOutMax) {
      return NextResponse.json(
        { success: false, error: 'All 4 timing fields (checkInMin, checkInMax, checkOutMin, checkOutMax) are required.' },
        { status: 400 }
      );
    }

    if (
      !TIME_REGEX.test(checkInMin) ||
      !TIME_REGEX.test(checkInMax) ||
      !TIME_REGEX.test(checkOutMin) ||
      !TIME_REGEX.test(checkOutMax)
    ) {
      return NextResponse.json(
        { success: false, error: 'Times must be formatted as 24-hour HH:mm (e.g. 09:30, 19:00).' },
        { status: 400 }
      );
    }

    if (timeToMinutes(checkInMin) > timeToMinutes(checkInMax)) {
      return NextResponse.json(
        { success: false, error: 'Earliest Check-In cannot be later than Latest Check-In.' },
        { status: 400 }
      );
    }

    if (timeToMinutes(checkOutMin) > timeToMinutes(checkOutMax)) {
      return NextResponse.json(
        { success: false, error: 'Earliest Check-Out cannot be later than Latest Check-Out.' },
        { status: 400 }
      );
    }

    if (timeToMinutes(checkInMax) >= timeToMinutes(checkOutMin)) {
      return NextResponse.json(
        { success: false, error: 'Check-In window must end before Check-Out window begins.' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const nowIso = new Date().toISOString();

    const newConfig: ScheduleConfig = {
      checkInMin,
      checkInMax,
      checkOutMin,
      checkOutMax,
      updatedAt: nowIso,
    };

    // 2. Persist to settings collection
    await db.collection('settings').updateOne(
      { _id: 'schedule_config' as unknown as import('mongodb').ObjectId },
      { $set: newConfig },
      { upsert: true }
    );

    let updatedCount = 0;
    let regeneratedPunchesCount = 0;

    // 3. Apply to all employees in database if requested
    if (applyToAllEmployees) {
      const updateResult = await db.collection('employees').updateMany(
        {},
        {
          $set: {
            'schedule.checkInMin': checkInMin,
            'schedule.checkInMax': checkInMax,
            'schedule.checkOutMin': checkOutMin,
            'schedule.checkOutMax': checkOutMax,
            updatedAt: nowIso,
          },
        }
      );
      updatedCount = updateResult.modifiedCount;
    }

    // 4. Optionally recalculate planned punches for today if still pending
    if (regenerateTodayPunches) {
      const todayDateStr = getISTPunchTime().split('T')[0];
      const activeEmps = await db.collection('employees').find({ status: 'ACTIVE' }).toArray();

      for (const emp of activeEmps) {
        if (!emp.todayPunch || emp.todayPunch.date !== todayDateStr) continue;

        const updateFields: Record<string, string> = {};

        if (emp.todayPunch.checkInStatus === 'PENDING') {
          updateFields['todayPunch.plannedCheckIn'] = generateRandomPunchTime(checkInMin, checkInMax);
        }
        if (emp.todayPunch.checkOutStatus === 'PENDING') {
          updateFields['todayPunch.plannedCheckOut'] = generateRandomPunchTime(checkOutMin, checkOutMax);
        }

        if (Object.keys(updateFields).length > 0) {
          updateFields['updatedAt'] = nowIso;
          await db.collection('employees').updateOne({ _id: emp._id }, { $set: updateFields });
          regeneratedPunchesCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      config: newConfig,
      updatedEmployeesCount: updatedCount,
      regeneratedPunchesCount,
      message: `Timings saved successfully! Updated ${updatedCount} employees and recalculated today's planned punches.`,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update schedule config';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
