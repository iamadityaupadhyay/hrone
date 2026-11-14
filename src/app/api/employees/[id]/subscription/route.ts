import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { getEmployeeById } from '@/lib/db/employees';
import { sendWhatsAppNotification } from '@/whatsapp/bot';
import { resolveWhatsAppRecipient } from '@/lib/whatsapp/recipient';
import { SubscriptionPlan, SubscriptionStatus, EmployeeProfile } from '@/lib/types/employee';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const {
      plan = 'PRO_149' as SubscriptionPlan,
      status = 'ACTIVE' as SubscriptionStatus,
      durationDays = 30,
      isComped = false,
      notifyWhatsApp = true,
    } = body;

    const db = await getDatabase();
    const allEmps = await db.collection('employees').find({}).toArray();
    const employee = allEmps.find(
      (e) =>
        e._id?.toString() === id ||
        e.employeeId?.toString() === id ||
        e.username === id
    );

    if (!employee) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }

    const now = new Date();
    const validUntil = isComped
      ? '2099-12-31T23:59:59.000Z'
      : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    const amountPaid = isComped ? 0 : plan === 'PRO_149' ? 149 : 99;

    const subscriptionData = {
      plan,
      status: isComped ? 'LIFETIME_FREE' : status,
      validUntil,
      activatedAt: now.toISOString(),
      amountPaid,
      isComped: Boolean(isComped),
    };

    await db.collection('employees').updateOne(
      { _id: employee._id },
      {
        $set: {
          subscription: subscriptionData,
          updatedAt: now.toISOString(),
        },
      }
    );

    // Optionally notify employee on WhatsApp
    if (notifyWhatsApp) {
      const planName = plan === 'PRO_149' ? '⭐ Pro Suite (₹149/mo)' : '🟢 Standard Plan (₹99/mo)';
      const expiryFormatted = isComped
        ? 'Permanent VIP Lifetime Pass'
        : new Date(validUntil).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

      const msg =
        `🎉 *Your Attendance Subscription is Activated!* 🚀\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Employee:* ${employee.name} (${employee.employeeId})\n` +
        `📦 *Active Plan:* ${planName}\n` +
        `📅 *Valid Until:* ${expiryFormatted}\n\n` +
        (isComped
          ? `👑 You have been granted permanent VIP access to all features.`
          : `All features for your plan are active and ready.`) +
        `\n👉 Reply *sub* or *status* anytime to view your card.`;

      const recipient = resolveWhatsAppRecipient(employee as unknown as EmployeeProfile);
      if (recipient) {
        sendWhatsAppNotification(msg, recipient).catch((err) => {
          console.warn('[Subscription] Failed to dispatch WhatsApp notice:', err);
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully updated subscription for ${employee.name}.`,
      subscription: subscriptionData,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update subscription';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
