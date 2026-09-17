import { getAllEmployees, updateEmployeeTokens } from '@/lib/db/employees';
import { loginWithHROne } from '@/lib/hrone/auth';
import { refreshHROneToken } from '@/lib/hrone/token';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const forcePassword = body.forcePassword === true;

    const employees = await getAllEmployees();
    if (employees.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No employees found to login',
        results: [],
      });
    }

    const results: Array<{
      employeeId: number;
      name: string;
      success: boolean;
      method: string;
      error?: string;
    }> = [];

    for (const emp of employees) {
      // 1. Forced Password Login (if requested and password available)
      if (forcePassword && emp.password) {
        try {
          const loginRes = await loginWithHROne(
            emp.username || String(emp.employeeId),
            emp.password,
            emp.companyDomainCode || 'uharvest'
          );

          if (loginRes.success && loginRes.accessToken) {
            await updateEmployeeTokens(
              emp.employeeId,
              loginRes.accessToken,
              loginRes.refreshToken || '',
              loginRes.tokenExpiry,
              loginRes.refreshTokenExpiry
            );
            results.push({
              employeeId: emp.employeeId,
              name: emp.name,
              success: true,
              method: 'PASSWORD',
            });
            continue;
          } else {
            results.push({
              employeeId: emp.employeeId,
              name: emp.name,
              success: false,
              method: 'PASSWORD',
              error: loginRes.error || 'Password auth failed',
            });
            continue;
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Login error';
          results.push({
            employeeId: emp.employeeId,
            name: emp.name,
            success: false,
            method: 'PASSWORD',
            error: msg,
          });
          continue;
        }
      }

      // 2. Standard Session Refresh (with password fallback built-in)
      try {
        const refreshRes = await refreshHROneToken(emp);
        if (refreshRes.success) {
          results.push({
            employeeId: emp.employeeId,
            name: emp.name,
            success: true,
            method: 'REFRESH_TOKEN',
          });
        } else {
          results.push({
            employeeId: emp.employeeId,
            name: emp.name,
            success: false,
            method: 'REFRESH_TOKEN',
            error: refreshRes.error || 'Failed to refresh session',
          });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Refresh error';
        results.push({
          employeeId: emp.employeeId,
          name: emp.name,
          success: false,
          method: 'REFRESH_TOKEN',
          error: msg,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      success: failCount === 0,
      message: `Processed login for ${results.length} employees: ${successCount} succeeded, ${failCount} failed.`,
      summary: { total: results.length, success: successCount, failed: failCount },
      results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Bulk login failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
