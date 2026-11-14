import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getDatabase } from '@/lib/mongodb';
import { getSubscriptionSettings } from '@/lib/db/settings';
import { getAllEmployees } from '@/lib/db/employees';
import { sendWhatsAppNotification } from '@/whatsapp/bot';
import { resolveWhatsAppRecipient } from '@/lib/whatsapp/recipient';
import { EmployeeProfile } from '@/lib/types/employee';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const empParam = searchParams.get('emp') || searchParams.get('id') || '';
    const planParam = searchParams.get('plan') || '149';

    const settings = await getSubscriptionSettings();
    const upiId = (settings as any).upiId || process.env.UPI_ID || 'aditya@upi';
    const upiName = (settings as any).upiName || process.env.UPI_NAME || 'HROne Attendance';

    const allEmps = await getAllEmployees();
    const employee = empParam
      ? allEmps.find(
          (e) =>
            e.employeeId.toString() === empParam ||
            e._id?.toString() === empParam ||
            e.username === empParam ||
            (e.mobileNumber && e.mobileNumber.includes(empParam))
        )
      : null;

    const amount = planParam === '99' ? 99 : 149;
    const planType = amount === 149 ? 'PRO_149' : 'BASIC_99';
    const planName = amount === 149 ? 'Pro Suite' : 'Standard Plan';

    const note = employee
      ? `HROne-${employee.employeeId}-${amount}`
      : `HROne-Sub-${amount}`;

    // Standard NPCI UPI URI
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
      upiName
    )}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;

    // Generate high-res base64 QR Code
    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    return NextResponse.json({
      success: true,
      gateway: {
        upiId,
        upiName,
        amount,
        planType,
        planName,
        note,
        upiUri,
        qrDataUrl,
      },
      employee: employee
        ? {
            id: employee.employeeId,
            name: employee.name,
            username: employee.username,
            mobileNumber: employee.mobileNumber,
          }
        : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate payment gateway details';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employeeId, plan = 'PRO_149', amount = 149, utr, senderName } = body;

    if (!utr || String(utr).trim().length < 6) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid 12-digit UPI Reference / UTR number.' },
        { status: 400 }
      );
    }

    const cleanUtr = String(utr).trim();
    const db = await getDatabase();

    // Check if UTR was already submitted
    const existing = await db.collection('subscription_payments').findOne({ utr: cleanUtr });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `This UTR (${cleanUtr}) has already been submitted.` },
        { status: 409 }
      );
    }

    const allEmps = await getAllEmployees();
    const employee = employeeId
      ? allEmps.find((e) => e.employeeId.toString() === String(employeeId))
      : null;

    const paymentDoc = {
      employeeId: employee ? employee.employeeId : null,
      employeeName: employee ? employee.name : (senderName || 'Anonymous'),
      plan,
      amount: Number(amount) || (plan === 'PRO_149' ? 149 : 99),
      utr: cleanUtr,
      status: 'PENDING',
      method: 'UPI',
      createdAt: new Date().toISOString(),
    };

    const insertRes = await db.collection('subscription_payments').insertOne(paymentDoc);

    // Notify Super Admin (Aditya) via WhatsApp
    const adminEmp = allEmps.find((e) => e.isSuperAdmin);
    if (adminEmp) {
      const adminRecipient = resolveWhatsAppRecipient(adminEmp);
      if (adminRecipient) {
        const planBadge = plan === 'PRO_149' ? '⭐ Pro Suite (₹149)' : '🟢 Standard Plan (₹99)';
        const adminMsg =
          `🔔 *New Subscription Payment Received!* 💰\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 *Employee:* ${paymentDoc.employeeName} (${paymentDoc.employeeId ? `#${paymentDoc.employeeId}` : 'Web'})\n` +
          `📦 *Plan:* ${planBadge}\n` +
          `💰 *Amount:* ₹${paymentDoc.amount}\n` +
          `🔢 *UTR / Ref:* *${cleanUtr}*\n` +
          `📅 *Time:* ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST\n\n` +
          `👉 *Quick Action:*\n` +
          `• Reply: *admin approve ${cleanUtr}*\n` +
          `• Or approve via Dashboard UI with 1 click!`;

        sendWhatsAppNotification(adminMsg, adminRecipient).catch((err) => {
          console.warn('[Payment] Failed to send admin WhatsApp alert:', err);
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment reference submitted successfully! Our team is verifying your transaction.',
      paymentId: insertRes.insertedId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to submit payment reference';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

