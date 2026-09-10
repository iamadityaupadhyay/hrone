import { getEmployeeById } from '@/lib/db/employees';
import { executePunch } from '@/lib/hrone/punch';
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
