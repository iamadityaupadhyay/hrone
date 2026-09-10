import { getRecentPunchLogs } from '@/lib/db/logs';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const employeeIdParam = searchParams.get('employeeId');
    const employeeId = employeeIdParam ? parseInt(employeeIdParam, 10) : undefined;

    const logs = await getRecentPunchLogs(limit, employeeId);
    return NextResponse.json({ success: true, logs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching logs';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
