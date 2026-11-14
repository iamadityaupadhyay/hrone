import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { getAllEmployees } from '@/lib/db/employees';
import { sendWhatsAppNotification } from '@/whatsapp/bot';
import { resolveWhatsAppRecipient } from '@/lib/whatsapp/recipient';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDatabase();
    const payments = await db
      .collection('subscription_payments')
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({ success: true, payments });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch payments';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { paymentId, action = 'APPROVE', days = 30 } = body;

    if (!paymentId) {
      return NextResponse.json({ success: false, error: 'Payment ID is required.' }, { status: 400 });
    }

    const db = await getDatabase();
    let queryId: any;
    try {
      queryId = new ObjectId(paymentId);
    } catch {
      queryId = paymentId;
    }

    const payment = await db.collection('subscription_payments').findOne({
      $or: [{ _id: queryId }, { utr: paymentId }],
    });

    if (!payment) {
      return NextResponse.json({ success: false, error: 'Payment not found.' }, { status: 404 });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    if (action === 'REJECT') {
      await db.collection('subscription_payments').updateOne(
        { _id: payment._id },
        { $set: { status: 'REJECTED', updatedAt: nowIso, updatedBy: 'Admin' } }
      );
      return NextResponse.json({ success: true, message: 'Payment rejected.' });
    }

    // Action: APPROVE
    const validUntil = new Date(now.getTime() + (Number(days) || 30) * 24 * 60 * 60 * 1000).toISOString();
    const plan = payment.plan || 'PRO_149';

    await db.collection('subscription_payments').updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'APPROVED',
          verifiedAt: nowIso,
          verifiedBy: 'Super Admin',
          updatedAt: nowIso,
        },
      }
    );

    // Update Employee Subscription
    const allEmps = await getAllEmployees();
    const targetEmp = allEmps.find(
      (e) =>
        (payment.employeeId && e.employeeId === payment.employeeId) ||
        e.name.toLowerCase() === (payment.employeeName || '').toLowerCase()
    );

    if (targetEmp) {
      await db.collection('employees').updateOne(
        { employeeId: targetEmp.employeeId },
        {
          $set: {
            subscription: {
              plan,
              status: 'ACTIVE',
              validUntil,
              activatedAt: nowIso,
              amountPaid: payment.amount || (plan === 'PRO_149' ? 149 : 99),
              isComped: false,
            },
            updatedAt: nowIso,
          },
        }
      );

      // Notify employee on WhatsApp
      const recipient = resolveWhatsAppRecipient(targetEmp);
      if (recipient) {
        const planName = plan === 'PRO_149' ? '⭐ Pro Suite (₹149/mo)' : '🟢 Standard Plan (₹99/mo)';
        const expiryFormatted = new Date(validUntil).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });

        const receiptMsg =
          `✅ *Payment Approved — Subscription Active!* 🎉\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 *Employee:* ${targetEmp.name}\n` +
          `📦 *Plan:* ${planName}\n` +
          `💰 *Amount:* ₹${payment.amount}\n` +
          `🔢 *UTR Reference:* ${payment.utr}\n` +
          `📅 *Valid Until:* ${expiryFormatted}\n\n` +
          `All attendance features are active and verified. Thank you for your payment!\n` +
          `👉 Reply *sub* or *status* anytime.`;

        sendWhatsAppNotification(receiptMsg, recipient).catch((err) => {
          console.warn('[Payments] Failed to dispatch receipt to employee:', err);
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Payment approved! Subscription activated for ${targetEmp ? targetEmp.name : payment.employeeName} for ${days} days.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to process payment';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
