import { getEmployeeById } from '@/lib/db/employees';
import {
  extractUnregularizedDays,
  fetchAttendanceCalendarDetails,
  submitAttendanceRegularization,
} from '@/lib/hrone/regularization';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/employees/[id]/regularize?year=2026&month=9
 * Fetch absent/unregularized days for an employee
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const emp = await getEmployeeById(id);

    if (!emp) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    const year = yearParam ? parseInt(yearParam, 10) : undefined;
    const month = monthParam ? parseInt(monthParam, 10) : undefined;

    const calendarRes = await fetchAttendanceCalendarDetails(emp, year, month);

    if (!calendarRes.success) {
      return NextResponse.json(
        { success: false, error: calendarRes.error || 'Failed to fetch calendar details' },
        { status: 400 }
      );
    }

    const unregularized = extractUnregularizedDays(calendarRes.data);

    return NextResponse.json({
      success: true,
      employeeId: emp.employeeId,
      name: emp.name,
      unregularizedCount: unregularized.length,
      unregularizedDays: unregularized,
      rawCalendar: calendarRes.data,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error processing request';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

/**
 * POST /api/employees/[id]/regularize
 * Submit regularization request for specified dates
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const emp = await getEmployeeById(id);

    if (!emp) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { dates, remarks = 'Tech Issue' } = body;

    let targetDates: string[] = [];

    if (Array.isArray(dates) && dates.length > 0) {
      targetDates = dates;
    } else {
      // Auto-fetch unregularized dates for current month if no dates explicitly passed
      const calendarRes = await fetchAttendanceCalendarDetails(emp);
      if (calendarRes.success) {
        const unreg = extractUnregularizedDays(calendarRes.data);
        targetDates = unreg.map((d) => d.date);
      }
    }

    if (!targetDates.length) {
      return NextResponse.json(
        { success: false, error: 'No absent or unregularized dates found to submit' },
        { status: 400 }
      );
    }

    const submitRes = await submitAttendanceRegularization(emp, targetDates, remarks);

    return NextResponse.json({
      success: submitRes.success,
      employeeId: emp.employeeId,
      name: emp.name,
      datesSubmitted: targetDates,
      message: submitRes.message,
      error: submitRes.error,
      responsePayload: submitRes.responsePayload,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error submitting regularization';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
