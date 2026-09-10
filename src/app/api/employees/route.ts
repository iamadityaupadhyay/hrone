import { getAllEmployees, upsertEmployee } from '@/lib/db/employees';
import { parseCurlOrInput } from '@/lib/hrone/parser';
import { refreshHROneToken } from '@/lib/hrone/token';
import { EmployeeProfile } from '@/lib/types/employee';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const employees = await getAllEmployees();
    return NextResponse.json({ success: true, employees });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch employees';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if user submitted raw curl or raw input
    let profileData: Partial<EmployeeProfile> = {};

    if (body.rawCurl) {
      const parsed = parseCurlOrInput(body.rawCurl);
      profileData = {
        employeeId: parsed.employeeId || body.employeeId,
        name: body.name || parsed.name || 'Employee',
        username: parsed.username || body.username || '',
        companyDomainCode: parsed.companyDomainCode || 'uharvest',
        jwtToken: parsed.jwtToken || '',
        refreshToken: parsed.refreshToken || '',
        tokenExpiry: parsed.tokenExpiry,
        refreshTokenExpiry: parsed.refreshTokenExpiry,
        latitude: parsed.latitude || '28.5004327',
        longitude: parsed.longitude || '77.4150811',
        geoAccuracy: parsed.geoAccuracy || '12.126',
        geoLocation:
          parsed.geoLocation ||
          '210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India',
      };
    } else {
      profileData = body;
    }

    if (!profileData.employeeId || !profileData.refreshToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Employee ID and RefreshToken are required.',
        },
        { status: 400 }
      );
    }

    const employeeRecord: Omit<EmployeeProfile, '_id'> & { _id?: string } = {
      _id: body._id,
      employeeId: Number(profileData.employeeId),
      name: profileData.name || `Employee ${profileData.employeeId}`,
      username: profileData.username || String(profileData.employeeId),
      companyDomainCode: profileData.companyDomainCode || 'uharvest',
      jwtToken: profileData.jwtToken || '',
      refreshToken: profileData.refreshToken || '',
      tokenExpiry: profileData.tokenExpiry,
      refreshTokenExpiry: profileData.refreshTokenExpiry,
      latitude: profileData.latitude || '28.5004327',
      longitude: profileData.longitude || '77.4150811',
      geoAccuracy: profileData.geoAccuracy || '12.126',
      geoLocation:
        profileData.geoLocation ||
        '210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India',
      schedule: profileData.schedule || {
        active: true,
        checkInMin: '08:00',
        checkInMax: '10:00',
        checkOutMin: '18:00',
        checkOutMax: '20:00',
        workingDays: [1, 2, 3, 4, 5],
      },
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Verify token or refresh right now to ensure credentials work
    if (employeeRecord.refreshToken) {
      try {
        const refreshRes = await refreshHROneToken(employeeRecord as EmployeeProfile);
        if (refreshRes.success && refreshRes.accessToken) {
          employeeRecord.jwtToken = refreshRes.accessToken;
          if (refreshRes.refreshToken) {
            employeeRecord.refreshToken = refreshRes.refreshToken;
          }
          employeeRecord.tokenExpiry = refreshRes.tokenExpiry;
          employeeRecord.refreshTokenExpiry = refreshRes.refreshTokenExpiry;
          employeeRecord.lastTokenRefresh = new Date().toISOString();
        }
      } catch (e) {
        console.warn('Initial token refresh test failed during onboarding:', e);
      }
    }

    const savedId = await upsertEmployee(employeeRecord);

    return NextResponse.json({
      success: true,
      id: savedId,
      message: `Employee ${employeeRecord.name} onboarded successfully!`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save employee';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
