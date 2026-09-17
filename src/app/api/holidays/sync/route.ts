import { getAllEmployees, getEmployeeById } from '@/lib/db/employees';
import { getEmployeeHolidays, syncEmployeeHolidays } from '@/lib/db/holidays';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const employeeId = body.employeeId;
    const year = body.year ? Number(body.year) : new Date().getFullYear();

    if (employeeId) {
      const emp = await getEmployeeById(String(employeeId));
      if (!emp) {
        return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
      }

      const syncRes = await syncEmployeeHolidays(emp, year);
      const holidays = await getEmployeeHolidays(emp.employeeId, year);

      return NextResponse.json({
        success: syncRes.success,
        employeeId: emp.employeeId,
        count: syncRes.count,
        error: syncRes.error,
        holidays,
      });
    }

    // Sync all active employees
    const employees = await getAllEmployees();
    const active = employees.filter((e) => e.status === 'ACTIVE');

    const results = [];
    for (const emp of active) {
      const res = await syncEmployeeHolidays(emp, year);
      results.push({
        employeeId: emp.employeeId,
        name: emp.name,
        success: res.success,
        count: res.count,
        error: res.error,
      });
    }

    return NextResponse.json({
      success: true,
      year,
      totalEmployees: active.length,
      results,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to sync holidays';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeIdStr = searchParams.get('employeeId');
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : new Date().getFullYear();

    if (!employeeIdStr) {
      return NextResponse.json(
        { success: false, error: 'Missing required query param: employeeId' },
        { status: 400 }
      );
    }

    const holidays = await getEmployeeHolidays(Number(employeeIdStr), year);
    return NextResponse.json({
      success: true,
      employeeId: Number(employeeIdStr),
      year,
      holidays,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch holidays';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
