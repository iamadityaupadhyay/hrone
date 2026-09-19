import { getEmployeeById } from '@/lib/db/employees';
import { executePunch } from '@/lib/hrone/punch';
import { resolveWhatsAppRecipient } from '@/lib/whatsapp/recipient';
import { sendWhatsAppNotification } from '@/whatsapp/bot';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const employee = await getEmployeeById(id);
    if (!employee) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const punchType: 'CHECK_IN' | 'CHECK_OUT' =
      body.punchType === 'CHECK_OUT' ? 'CHECK_OUT' : 'CHECK_IN';
    const customTime = body.punchTime;

    const result = await executePunch(employee, punchType, 'MANUAL', customTime);

    // Send WhatsApp notification
    const recipient = resolveWhatsAppRecipient(employee);
    if (recipient) {
      const isCheckIn = punchType === 'CHECK_IN';
      const title = isCheckIn ? `✅ *Good morning ${employee.name}!*` : `🔴 *Good evening ${employee.name}!*`;
      const actionName = isCheckIn ? 'Check-In' : 'Check-Out';
      const timeStr = customTime || result.punchTime.split('T')[1] || result.punchTime;

      const icon = isCheckIn ? '🟢' : '🔴';
      const followBack = isCheckIn ? 'Reply *out* to Check-Out or *status*' : 'Reply *status* or *logs*';
      if (result.success) {
        await sendWhatsAppNotification(
          `${icon} Checked ${isCheckIn ? 'In' : 'Out'} at *${timeStr}*\n\n👉 ${followBack}`,
          recipient
        );
      } else {
        await sendWhatsAppNotification(
          `❌ ${actionName} failed: ${result.error || 'Cloud error'}\n\n👉 Reply *${isCheckIn ? 'in' : 'out'}* to retry`,
          recipient
        );
      }
    }

    return NextResponse.json({
      success: result.success,
      punchTime: result.punchTime,
      punchType,
      httpStatus: result.httpStatus,
      response: result.responsePayload,
      error: result.error,
      logId: result.logId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error executing punch';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
