import { getDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action === 'pause' ? 'pause' : 'resume';
    const isResume = action === 'resume';

    const db = await getDatabase();
    const result = await db.collection('employees').updateMany(
      {},
      {
        $set: {
          status: isResume ? 'ACTIVE' : 'PAUSED',
          'schedule.active': isResume,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      action,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      message: `Successfully ${isResume ? 'resumed' : 'paused'} auto-pilot for all ${result.matchedCount} employees.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Bulk autopilot action failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
