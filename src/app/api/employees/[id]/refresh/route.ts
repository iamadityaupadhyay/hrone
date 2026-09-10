import { getEmployeeById } from '@/lib/db/employees';
import { refreshHROneToken } from '@/lib/hrone/token';
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

    const result = await refreshHROneToken(employee);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Token refreshed successfully and updated in MongoDB',
        tokenExpiry: result.tokenExpiry,
        refreshTokenExpiry: result.refreshTokenExpiry,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to refresh token',
        },
        { status: 400 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error refreshing token';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
