import { getAllEmployees, upsertEmployee } from '@/lib/db/employees';
import { parseCurlOrInput } from '@/lib/hrone/parser';
import { EmployeeProfile } from '@/lib/types/employee';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';
    const sortBy = searchParams.get('sortBy') || 'pending_first';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limitParam = searchParams.get('limit') || '25';
    const isAll = limitParam === 'all';
    const limit = isAll ? 1000 : parseInt(limitParam, 10);

    const allEmployees = await getAllEmployees();
    const todayDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    // Calculate fleet-wide counts across all employees
    const activeCount = allEmployees.filter((e) => e.status === 'ACTIVE' && e.schedule.active).length;
    const satCount = allEmployees.filter((e) => (e.schedule?.workingDays || [1, 2, 3, 4, 5]).includes(6)).length;
    const checkedInTodayCount = allEmployees.filter(
      (e) => e.todayPunch?.date === todayDateStr && e.todayPunch?.checkInStatus === 'SUCCESS'
    ).length;
    const checkedOutTodayCount = allEmployees.filter(
      (e) => e.todayPunch?.date === todayDateStr && e.todayPunch?.checkOutStatus === 'SUCCESS'
    ).length;
    const pendingCheckInCount = allEmployees.filter(
      (e) => e.status === 'ACTIVE' && e.schedule.active && (!e.todayPunch || e.todayPunch.date !== todayDateStr || e.todayPunch.checkInStatus !== 'SUCCESS')
    ).length;
    const pendingCheckOutCount = allEmployees.filter(
      (e) => e.status === 'ACTIVE' && e.schedule.active && (!e.todayPunch || e.todayPunch.date !== todayDateStr || e.todayPunch.checkOutStatus !== 'SUCCESS')
    ).length;
    const missingPasswordCount = allEmployees.filter((e) => !e.password).length;

    // Filter employees by search and status
    const filtered = allEmployees.filter((emp) => {
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = emp.name.toLowerCase().includes(q);
        const matchId = String(emp.employeeId).includes(q);
        const matchUsername = (emp.username || '').toLowerCase().includes(q);
        const matchPhone = (emp.mobileNumber || '').includes(q);
        if (!matchName && !matchId && !matchUsername && !matchPhone) return false;
      }

      const isCheckedIn = emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkInStatus === 'SUCCESS';
      const isCheckedOut = emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkOutStatus === 'SUCCESS';
      const isPendingIn = emp.status === 'ACTIVE' && emp.schedule.active && !isCheckedIn;
      const isPendingOut = emp.status === 'ACTIVE' && emp.schedule.active && !isCheckedOut;
      const isPaused = emp.status !== 'ACTIVE' || !emp.schedule.active;
      const hasSaturday = (emp.schedule?.workingDays || [1, 2, 3, 4, 5]).includes(6);
      const hasMissingPw = !emp.password;

      switch (status) {
        case 'checked_in': return isCheckedIn;
        case 'pending_in': return isPendingIn;
        case 'checked_out': return isCheckedOut;
        case 'pending_out': return isPendingOut;
        case 'paused': return isPaused;
        case 'saturday': return hasSaturday;
        case 'missing_pw': return hasMissingPw;
        default: return true;
      }
    });

    // Sort employees
    filtered.sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (sortBy === 'id_asc') return a.employeeId - b.employeeId;
      if (sortBy === 'id_desc') return b.employeeId - a.employeeId;
      if (sortBy === 'token_expiry') {
        const tA = a.tokenExpiry ? new Date(a.tokenExpiry).getTime() : 0;
        const tB = b.tokenExpiry ? new Date(b.tokenExpiry).getTime() : 0;
        return tA - tB;
      }
      if (sortBy === 'pending_first') {
        const aIn = a.todayPunch?.date === todayDateStr && a.todayPunch?.checkInStatus === 'SUCCESS';
        const bIn = b.todayPunch?.date === todayDateStr && b.todayPunch?.checkInStatus === 'SUCCESS';
        if (!aIn && bIn) return -1;
        if (aIn && !bIn) return 1;

        const aOut = a.todayPunch?.date === todayDateStr && a.todayPunch?.checkOutStatus === 'SUCCESS';
        const bOut = b.todayPunch?.date === todayDateStr && b.todayPunch?.checkOutStatus === 'SUCCESS';
        if (!aOut && bOut) return -1;
        if (aOut && !bOut) return 1;

        return a.name.localeCompare(b.name);
      }
      return 0;
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * limit;
    const paginated = isAll ? filtered : filtered.slice(start, start + limit);

    return NextResponse.json({
      success: true,
      employees: paginated,
      pagination: {
        total,
        totalCount: total,
        page: safePage,
        limit: isAll ? total : limit,
        totalPages,
      },
      counts: {
        total: allEmployees.length,
        activeCount,
        satCount,
        checkedInTodayCount,
        checkedOutTodayCount,
        pendingCheckInCount,
        pendingCheckOutCount,
        missingPasswordCount,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch employees';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

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
      schedule: {
        active: true,
        checkInMin: '09:30',
        checkInMax: '09:55',
        checkOutMin: '19:00',
        checkOutMax: '19:30',
        workingDays: [1, 2, 3, 4, 5],
        ...(body.schedule || {}),
      },
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const id = await upsertEmployee(employeeRecord);
    return NextResponse.json({
      success: true,
      message: 'Employee saved successfully',
      id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error creating employee';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
