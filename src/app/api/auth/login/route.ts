import { NextRequest, NextResponse } from 'next/server';
import { upsertEmployee } from '@/lib/db/employees';
import { syncEmployeeHolidays } from '@/lib/db/holidays';
import { loginWithHROne } from '@/lib/hrone/auth';
import { EmployeeProfile } from '@/lib/types/employee';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password, companyDomainCode = 'uharvest', schedule, geoLocation, latitude, longitude, geoAccuracy } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username/Employee code and password are required' },
        { status: 400 }
      );
    }

    const loginRes = await loginWithHROne(username, password, companyDomainCode);

    if (!loginRes.success || !loginRes.accessToken || !loginRes.employeeId) {
      return NextResponse.json(
        { success: false, error: loginRes.error || 'Authentication failed' },
        { status: 401 }
      );
    }

    const newProfile: Omit<EmployeeProfile, '_id'> = {
      employeeId: loginRes.employeeId,
      name: loginRes.name || username,
      username: loginRes.username || username,
      password,
      companyDomainCode: loginRes.domainCode || 'uharvest',
      jwtToken: loginRes.accessToken,
      refreshToken: loginRes.refreshToken || '',
      tokenExpiry: loginRes.tokenExpiry,
      refreshTokenExpiry: loginRes.refreshTokenExpiry,
      latitude: latitude || '28.5004327',
      longitude: longitude || '77.4150811',
      geoAccuracy: geoAccuracy || '12.126',
      geoLocation: geoLocation || '210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India',
      schedule: schedule || {
        active: true,
        checkInMin: '09:30',
        checkInMax: '09:55',
        checkOutMin: '19:00',
        checkOutMax: '19:30',
        workingDays: [1, 2, 3, 4, 5],
      },
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const id = await upsertEmployee(newProfile);

    // Sync holiday calendar for this employee asynchronously
    syncEmployeeHolidays({ ...newProfile, _id: id }).catch((err) =>
      console.error(`[Auth Login] Failed background holiday sync for ${newProfile.name}:`, err)
    );

    return NextResponse.json({
      success: true,
      message: `Successfully logged in and enrolled ${newProfile.name} (ID: ${newProfile.employeeId})`,
      employeeId: id,
      profile: { ...newProfile, _id: id },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Login error: ${message}` },
      { status: 500 }
    );
  }
}
