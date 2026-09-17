import { EmployeeProfile } from '@/lib/types/employee';
import { refreshHROneToken } from './token';

export interface HolidayRecord {
  employeeId: number;
  year: number;
  date: string; // "YYYY-MM-DD"
  holidayName: string;
  isRestrictedHoliday?: boolean;
  description?: string;
  raw?: unknown;
  updatedAt: string;
}

/**
 * Fetch holiday calendar for an employee from HROne Cloud API
 */
export async function fetchHROneHolidays(
  employee: EmployeeProfile,
  year?: number
): Promise<{ success: boolean; holidays: HolidayRecord[]; error?: string }> {
  let activeJwt = employee.jwtToken;
  let activeRefresh = employee.refreshToken;
  const currentYear = year || new Date().getFullYear();

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

  const endpoint = `https://app.hrone.cloud/api/timeoffice/setting/holiday/Calendar/Employee/${currentYear}/${employee.employeeId}`;
  const domain = employee.companyDomainCode || 'uharvest';

  const makeRequest = async (jwt: string, refresh: string) => {
    return await fetch(endpoint, {
      method: 'GET',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.8',
        'accessmode': 'W',
        'content-type': 'application/json',
        'domaincode': domain,
        'origin': 'https://app.hrone.cloud',
        'referer': 'https://app.hrone.cloud/app/myprofile/my-holiday',
        'cookie': `JwtTokenCookie=${jwt}; RefreshTokenCookie=${refresh}`,
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        'x-requested-with': 'https://app.hrone.cloud',
      },
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
        holidays: [],
        error: `HTTP ${response.status}: Failed to fetch holiday calendar`,
      };
    }

    const json = await response.json();
    const rawList: unknown[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.result)
      ? json.result
      : Array.isArray(json?.rows)
      ? json.rows
      : [];

    const now = new Date().toISOString();
    const holidays: HolidayRecord[] = [];

    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;

      const name = String(rec.holidayName || rec.holidayTitle || rec.title || rec.name || 'Holiday');
      const rawDate = String(rec.fromDate || rec.holidayDate || rec.date || rec.startDate || '');
      
      let dateStr = '';
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().split('T')[0];
        } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
          dateStr = rawDate.slice(0, 10);
        }
      }

      if (dateStr) {
        holidays.push({
          employeeId: employee.employeeId,
          year: currentYear,
          date: dateStr,
          holidayName: name,
          isRestrictedHoliday: Boolean(rec.isRestrictedHoliday || rec.isRestricted),
          description: rec.description ? String(rec.description) : undefined,
          raw: item,
          updatedAt: now,
        });
      }
    }

    return {
      success: true,
      holidays,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error fetching holidays';
    return {
      success: false,
      holidays: [],
      error: errorMsg,
    };
  }
}
