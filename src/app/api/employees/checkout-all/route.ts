import { getDatabase } from '@/lib/mongodb';
import { executePunch, getISTPunchTime } from '@/lib/hrone/punch';
import { resolveWhatsAppRecipient } from '@/lib/whatsapp/recipient';
import { sendWhatsAppNotification } from '@/whatsapp/bot';
import { EmployeeProfile } from '@/lib/types/employee';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function handleCheckoutAll(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    const force = searchParams.get('force') === 'true' || body.force === true;
    const customTime = searchParams.get('punchTime') || body.punchTime;

    const istNow = getISTPunchTime();
    const [todayDateStr, currentIstTime] = istNow.split('T');

    const db = await getDatabase();
    const collection = db.collection<EmployeeProfile>('employees');

    const query: Record<string, unknown> = {
      status: 'ACTIVE',
      'schedule.active': true,
      'todayPunch.date': todayDateStr,
      'todayPunch.checkOutStatus': { $ne: 'SUCCESS' },
    };

    if (!force) {
      query['todayPunch.checkInStatus'] = 'SUCCESS';
    }

    const employees = await collection.find(query).toArray();

    if (employees.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No employees pending check-out for today.',
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
      try {
        const res = await executePunch(emp, 'CHECK_OUT', 'MANUAL', customTime);
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
              `🌆 *Good evening ${emp.name}!* 🌙\n\n🔴 Auto Check-Out: *${timeStr}*\n📍 Location: *${location}*\n\n👉 Reply *status* for summary or *logs* for history`,
              recipient
            );
          } else {
            await sendWhatsAppNotification(
              `🌆 *Good evening ${emp.name}!*\n\n⚠️ Check-Out failed at *${timeStr}*: ${res.error || 'API error'}\n📍 Location: *${location}*\n\n👉 Reply *out* to retry manually`,
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
        await sleep(500); // 500ms delay between consecutive requests
      }
    }

    if (failCount > 0) {
      const { notifySuperAdmin } = await import('@/lib/whatsapp/admin');
      await notifySuperAdmin(
        `⚠️ *Batch Check-Out encountered ${failCount} failure(s)*\n\n` +
        `• Total Attempted: *${employees.length}*\n` +
        `• Succeeded: *${successCount}*\n` +
        `• Failed: *${failCount}*\n\n` +
        `Failed: ${results.filter((r) => !r.success).map((r) => `${r.name} (${r.error || 'Failed'})`).join(', ')}`,
        { alertType: 'PUNCH_FAILURE' }
      ).catch(() => {});
    }

    return NextResponse.json({
      success: failCount === 0,
      date: todayDateStr,
      message: `Processed check-out for ${employees.length} employees: ${successCount} succeeded, ${failCount} failed.`,
      summary: {
        total: employees.length,
        succeeded: successCount,
        failed: failCount,
      },
      results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Batch check-out failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleCheckoutAll(req);
}

export async function GET(req: NextRequest) {
  return handleCheckoutAll(req);
}
