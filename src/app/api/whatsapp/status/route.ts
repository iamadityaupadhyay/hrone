import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDatabase();
    const session = await db.collection('whatsapp_session').findOne({ _id: 'current_session' as unknown as import('mongodb').ObjectId });

    if (!session) {
      return NextResponse.json({
        success: true,
        status: 'OFFLINE',
        message: 'WhatsApp bot worker is not running. Run "npm run whatsapp" or start worker.',
      });
    }

    return NextResponse.json({
      success: true,
      status: session.status || 'DISCONNECTED',
      phoneNumber: session.phoneNumber || null,
      qrDataUrl: session.qrDataUrl || null,
      updatedAt: session.updatedAt || null,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
