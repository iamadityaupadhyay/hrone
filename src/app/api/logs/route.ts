import { getPaginatedPunchLogs } from '@/lib/db/logs';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const employeeIdParam = searchParams.get('employeeId');
    const employeeId = employeeIdParam ? parseInt(employeeIdParam, 10) : undefined;
    const status = (searchParams.get('status') as 'all' | 'success' | 'failed') || 'all';
    const punchType = (searchParams.get('punchType') as 'all' | 'CHECK_IN' | 'CHECK_OUT') || 'all';
    const search = searchParams.get('search') || '';
    const date = searchParams.get('date') || '';

    const data = await getPaginatedPunchLogs({
      page,
      limit,
      employeeId,
      status,
      punchType,
      search,
      date,
    });

    return NextResponse.json({
      success: true,
      logs: data.logs,
      pagination: {
        total: data.total,
        totalCount: data.total,
        page: data.page,
        limit,
        totalPages: data.totalPages,
        hasNext: data.page < data.totalPages,
        hasPrev: data.page > 1,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching logs';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
