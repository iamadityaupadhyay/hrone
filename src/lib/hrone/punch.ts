import { updateEmployeePunchState } from '@/lib/db/employees';
import { addPunchLog } from '@/lib/db/logs';
import { EmployeeProfile, PunchLog } from '@/lib/types/employee';
import { refreshHROneToken } from './token';

export interface PunchExecutionResult {
  success: boolean;
  httpStatus?: number;
  punchTime: string;
  responsePayload?: unknown;
  error?: string;
  logId?: string;
}

/**
 * Returns formatted date-time string in Asia/Kolkata (IST): "YYYY-MM-DDTHH:mm"
 */
export function getISTPunchTime(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Add realistic GPS micro-jitter (+/- ~10-15 meters) so every punch location varies slightly
 */
function getJitteredLocation(latStr?: string, lngStr?: string, accStr?: string) {
  const baseLat = parseFloat(latStr || '28.5004327');
  const baseLng = parseFloat(lngStr || '77.4150811');
  const baseAcc = parseFloat(accStr || '12.126');

  // Random offset up/down by +/- 0.00012 degrees (~12 meters)
  const latJitter = (Math.random() - 0.5) * 0.00024;
  const lngJitter = (Math.random() - 0.5) * 0.00024;
  const accJitter = (Math.random() - 0.5) * 3.0; // +/- 1.5m accuracy variation

  return {
    latitude: (baseLat + latJitter).toFixed(7),
    longitude: (baseLng + lngJitter).toFixed(7),
    geoAccuracy: Math.max(5.0, baseAcc + accJitter).toFixed(3),
  };
}

export async function executePunch(
  employee: EmployeeProfile,
  punchType: 'CHECK_IN' | 'CHECK_OUT',
  triggerType: 'AUTOMATED' | 'MANUAL' = 'MANUAL',
  customPunchTime?: string
): Promise<PunchExecutionResult> {
  let activeJwt = employee.jwtToken;
  let activeRefresh = employee.refreshToken;

  // 1. Check if token is expired or close to expiration (within 2 hours)
  const isTokenExpiring =
    !employee.tokenExpiry ||
    new Date(employee.tokenExpiry).getTime() - Date.now() < 2 * 60 * 60 * 1000;

  if (isTokenExpiring && employee.refreshToken) {
    console.log(`[Punch] Refreshing token for employee ${employee.name} (${employee.employeeId})`);
    const refreshRes = await refreshHROneToken(employee);
    if (refreshRes.success && refreshRes.accessToken && refreshRes.refreshToken) {
      activeJwt = refreshRes.accessToken;
      activeRefresh = refreshRes.refreshToken;
    }
  }

  const endpoint = 'https://app.hrone.cloud/api/timeoffice/mobile/checkin/Attendance/Request';
  const punchTime = customPunchTime || getISTPunchTime();
  const domain = employee.companyDomainCode || 'uharvest';
  const jitteredGeo = getJitteredLocation(employee.latitude, employee.longitude, employee.geoAccuracy);

  const payload = {
    requestType: 'A',
    applyRequestSource: 10,
    employeeId: employee.employeeId,
    latitude: jitteredGeo.latitude,
    longitude: jitteredGeo.longitude,
    geoAccuracy: jitteredGeo.geoAccuracy,
    geoLocation:
      employee.geoLocation || '210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India',
    punchTime,
    remarks: '',
    uploadedPhotoOneName: '',
    uploadedPhotoOnePath: '',
    uploadedPhotoTwoName: '',
    uploadedPhotoTwoPath: '',
    attendanceSource: 'M',
    attendanceType: 'Online',
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
        'referer': 'https://app.hrone.cloud/app',
        'cookie': `JwtTokenCookie=${jwt}; RefreshTokenCookie=${refresh}`,
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        'x-requested-with': 'https://app.hrone.cloud',
      },
      body: JSON.stringify(payload),
    });
  };

  let response: Response;
  let responsePayload: unknown;
  let success = false;
  let httpStatus: number | undefined;
  let errorMessage: string | undefined;

  try {
    response = await makeRequest(activeJwt, activeRefresh);
    httpStatus = response.status;

    // If 401 Unauthorized, attempt immediate token refresh and retry once
    if (httpStatus === 401 && employee.refreshToken) {
      console.log(`[Punch] Got 401. Retrying after token refresh...`);
      const refreshRes = await refreshHROneToken(employee);
      if (refreshRes.success && refreshRes.accessToken && refreshRes.refreshToken) {
        activeJwt = refreshRes.accessToken;
        activeRefresh = refreshRes.refreshToken;
        response = await makeRequest(activeJwt, activeRefresh);
        httpStatus = response.status;
      }
    }

    const text = await response.text();
    try {
      responsePayload = JSON.parse(text);
    } catch {
      responsePayload = text;
    }

    if (response.ok) {
      success = true;
    } else {
      errorMessage =
        typeof responsePayload === 'object' && responsePayload !== null && 'message' in responsePayload
          ? String((responsePayload as Record<string, unknown>).message)
          : `HTTP ${httpStatus} failed`;
    }
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : 'Network error during punch request';
  }

  // Update DB state
  await updateEmployeePunchState(employee.employeeId, punchType, success, punchTime);

  // Log in punch audit collection
  const logData: Omit<PunchLog, '_id'> = {
    employeeId: employee.employeeId,
    employeeName: employee.name,
    punchType,
    punchTime,
    executedAt: new Date().toISOString(),
    success,
    httpStatus,
    responsePayload,
    error: errorMessage,
    triggerType,
  };

  const logId = await addPunchLog(logData);

  return {
    success,
    httpStatus,
    punchTime,
    responsePayload,
    error: errorMessage,
    logId,
  };
}
