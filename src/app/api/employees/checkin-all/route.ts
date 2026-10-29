import { getDatabase } from '@/lib/mongodb';
import { executePunch, generateRandomPunchTime, getISTPunchTime } from '@/lib/hrone/punch';
import { resolveWhatsAppRecipient } from '@/lib/whatsapp/recipient';
import { sendWhatsAppNotification } from '@/whatsapp/bot';
import { EmployeeProfile } from '@/lib/types/employee';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function handleCheckinAll(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    const force = searchParams.get('force') === 'true' || body.force === true;
    const customTime = searchParams.get('punchTime') || body.punchTime;

    const istNow = getISTPunchTime();
    const [todayDateStr, currentIstTime] = istNow.split('T');

    const db = await getDatabase();
    const collection = db.collection<EmployeeProfile>('employees');

    const allActive = await collection.find({
      status: 'ACTIVE',
      'schedule.active': true,
    }).toArray();

    const employees = allActive.filter((emp) => {
      if (force) return true;
      // Skip if already successfully checked in today
      const tp = emp.todayPunch;
      if (tp && tp.date === todayDateStr && tp.checkInStatus === 'SUCCESS') {
        return false;
      }
      return true;
    });

    if (employees.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active employees pending check-in for today.',
        summary: { total: 0, succeeded: 0, failed: 0 },
        results: [],
      });
    }

    const results: Array<{
      employeeId: number;
      name: string;
      success: boolean;
      punchTime: string;
      httpStatus?: number;
      error?: string;
    }> = [];

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];

      // Ensure planned times exist for today
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
      }

      try {
        const res = await executePunch(emp, 'CHECK_IN', 'MANUAL', customTime);
        const record = {
          employeeId: emp.employeeId,
          name: emp.name,
          success: res.success,
          punchTime: res.punchTime,
          httpStatus: res.httpStatus,
          error: res.error,
        };
        results.push(record);

        if (res.success) {
          successCount++;
        } else {
          failCount++;
        }

        // Send WhatsApp notification if configured
        const recipient = resolveWhatsAppRecipient(emp);
        if (recipient) {
          const location = emp.geoLocation || 'Office';
          const timeStr = customTime || res.punchTime.split('T')[1] || currentIstTime;
          if (res.success) {
            await sendWhatsAppNotification(
              `🌅 *Good morning ${emp.name}!* ☀️\n\n🟢 Auto Check-In: *${timeStr}*\n📍 Location: *${location}*\n\n👉 Reply *status* for today or *out* to Check-Out`,
              recipient
            );
          } else {
            await sendWhatsAppNotification(
              `🌅 *Good morning ${emp.name}!*\n\n⚠️ Check-In failed at *${timeStr}*: ${res.error || 'API error'}\n📍 Location: *${location}*\n\n👉 Reply *in* to retry manually`,
              recipient
            );
          }
        }
      } catch (err: unknown) {
        failCount++;
        const msg = err instanceof Error ? err.message : 'Unknown punch error';
        results.push({
          employeeId: emp.employeeId,
          name: emp.name,
          success: false,
          punchTime: customTime || istNow,
          error: msg,
        });
      }

      if (i < employees.length - 1) {
        await sleep(500); // 500ms jitter between consecutive requests
      }
    }

    return NextResponse.json({
      success: failCount === 0,
      date: todayDateStr,
      message: `Processed check-in for ${employees.length} employees: ${successCount} succeeded, ${failCount} failed.`,
      summary: {
        total: employees.length,
        succeeded: successCount,
        failed: failCount,
      },
      results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Batch check-in failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleCheckinAll(req);
}

export async function GET(req: NextRequest) {
  return handleCheckinAll(req);
}
