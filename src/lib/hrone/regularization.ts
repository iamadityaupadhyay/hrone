import { EmployeeProfile } from '@/lib/types/employee';
import { refreshHROneToken } from './token';

export interface UnregularizedDay {
  date: string; // "YYYY-MM-DD"
  status: string; // "Absent", "Missing Punch", etc.
  rawStatus?: string;
}

export interface RegularizationRequestItem {
  rowId: number;
  attendanceDate: string; // "YYYY-MM-DD"
  inDate: string; // ISO string e.g. "2026-08-30T18:30:00.000Z"
  inTimeHours: string; // "09"
  inTimeMintues: string; // "00"
  outDate: string; // ISO string e.g. "2026-08-30T18:30:00.000Z"
  outTimeHours: string; // "18"
  outTimeMintues: string; // "00"
  attendanceRegularizationType: number; // 3
  attendanceRemarks: string; // "Tech Issue"
  file: null;
  calculatedHrs: string; // "You are marking AR for 9 hours 0 minutes"
  error: string;
  timeIn: string; // "YYYY-MM-DD T09:00"
  timeout: string; // "YYYY-MM-DD T18:00"
}

export interface RegularizationSubmitResult {
  success: boolean;
  httpStatus?: number;
  message?: string;
  responsePayload?: unknown;
  error?: string;
}

/**
 * Fetch calendar basic details for an employee from HROne API
 */
