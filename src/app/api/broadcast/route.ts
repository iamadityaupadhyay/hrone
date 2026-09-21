import { getAllEmployees } from '@/lib/db/employees';
import { getDatabase } from '@/lib/mongodb';
import { resolveWhatsAppRecipient } from '@/lib/whatsapp/recipient';
import { getWhatsAppBotStatus, sendBroadcast } from '@/whatsapp/bot';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const employees = await getAllEmployees();
    const recipientsMap = new Map<string, { employeeId: string; name: string; jid: string; status: string }>();

    for (const emp of employees) {
      const jid = resolveWhatsAppRecipient(emp);
      if (jid) {
        recipientsMap.set(jid, {
          employeeId: String(emp.employeeId),
          name: emp.name,
          jid,
          status: emp.status,
        });
      }
    }

    const db = await getDatabase();
    const history = await db
      .collection('broadcasts')
      .find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    return NextResponse.json({
      success: true,
      totalEmployees: employees.length,
      availableRecipientsCount: recipientsMap.size,
      recipients: Array.from(recipientsMap.values()),
      history: history.map((h) => ({
        id: String(h._id),
        message: h.message,
        target: h.target,
        status: h.status,
        totalRecipients: h.totalRecipients || 0,
        sentCount: h.sentCount || 0,
        failedCount: h.failedCount || 0,
        createdAt: h.createdAt,
        completedAt: h.completedAt,
      })),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const target = body.target || 'all'; // 'all' | 'active' | 'test'
    const testNumber = typeof body.testNumber === 'string' ? body.testNumber.trim() : '';

    if (!message) {
      return NextResponse.json({ success: false, error: 'Broadcast message cannot be empty' }, { status: 400 });
    }

    let recipients: Array<{ employeeId?: string; name?: string; jid: string }> = [];

    if (target === 'test') {
      if (!testNumber) {
        return NextResponse.json({ success: false, error: 'Test phone number is required for test broadcast' }, { status: 400 });
      }
      const clean = testNumber.replace(/\D/g, '');
      const jid = testNumber.includes('@')
        ? testNumber
        : (clean.length === 10 ? `91${clean}@s.whatsapp.net` : `${clean}@s.whatsapp.net`);
      recipients = [{ employeeId: 'TEST', name: 'Test Recipient', jid }];
    } else {
      const allEmployees = await getAllEmployees();
      const targetEmployees = target === 'active'
        ? allEmployees.filter((e) => e.status === 'ACTIVE' && e.schedule.active)
        : allEmployees;

      const jidSet = new Set<string>();
      for (const emp of targetEmployees) {
        const jid = resolveWhatsAppRecipient(emp);
        if (jid && !jidSet.has(jid)) {
          jidSet.add(jid);
          recipients.push({
            employeeId: String(emp.employeeId),
            name: emp.name,
            jid,
          });
        }
      }
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No reachable WhatsApp recipients found for the selected audience' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const broadcastDoc = {
      message,
      target,
      totalRecipients: recipients.length,
      recipients,
      status: 'QUEUED',
      sentCount: 0,
      failedCount: 0,
      createdAt: new Date().toISOString(),
    };

    const insertRes = await db.collection('broadcasts').insertOne(broadcastDoc);
    const broadcastId = String(insertRes.insertedId);

    // If WhatsApp socket happens to be running in this process, execute immediately
    const botStatus = getWhatsAppBotStatus();
    if (botStatus.connected) {
      await db.collection('broadcasts').updateOne(
        { _id: insertRes.insertedId },
        { $set: { status: 'SENDING', startedAt: new Date().toISOString() } }
      );

      const exec = await sendBroadcast(message, recipients);

      await db.collection('broadcasts').updateOne(
        { _id: insertRes.insertedId },
        {
          $set: {
            status: 'COMPLETED',
            sentCount: exec.sentCount,
            failedCount: exec.failedCount,
            results: exec.results,
            completedAt: new Date().toISOString(),
          },
        }
      );

      return NextResponse.json({
        success: true,
        broadcastId,
        status: 'COMPLETED',
        totalRecipients: recipients.length,
        sentCount: exec.sentCount,
        failedCount: exec.failedCount,
      });
    }

    // Otherwise it was queued for the worker process which polls every 5s
    return NextResponse.json({
      success: true,
      broadcastId,
      status: 'QUEUED',
      totalRecipients: recipients.length,
      message: 'Broadcast queued for immediate dispatch by the WhatsApp worker.',
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
