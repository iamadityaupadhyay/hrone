import { getEmployeeById, updateEmployeeTokens } from '@/lib/db/employees';
import { loginWithHROne } from '@/lib/hrone/auth';
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

    const body = await req.json().catch(() => ({}));
    const forcePassword = body.forcePassword === true;

    // Direct password login fallback if requested or if employee has password
    if (forcePassword && employee.password) {
      const loginRes = await loginWithHROne(
        employee.username || String(employee.employeeId),
        employee.password,
        employee.companyDomainCode || 'uharvest'
      );

      if (loginRes.success && loginRes.accessToken) {
        await updateEmployeeTokens(
          employee.employeeId,
          loginRes.accessToken,
          loginRes.refreshToken || '',
          loginRes.tokenExpiry,
          loginRes.refreshTokenExpiry
        );
        return NextResponse.json({
          success: true,
          method: 'PASSWORD',
          message: `Successfully re-authenticated ${employee.name} with password!`,
        });
      } else {
        return NextResponse.json(
          { success: false, error: loginRes.error || 'Password login failed' },
          { status: 400 }
        );
      }
    }

    // Normal refresh token (which also auto-falls back to password if refresh fails)
    const result = await refreshHROneToken(employee);

    if (result.success) {
      return NextResponse.json({
        success: true,
        method: 'REFRESH_TOKEN',
        message: 'Token refreshed successfully and updated in MongoDB',
        tokenExpiry: result.tokenExpiry,
        refreshTokenExpiry: result.refreshTokenExpiry,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to refresh session',
        },
        { status: 400 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error logging in / refreshing session';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