export async function fetchAttendanceCalendarDetails(
  employee: EmployeeProfile,
  year?: number,
  month?: number
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  let activeJwt = employee.jwtToken;
  let activeRefresh = employee.refreshToken;

  const now = new Date();
  // IST Date handling
  const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const [currentYearStr, currentMonthStr] = istDateStr.split('-');

  const attendanceYear = year || parseInt(currentYearStr, 10);
  const attendanceMonth = month || parseInt(currentMonthStr, 10);

  // Check token expiry
  const isTokenExpiring =
    !employee.tokenExpiry ||
    new Date(employee.tokenExpiry).getTime() - Date.now() < 2 * 60 * 60 * 1000;

  if (isTokenExpiring && employee.refreshToken) {
    const refreshRes = await refreshHROneToken(employee);
    if (refreshRes.success && refreshRes.accessToken && refreshRes.refreshToken) {
      activeJwt = refreshRes.accessToken;
      activeRefresh = refreshRes.refreshToken;
    }
  }

  const endpoint = 'https://app.hrone.cloud/api/timeoffice/attendance/Calendar/Basic/Details';
  const domain = employee.companyDomainCode || 'uharvest';

  const payload = {
    attendanceYear,
    attendanceMonth,
    employeeId: employee.employeeId,
    isRequestStatus: true,
  };

  const makeRequest = async (jwt: string, refresh: string) => {
    return await fetch(endpoint, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.8',
        'accessmode': 'W',
        'content-type': 'application/json',
        'domaincode': domain,
        'origin': 'https://app.hrone.cloud',
        'referer': 'https://app.hrone.cloud/app/request/initiate-attendance-regularization',
        'cookie': `JwtTokenCookie=${jwt}; RefreshTokenCookie=${refresh}`,
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        'x-requested-with': 'https://app.hrone.cloud',
      },
      body: JSON.stringify(payload),
    });
  };

  try {
    let response = await makeRequest(activeJwt, activeRefresh);

    if (response.status === 401 && employee.refreshToken) {
      const refreshRes = await refreshHROneToken(employee);
      if (refreshRes.success && refreshRes.accessToken && refreshRes.refreshToken) {
        activeJwt = refreshRes.accessToken;
        activeRefresh = refreshRes.refreshToken;
        response = await makeRequest(activeJwt, activeRefresh);
      }
    }

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: Failed to fetch calendar details`,
      };
    }

    const json = await response.json();
    return {
      success: true,
      data: json,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error fetching calendar details';
    return { success: false, error: msg };
  }
}

/**
 * Filter absent or unregularized days from calendar basic details response
 */
export function extractUnregularizedDays(calendarData: unknown): UnregularizedDay[] {
  if (!calendarData || typeof calendarData !== 'object') return [];

  // HROne calendar response can contain array directly or under data/result/calendarDetails/rows
  const obj = calendarData as Record<string, unknown>;
  const rawList: unknown[] = Array.isArray(calendarData)
    ? (calendarData as unknown[])
    : Array.isArray(obj.data)
    ? (obj.data as unknown[])
    : Array.isArray(obj.result)
    ? (obj.result as unknown[])
    : Array.isArray(obj.calendarDetails)
    ? (obj.calendarDetails as unknown[])
    : Array.isArray(obj.attendanceCalendarDetails)
    ? (obj.attendanceCalendarDetails as unknown[])
    : Array.isArray(obj.rows)
    ? (obj.rows as unknown[])
    : [];

  const unregularized: UnregularizedDay[] = [];
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;

    const dateRaw = String(rec.attendanceDate || rec.date || rec.fromDate || rec.dayDate || '');
    if (!dateRaw) continue;

    let dateStr = '';
    if (/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) {
      dateStr = dateRaw.slice(0, 10);
    } else {
      const parsedDate = new Date(dateRaw);
      if (!isNaN(parsedDate.getTime())) {
        const y = parsedDate.getFullYear();
        const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const d = String(parsedDate.getDate()).padStart(2, '0');
        dateStr = `${y}-${m}-${d}`;
      }
    }

    if (!dateStr || dateStr > todayStr) continue; // Skip unperformed future dates

    // HROne explicit fields
    const fh = String(rec.updatedFirstHalfStatus || '').toUpperCase();
    const sh = String(rec.updatedSecondHalfStatus || '').toUpperCase();
    const fhColor = String(rec.firstHalfStatusColor || '').toUpperCase();
    const shColor = String(rec.secondHalfStatusColor || '').toUpperCase();
    const isLeave = Boolean(rec.isLeave);

    // HROne red status color for absent is #F27C7C
    const isFhAbsent = fh === 'A' || fhColor === '#F27C7C';
    const isShAbsent = sh === 'A' || shColor === '#F27C7C';

    // Fallback checks for status string
    const status = String(rec.status || rec.attendanceStatus || rec.statusCode || rec.statusName || '').toUpperCase();
    const isGeneralAbsent = Boolean(rec.isAbsent || status === 'A' || status === 'ABSENT');
    const isMissingIn = Boolean(rec.isInPunchMissing || status.includes('MISSING_IN') || status.includes('IN_MISSING'));
    const isMissingOut = Boolean(rec.isOutPunchMissing || status.includes('MISSING_OUT') || status.includes('OUT_MISSING'));

    // Skip Weekly Offs (WO), Holidays (HO/H), Approved Leaves
    const isHolidayOrOff = fh === 'WO' || sh === 'WO' || fh === 'HO' || sh === 'HO' || status === 'H' || status === 'WO' || isLeave;
    const isAlreadyRegularized = Boolean(rec.isRegularized || rec.attendanceRegularizationStatus === 'APPROVED' || rec.attendanceRegularizationStatus === 'PENDING');

    if ((isFhAbsent || isShAbsent || isGeneralAbsent || isMissingIn || isMissingOut) && !isHolidayOrOff && !isAlreadyRegularized) {
      let label = 'Absent (Full Day)';
      if (isFhAbsent && isShAbsent) {
        label = 'Absent (Full Day)';
      } else if (isFhAbsent) {
        label = 'Absent (1st Half)';
      } else if (isShAbsent) {
        label = 'Absent (2nd Half)';
      } else if (isMissingIn || isMissingOut) {
        label = 'Missed Punch';
      }

      unregularized.push({
        date: dateStr,
        status: label,
        rawStatus: `1st Half: ${fh}, 2nd Half: ${sh}`,
      });
    }
  }

  return unregularized;
}

/**
 * Submit Attendance Regularization Request for selected dates to HROne API
 */
export async function submitAttendanceRegularization(
  employee: EmployeeProfile,
  dates: string[],
  remarks: string = 'Tech Issue'
): Promise<RegularizationSubmitResult> {
  if (!dates.length) {
    return { success: false, error: 'No dates provided for regularization' };
  }

  let activeJwt = employee.jwtToken;
  let activeRefresh = employee.refreshToken;

  // Check token expiry
  const isTokenExpiring =
    !employee.tokenExpiry ||
    new Date(employee.tokenExpiry).getTime() - Date.now() < 2 * 60 * 60 * 1000;

  if (isTokenExpiring && employee.refreshToken) {
    const refreshRes = await refreshHROneToken(employee);
    if (refreshRes.success && refreshRes.accessToken && refreshRes.refreshToken) {
      activeJwt = refreshRes.accessToken;
      activeRefresh = refreshRes.refreshToken;
    }
  }

  const endpoint = 'https://app.hrone.cloud/api/timeoffice/attendance/regularization/Request';
  const domain = employee.companyDomainCode || 'uharvest';

  const requestDetails: RegularizationRequestItem[] = dates.map((dateStr, idx) => {
    // Midnight in IST is ISO UTC - 5:30 hours (e.g. 2026-08-31 00:00 IST -> 2026-08-30T18:30:00.000Z)
    const istMidnightIso = new Date(`${dateStr}T00:00:00+05:30`).toISOString();

    return {
      rowId: idx + 1,
      attendanceDate: dateStr,
      inDate: istMidnightIso,
      inTimeHours: '09',
      inTimeMintues: '00',
      outDate: istMidnightIso,
      outTimeHours: '18',
      outTimeMintues: '00',
      attendanceRegularizationType: 3,
      attendanceRemarks: remarks,
      file: null,
      calculatedHrs: 'You are marking AR for 9 hours 0 minutes',
      error: '',
      timeIn: `${dateStr}T09:00`,
      timeout: `${dateStr}T18:00`,
    };
  });

  const payload = {
    employeeId: employee.employeeId,
    requestDetails,
    applyRequestSource: 10,
  };

  const makeRequest = async (jwt: string, refresh: string) => {
    return await fetch(endpoint, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.8',
        'accessmode': 'W',
        'content-type': 'application/json',
        'domaincode': domain,
        'origin': 'https://app.hrone.cloud',
        'referer': 'https://app.hrone.cloud/app/request/initiate-attendance-regularization',
        'cookie': `JwtTokenCookie=${jwt}; RefreshTokenCookie=${refresh}`,
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        'x-requested-with': 'https://app.hrone.cloud',
      },
      body: JSON.stringify(payload),
    });
  };

  try {
    let response = await makeRequest(activeJwt, activeRefresh);

    if (response.status === 401 && employee.refreshToken) {
      const refreshRes = await refreshHROneToken(employee);
      if (refreshRes.success && refreshRes.accessToken && refreshRes.refreshToken) {
        activeJwt = refreshRes.accessToken;
        activeRefresh = refreshRes.refreshToken;
        response = await makeRequest(activeJwt, activeRefresh);
      }
    }

    const text = await response.text();
    let responsePayload: unknown;
    try {
      responsePayload = JSON.parse(text);
    } catch {
      responsePayload = text;
    }

    if (response.ok) {
      return {
        success: true,
        httpStatus: response.status,
        message: `Successfully requested attendance regularization for ${dates.length} date(s)`,
        responsePayload,
      };
    }

    const errorMsg =
      typeof responsePayload === 'object' && responsePayload !== null && 'message' in responsePayload
        ? String((responsePayload as Record<string, unknown>).message)
        : `HTTP ${response.status} failed`;

    return {
      success: false,
      httpStatus: response.status,
      responsePayload,
      error: errorMsg,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Network error submitting regularization';
    return {
      success: false,
      error: errorMsg,
    };
  }
}
